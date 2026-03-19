import re
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.transaction import TransactionClassify, TransactionCreate, TransactionOut
from app.services.ai_service import ai_client

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


@router.get("", response_model=PaginatedResponse[TransactionOut])
async def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    department_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction)
    if status:
        q = q.where(Transaction.status == status)
    if vendor_id:
        q = q.where(Transaction.vendor_id == vendor_id)
    if department_id:
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
