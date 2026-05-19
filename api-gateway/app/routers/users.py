"""사용자 관리 — admin 전용."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.auth_service import hash_password, require_admin

router = APIRouter()


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

    return PaginatedResponse(
        success=True,
        data=[UserOut.model_validate(u) for u in items],
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.post("", response_model=ApiResponse[UserOut], status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    existing = await db.execute(select(User).where(User.email == str(body.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다.")

    user = User(
        id=str(uuid.uuid4()),
        email=str(body.email),
        hashed_password=hash_password(body.password),
        name=body.name,
        department_id=body.department_id,
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return ApiResponse(success=True, data=UserOut.model_validate(user))


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

    for k, v in data.items():
        setattr(user, k, v)

    await db.commit()
    await db.refresh(user)
    return ApiResponse(success=True, data=UserOut.model_validate(user))


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
