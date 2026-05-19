import re
import uuid
from datetime import date as date_cls
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.settlement import Settlement
from app.models.transaction import Transaction, TransactionSource, TransactionStatus
from app.models.user import User, UserRole
from app.models.user_email import UserSecondaryEmail
from app.models.vendor import Vendor
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.transaction import (
    TransactionBulkAssignDepartment,
    TransactionBulkDelete,
    TransactionBulkSetPrepaid,
    TransactionClassify,
    TransactionCreate,
    TransactionOut,
)
from app.services.ai_service import ai_client
from app.services.auth_service import current_user, require_admin
from app.services.tax_invoice_parser import parse_tax_invoice

router = APIRouter()

_BRN_RE = re.compile(r"\b(\d{3}-?\d{2}-?\d{5}|\d{10})\b")


async def _auto_classify(tx_id: str, description: str, amount: float) -> None:
    """백그라운드: 사업자번호 매핑 우선 → AI 엔진 폴백"""
    from app.database import AsyncSessionLocal
    from app.models.vendor import Vendor

    async with AsyncSessionLocal() as db:
        row = await db.execute(select(Transaction).where(Transaction.id == tx_id))
        tx = row.scalar_one_or_none()
        if not tx or tx.status != TransactionStatus.pending:
            return

        # 1단계: 설명에서 사업자번호 패턴 추출 → 등록 공급자 매핑
        matched_vendor = None
        for match in _BRN_RE.finditer(description):
            clean = match.group(0).replace("-", "")
            v_row = await db.execute(
                select(Vendor).where(Vendor.business_registration_no == clean, Vendor.is_active == True)
            )
            matched_vendor = v_row.scalar_one_or_none()
            if matched_vendor:
                break

        if matched_vendor:
            tx.vendor_id = matched_vendor.id
            # 공급자에 담당 부서가 지정돼 있고 거래는 미배정이면 부서 자동 전파
            if matched_vendor.department_id and not tx.department_id:
                tx.department_id = matched_vendor.department_id
            tx.ai_classification_confidence = 1.0
            tx.status = TransactionStatus.classified
            await db.commit()
            return

        # 2단계: AI 엔진 분류 폴백
        result = await ai_client.classify_transaction(description, amount)
        if result and result.get("confidence", 0) >= 0.5:
            tx.account_code = result["account_code"]
            tx.ai_classification_confidence = result["confidence"]
            tx.status = TransactionStatus.classified
            await db.commit()


