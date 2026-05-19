"""로그인 / 내 정보."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.user_email import UserSecondaryEmail
from app.schemas.common import ApiResponse
from app.schemas.user import LoginRequest, LoginResponse, PasswordChangeRequest, UserOut
from app.services.auth_service import (
    create_access_token,
    current_user,
    hash_password,
    verify_password,
)

router = APIRouter()


async def _user_out_with_secondary(db: AsyncSession, user: User) -> UserOut:
    rows = await db.execute(
        select(UserSecondaryEmail.email).where(UserSecondaryEmail.user_id == user.id)
    )
    secondary = sorted([r[0] for r in rows.all()])
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


@router.post("/login", response_model=ApiResponse[LoginResponse])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    row = await db.execute(select(User).where(User.email == str(body.email)))
    user = row.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    # DateTime 컬럼이 TIMESTAMP WITHOUT TIME ZONE — naive UTC로 저장
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(sub=user.id, role=user.role.value, department_id=user.department_id)
    user_out = await _user_out_with_secondary(db, user)
    return ApiResponse(
        success=True,
        data=LoginResponse(access_token=token, user=user_out),
    )


@router.get("/me", response_model=ApiResponse[UserOut])
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ApiResponse(success=True, data=await _user_out_with_secondary(db, user))


@router.post("/change-password", response_model=ApiResponse[dict])
async def change_password(
    body: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    """로그인 사용자가 본인 비밀번호를 변경한다.

    - 현재 비밀번호 검증 필수
    - 새 비밀번호는 최소 8자 (schema 검증)
    - 동일 비밀번호로의 변경은 거부
    """
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")
    if verify_password(body.new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="새 비밀번호가 현재 비밀번호와 동일합니다.")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return ApiResponse(success=True, data={"id": user.id})
