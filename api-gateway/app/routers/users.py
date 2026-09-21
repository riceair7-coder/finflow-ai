"""사용자 관리 — admin 전용."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.user_email import UserSecondaryEmail
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.auth_service import hash_password, require_admin

router = APIRouter()


def _normalize_emails(emails: list[str]) -> list[str]:
    """공백 제거 + 소문자 + 중복 제거(순서 보존). 빈 문자열은 제외."""
    seen: dict[str, None] = {}
    for e in emails:
        v = (e or "").strip().lower()
        if v:
            seen.setdefault(v, None)
    return list(seen.keys())


async def _fetch_secondary_emails(
    db: AsyncSession, user_ids: list[str]
) -> dict[str, list[str]]:
    """user_id → [sorted secondary emails] 매핑."""
    if not user_ids:
        return {}
    rows = await db.execute(
        select(UserSecondaryEmail.user_id, UserSecondaryEmail.email)
        .where(UserSecondaryEmail.user_id.in_(user_ids))
    )
    by_user: dict[str, list[str]] = {}
    for uid, em in rows.all():
        by_user.setdefault(uid, []).append(em)
    for uid in by_user:
        by_user[uid].sort()
    return by_user


def _user_out(user: User, secondary: list[str]) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        department_id=user.department_id,
        role=user.role,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        secondary_emails=secondary,
    )


async def _check_email_uniqueness(
    db: AsyncSession,
    emails: list[str],
    *,
    exclude_user_id: Optional[str] = None,
) -> None:
    """주어진 email들이 어떤 user의 primary 또는 secondary로도 이미 존재하지 않는지 검증.

    exclude_user_id가 주어지면 그 사용자의 기존 secondary는 무시(자기 자신 갱신 케이스).
    primary email은 본 모듈에서 별도 처리 — 호출자가 primary 충돌 분기 담당.
    """
    if not emails:
        return

    # primary email 충돌
    q_primary = select(User.email).where(func.lower(User.email).in_(emails))
    r_primary = await db.execute(q_primary)
    hit = r_primary.scalar()
    if hit:
        raise HTTPException(
            status_code=409,
            detail=f"이메일 '{hit}'은(는) 이미 다른 사용자의 주 이메일로 등록되어 있습니다.",
        )

    # secondary email 충돌 (자기 자신 제외)
    q_sec = select(UserSecondaryEmail.email).where(
        func.lower(UserSecondaryEmail.email).in_(emails),
    )
    if exclude_user_id:
        q_sec = q_sec.where(UserSecondaryEmail.user_id != exclude_user_id)
    r_sec = await db.execute(q_sec)
    hit = r_sec.scalar()
    if hit:
        raise HTTPException(
            status_code=409,
            detail=f"이메일 '{hit}'은(는) 이미 다른 사용자의 보조 이메일로 등록되어 있습니다.",
        )


@router.get("", response_model=PaginatedResponse[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    is_active: Optional[bool] = None,
    department_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    q = select(User)
    if is_active is not None:
        q = q.where(User.is_active == is_active)
    if department_id:
        q = q.where(User.department_id == department_id)

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    q = q.offset((page - 1) * limit).limit(limit).order_by(User.email)
    result = await db.execute(q)
    items = result.scalars().all()

    sec_map = await _fetch_secondary_emails(db, [u.id for u in items])
    data = [_user_out(u, sec_map.get(u.id, [])) for u in items]

    return PaginatedResponse(
        success=True,
        data=data,
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.post("", response_model=ApiResponse[UserOut], status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    primary = str(body.email).strip()
    primary_lower = primary.lower()

    existing = await db.execute(
        select(User).where(func.lower(User.email) == primary_lower)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다.")

    sec_emails = _normalize_emails(body.secondary_emails)
    if primary_lower in sec_emails:
        raise HTTPException(
            status_code=400,
            detail="보조 이메일이 주 이메일과 동일합니다.",
        )
    await _check_email_uniqueness(db, sec_emails)

    user = User(
        id=str(uuid.uuid4()),
        email=primary,
        hashed_password=hash_password(body.password),
        name=body.name,
        department_id=body.department_id,
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    for se in sec_emails:
        db.add(UserSecondaryEmail(id=str(uuid.uuid4()), user_id=user.id, email=se))

    await db.commit()
    await db.refresh(user)

    return ApiResponse(success=True, data=_user_out(user, sec_emails))


@router.patch("/{user_id}", response_model=ApiResponse[UserOut])
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    data = body.model_dump(exclude_unset=True)

    # admin 자기 자신의 role/is_active 변경은 금지 (락아웃 방지)
    if user.id == admin.id:
        if "role" in data and data["role"] != UserRole.admin:
            raise HTTPException(status_code=400, detail="본인 역할을 강등할 수 없습니다.")
        if "is_active" in data and not data["is_active"]:
            raise HTTPException(status_code=400, detail="본인 계정을 비활성화할 수 없습니다.")

    if "password" in data and data["password"]:
        user.hashed_password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)

    # 보조 이메일 갱신은 별도 처리 — secondary_emails가 explicit하게 들어온 경우만
    if "secondary_emails" in data:
        new_sec = _normalize_emails(data.pop("secondary_emails") or [])
        if user.email.lower() in new_sec:
            raise HTTPException(
                status_code=400,
                detail="보조 이메일이 주 이메일과 동일합니다.",
            )
        await _check_email_uniqueness(db, new_sec, exclude_user_id=user.id)
        # 전체 교체 — 기존 삭제 후 새로 삽입
        await db.execute(
            sa_delete(UserSecondaryEmail).where(UserSecondaryEmail.user_id == user.id)
        )
        for se in new_sec:
            db.add(UserSecondaryEmail(id=str(uuid.uuid4()), user_id=user.id, email=se))

    for k, v in data.items():
        setattr(user, k, v)

    await db.commit()
    await db.refresh(user)

    sec_map = await _fetch_secondary_emails(db, [user.id])
    return ApiResponse(success=True, data=_user_out(user, sec_map.get(user.id, [])))


@router.delete("/{user_id}", response_model=ApiResponse[dict])
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="본인 계정을 비활성화할 수 없습니다.")
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.is_active = False
    await db.commit()
    return ApiResponse(success=True, data={"id": user_id})


@router.delete("/{user_id}/permanent", response_model=ApiResponse[dict])
async def permanent_delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """영구 삭제(hard delete). 비활성 사용자만 대상. 본인 계정은 금지.

    삭제 후 같은 email로 재등록 가능. 보조 이메일은 FK CASCADE로 함께 삭제.
    거래의 buyer_email1/2/department_id는 그대로 남아 과거 매칭 이력은 보존된다.
    """
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="본인 계정은 삭제할 수 없습니다.")
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.is_active:
        raise HTTPException(
            status_code=400,
            detail="활성 상태의 사용자는 영구 삭제할 수 없습니다. 먼저 비활성화하세요.",
        )
    await db.delete(user)
    await db.commit()
    return ApiResponse(success=True, data={"id": user_id})