@router.post("", response_model=ApiResponse[TransactionOut], status_code=201)
async def create_transaction(
    body: TransactionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    # vendor_id / department_id를 str로 변환
    if data.get("vendor_id"):
        data["vendor_id"] = str(data["vendor_id"])
    if data.get("department_id"):
        data["department_id"] = str(data["department_id"])

    tx = Transaction(id=str(uuid.uuid4()), **data)
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    if tx.description:
        background_tasks.add_task(_auto_classify, tx.id, tx.description, float(tx.amount))

    return ApiResponse(success=True, data=TransactionOut.model_validate(tx))


async def _matched_tx_ids(db: AsyncSession) -> set[str]:
    """모든 정산에 묶인 거래 id 집합."""
    r = await db.execute(select(Settlement.matched_transactions))
    ids: set[str] = set()
    for row in r.all():
        ids.update(row[0] or [])
    return ids


@router.get("", response_model=PaginatedResponse[TransactionOut])
async def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    department_id: Optional[str] = None,
    unassigned: bool = Query(False, description="부서 미배정 거래만 (department_id IS NULL)"),
    view: Literal["unprocessed", "settled", "prepaid", "all"] = Query(
        "unprocessed",
        description="기본 'unprocessed'=사전입금X+정산미배정. 'settled'=정산묶임. 'prepaid'=사전입금. 'all'=전체"
    ),
    is_prepaid: Optional[bool] = Query(None, description="(deprecated) view='prepaid' 또는 'all' 사용 권장"),
    date_from: Optional[date_cls] = Query(None, description="작성일자 시작 (YYYY-MM-DD)"),
    date_to: Optional[date_cls] = Query(None, description="작성일자 끝"),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    search: Optional[str] = Query(None, description="품목명/승인번호 부분 일치"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    q = select(Transaction)
    if status:
        q = q.where(Transaction.status == status)
    if vendor_id:
        q = q.where(Transaction.vendor_id == vendor_id)
    if date_from:
        q = q.where(Transaction.transaction_date >= date_from)
    if date_to:
        q = q.where(Transaction.transaction_date <= date_to)
    if amount_min is not None:
        q = q.where(Transaction.amount >= amount_min)
    if amount_max is not None:
        q = q.where(Transaction.amount <= amount_max)

    # view 우선 적용 → 기본 'unprocessed'
    if view == "unprocessed":
        q = q.where(Transaction.is_prepaid.is_(False))
        matched = await _matched_tx_ids(db)
        if matched:
            q = q.where(~Transaction.id.in_(matched))
    elif view == "settled":
        matched = await _matched_tx_ids(db)
        if matched:
            q = q.where(Transaction.id.in_(matched))
        else:
            # 정산 없음 → 빈 결과
            return PaginatedResponse(
                success=True, data=[],
                meta=PaginationMeta(total=0, page=page, limit=limit, pages=0),
            )
    elif view == "prepaid":
        q = q.where(Transaction.is_prepaid.is_(True))
    # 'all' → 추가 필터 없음. is_prepaid 파라미터(legacy)는 view='all'일 때만 적용.
    elif is_prepaid is not None:
        q = q.where(Transaction.is_prepaid.is_(is_prepaid))

    if search:
        like = f"%{search}%"
        q = q.where(
            Transaction.description.ilike(like) | Transaction.external_id.ilike(like)
        )
    # 권한 필터: member는 자기 부서만 조회 가능
    if user.role != UserRole.admin:
        q = q.where(Transaction.department_id == user.department_id) if user.department_id \
            else q.where(Transaction.department_id.is_(None))
    elif unassigned:
        q = q.where(Transaction.department_id.is_(None))
    elif department_id:
        q = q.where(Transaction.department_id == department_id)

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    q = q.offset((page - 1) * limit).limit(limit).order_by(Transaction.transaction_date.desc())
    result = await db.execute(q)
    items = result.scalars().all()

    return PaginatedResponse(
        success=True,
        data=[TransactionOut.model_validate(t) for t in items],
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.get("/department-counts", response_model=ApiResponse[dict])
async def transactions_department_counts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """탭 배지용 부서별 거래 수.

    응답:
        { "total": int, "unassigned": int, "by_department": { dept_id: count, ... } }
    """
    # member는 자기 부서 카운트만, admin은 전체
    if user.role != UserRole.admin:
        if not user.department_id:
            return ApiResponse(success=True, data={"total": 0, "unassigned": 0, "by_department": {}})
        c_r = await db.execute(
            select(func.count()).select_from(Transaction)
            .where(Transaction.department_id == user.department_id)
        )
        my_count = c_r.scalar() or 0
        return ApiResponse(success=True, data={
            "total": int(my_count),
            "unassigned": 0,
            "by_department": {user.department_id: int(my_count)},
        })

    total_r = await db.execute(select(func.count()).select_from(Transaction))
    total = total_r.scalar() or 0

    unassigned_r = await db.execute(
        select(func.count()).select_from(Transaction).where(Transaction.department_id.is_(None))
    )
    unassigned = unassigned_r.scalar() or 0

    grouped_r = await db.execute(
        select(Transaction.department_id, func.count(Transaction.id))
        .where(Transaction.department_id.isnot(None))
        .group_by(Transaction.department_id)
    )
    by_department = {dept_id: count for dept_id, count in grouped_r.all() if dept_id}

    return ApiResponse(
        success=True,
        data={
            "total": int(total),
            "unassigned": int(unassigned),
            "by_department": by_department,
        },
    )


@router.get("/{tx_id}", response_model=ApiResponse[TransactionOut])
async def get_transaction(tx_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    tx = result.scalar_one_or_none()
    if not tx:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Transaction", tx_id)
    return ApiResponse(success=True, data=TransactionOut.model_validate(tx))


@router.patch("/{tx_id}/classify", response_model=ApiResponse[TransactionOut])
async def classify_transaction(
    tx_id: str, body: TransactionClassify, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    tx = result.scalar_one_or_none()
    if not tx:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Transaction", tx_id)

    data = body.model_dump(exclude_none=True)
    if data.get("vendor_id"):
        data["vendor_id"] = str(data["vendor_id"])
    if data.get("department_id"):
        data["department_id"] = str(data["department_id"])

    for key, value in data.items():
        setattr(tx, key, value)
    tx.status = TransactionStatus.classified
    await db.commit()
    await db.refresh(tx)
    return ApiResponse(success=True, data=TransactionOut.model_validate(tx))


@router.delete("/{tx_id}", response_model=ApiResponse[dict])
async def delete_transaction(
    tx_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """단일 거래 삭제. member는 본인 부서 거래만 가능. 정산에 묶인 거래도 삭제되며 matched 목록은 그대로 유지(추후 정리)."""
    r = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="거래를 찾을 수 없습니다.")
    if user.role != UserRole.admin and t.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="다른 부서의 거래는 삭제할 수 없습니다.")
    await db.delete(t)
    await db.commit()
    return ApiResponse(success=True, data={"id": tx_id})


@router.post("/bulk-delete", response_model=ApiResponse[dict])
async def bulk_delete_transactions(
    body: TransactionBulkDelete,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """선택된 거래 일괄 삭제. member는 자기 부서 거래만 (다른 부서는 silently 무시)."""
    if not body.tx_ids:
        return ApiResponse(success=True, data={"deleted": 0})

    q = select(Transaction).where(Transaction.id.in_(body.tx_ids))
    if user.role != UserRole.admin:
        if not user.department_id:
            return ApiResponse(success=True, data={"deleted": 0})
        q = q.where(Transaction.department_id == user.department_id)

    rows = await db.execute(q)
    allowed_ids = [t.id for t in rows.scalars().all()]
    if not allowed_ids:
        return ApiResponse(success=True, data={"deleted": 0})

    await db.execute(delete(Transaction).where(Transaction.id.in_(allowed_ids)))
    await db.commit()
    return ApiResponse(success=True, data={"deleted": len(allowed_ids)})


@router.post("/bulk-set-prepaid", response_model=ApiResponse[dict])
async def bulk_set_prepaid(
    body: TransactionBulkSetPrepaid,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """선택한 거래들의 사전입금 상태를 일괄 토글한다.

    - member는 자기 부서 거래만 변경 가능 (다른 부서 거래 ID는 무시)
    - 사전입금이 된 거래는 정산 매칭에서 자동 제외됨
    """
    if not body.tx_ids:
        return ApiResponse(success=True, data={"updated": 0})

    q = select(Transaction).where(Transaction.id.in_(body.tx_ids))
    if user.role != UserRole.admin:
        if not user.department_id:
            return ApiResponse(success=True, data={"updated": 0})
        q = q.where(Transaction.department_id == user.department_id)

    rows = await db.execute(q)
    allowed_ids = [t.id for t in rows.scalars().all()]
    if not allowed_ids:
        return ApiResponse(success=True, data={"updated": 0})

    # is_prepaid=True 시 paid_at 자동 세팅 (지정값 우선, 없으면 today)
    # is_prepaid=False 시 paid_at NULL로 되돌림
    values: dict = {"is_prepaid": body.is_prepaid}
    if body.is_prepaid:
        values["paid_at"] = body.paid_at if body.paid_at else date_cls.today()
    else:
        values["paid_at"] = None

    await db.execute(update(Transaction).where(Transaction.id.in_(allowed_ids)).values(**values))
    await db.commit()
    return ApiResponse(success=True, data={
        "updated": len(allowed_ids),
        "is_prepaid": body.is_prepaid,
        "paid_at": values.get("paid_at").isoformat() if values.get("paid_at") else None,
    })


@router.post("/bulk-assign-department", response_model=ApiResponse[dict])
async def bulk_assign_department(
    body: TransactionBulkAssignDepartment,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """선택한 거래들의 담당 부서를 일괄 배정한다 (재무팀/admin 전용).

    - department_id=None 이면 미배정으로 되돌림
    - 상태가 pending인 거래는 classified 로 전이
    """
    if not body.tx_ids:
        return ApiResponse(success=True, data={"updated": 0})

    rows = await db.execute(select(Transaction).where(Transaction.id.in_(body.tx_ids)))
    targets = rows.scalars().all()
    if not targets:
        return ApiResponse(success=True, data={"updated": 0})

    new_dept = str(body.department_id) if body.department_id else None
    vendor_ids: set[str] = set()
    for t in targets:
        t.department_id = new_dept
        if new_dept and t.status == TransactionStatus.pending:
            t.status = TransactionStatus.classified
        if t.vendor_id:
            vendor_ids.add(str(t.vendor_id))

    # 거래의 vendor에도 같은 부서 전파 (배정 시에만 — 해제(None)일 땐 vendor 유지)
    vendors_updated = 0
    if new_dept and vendor_ids:
        v_rows = await db.execute(select(Vendor).where(Vendor.id.in_(vendor_ids)))
        for v in v_rows.scalars().all():
            if v.department_id != new_dept:
                v.department_id = new_dept
                vendors_updated += 1

    await db.commit()
    return ApiResponse(success=True, data={
        "updated": len(targets),
        "department_id": new_dept,
        "vendors_updated": vendors_updated,
    })


@router.post("/bulk-classify", response_model=ApiResponse[dict])
async def bulk_classify(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """대기 중인 거래 전체 일괄 분류"""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.status == TransactionStatus.pending)
        .where(Transaction.description.isnot(None))
        .limit(100)
    )
    txs = result.scalars().all()

    for tx in txs:
        background_tasks.add_task(_auto_classify, tx.id, tx.description, float(tx.amount))

    return ApiResponse(success=True, data={"queued": len(txs)})


def _normalize_brn(value: str) -> str:
    """사업자번호에서 하이픈/공백 제거. Vendor.business_registration_no는 unique String(12)."""
    return re.sub(r"[^0-9]", "", value or "")


def _parse_date(value: str) -> date_cls:
    return date_cls.fromisoformat(value)


@router.post("/import-tax-invoice", response_model=ApiResponse[dict])
async def import_tax_invoice(
    file: UploadFile = File(...),
    is_prepaid: bool = Query(False, description="이 파일의 모든 거래를 사전입금으로 표시"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """홈택스 매입 전자세금계산서 엑셀(.xls)을 업로드해 거래로 일괄 등록한다.

    동작:
        - 행마다 공급자(Vendor)를 사업자번호로 조회. 없으면 자동 생성.
        - 승인번호를 external_id로 사용해 이미 적재된 건은 skip (unique 제약).
        - source=hometax, status=classified, ai_classification_confidence=1.0.
        - description은 품목명(없으면 공급자 상호)으로 설정.
        - 부서 매칭 우선순위:
            1) 공급받는자 이메일1 → users.email 또는 보조 이메일 → user.department_id
            2) 공급받는자 이메일2 → users.email 또는 보조 이메일 → user.department_id
            3) (폴백) vendor.department_id
    """
    if not file.filename or not file.filename.lower().endswith(".xls"):
        raise HTTPException(400, "홈택스 매입 세금계산서 엑셀(.xls) 파일을 업로드하세요.")

    content = await file.read()
    try:
        parsed = parse_tax_invoice(content)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # xlrd가 던지는 형식 오류 포함
        raise HTTPException(400, f"엑셀 파싱 실패: {e}") from e

    # 기존 적재된 승인번호 조회 (한 번에)
    approval_nos = [r.approval_no for r in parsed.rows if r.approval_no]
    existing: set[str] = set()
    if approval_nos:
        ex_rows = await db.execute(
            select(Transaction.external_id).where(Transaction.external_id.in_(approval_nos))
        )
        existing = {row[0] for row in ex_rows.all()}

    # 이메일 → 부서ID 매핑을 한 번에 조회 (N+1 회피).
    # 대소문자 무관 매칭을 위해 lower-case로 정규화.
    email_set: set[str] = set()
    for r in parsed.rows:
        for e in (r.buyer_email1, r.buyer_email2):
            e = (e or "").strip().lower()
            if e:
                email_set.add(e)

    email_to_dept: dict[str, str] = {}
    if email_set:
        # primary email 매칭
        u_rows = await db.execute(
            select(User.email, User.department_id).where(
                func.lower(User.email).in_(email_set),
                User.is_active == True,  # noqa: E712
                User.department_id.isnot(None),
            )
        )
        for em, dept in u_rows.all():
            if dept:
                email_to_dept[em.lower()] = dept

        # secondary email 매칭 — primary에서 못 잡은 이메일을 보강
        s_rows = await db.execute(
            select(UserSecondaryEmail.email, User.department_id)
            .join(User, User.id == UserSecondaryEmail.user_id)
            .where(
                func.lower(UserSecondaryEmail.email).in_(email_set),
                User.is_active == True,  # noqa: E712
                User.department_id.isnot(None),
            )
        )
        for em, dept in s_rows.all():
            if dept:
                email_to_dept.setdefault(em.lower(), dept)

    # Vendor 캐시 (BRN → Vendor)
    vendor_cache: dict[str, Vendor] = {}

    imported: list[Transaction] = []
    skipped_duplicate = 0
    skipped_invalid = 0

    for row in parsed.rows:
        if row.approval_no and row.approval_no in existing:
            skipped_duplicate += 1
            continue

        brn = _normalize_brn(row.supplier_brn)
        if not brn or len(brn) != 10:
            # 사업자번호 없는 행 (예: 비사업자) — 거래는 등록하되 vendor 없이
            vendor: Optional[Vendor] = None
        elif brn in vendor_cache:
            vendor = vendor_cache[brn]
        else:
            v_row = await db.execute(
                select(Vendor).where(Vendor.business_registration_no == brn)
            )
            vendor = v_row.scalar_one_or_none()
            if not vendor:
                vendor = Vendor(
                    id=str(uuid.uuid4()),
                    business_registration_no=brn,
                    name=row.supplier_name or "(상호 미상)",
                    representative=row.supplier_ceo or None,
                    is_active=True,
                )
                db.add(vendor)
                await db.flush()
            vendor_cache[brn] = vendor

        try:
            tx_date = _parse_date(row.write_date)
        except ValueError:
            skipped_invalid += 1
            continue

        description = row.item_name or row.supplier_name or "(품목명 없음)"

        # 부서 결정: email1 → email2 → vendor.department_id 폴백
        email1 = (row.buyer_email1 or "").strip().lower()
        email2 = (row.buyer_email2 or "").strip().lower()
        dept_id: str | None = email_to_dept.get(email1) or email_to_dept.get(email2)
        if not dept_id and vendor and vendor.department_id:
            dept_id = vendor.department_id

        tx = Transaction(
            id=str(uuid.uuid4()),
            external_id=row.approval_no or None,
            transaction_date=tx_date,
            amount=row.total_amount,
            supply_amount=row.supply_amount,
            tax_amount=row.tax_amount,
            currency="KRW",
            vendor_id=vendor.id if vendor else None,
            department_id=dept_id,
            description=description,
            buyer_email1=row.buyer_email1 or None,
            buyer_email2=row.buyer_email2 or None,
            status=TransactionStatus.classified if dept_id else TransactionStatus.pending,
            is_prepaid=is_prepaid,
            paid_at=date_cls.today() if is_prepaid else None,
            ai_classification_confidence=1.0 if dept_id else None,
            source=TransactionSource.hometax,
        )
        db.add(tx)
        imported.append(tx)

    await db.commit()

    return ApiResponse(
        success=True,
        data={
            "imported": len(imported),
            "skipped_duplicate": skipped_duplicate,
            "skipped_invalid": skipped_invalid,
            "total_in_file": len(parsed.rows),
            "summary": {
                "buyer_brn": parsed.summary.buyer_brn,
                "buyer_name": parsed.summary.buyer_name,
                "total_amount_sum": parsed.summary.total_amount_sum,
                "supply_amount_sum": parsed.summary.supply_amount_sum,
                "tax_amount_sum": parsed.summary.tax_amount_sum,
            },
        },
    )
