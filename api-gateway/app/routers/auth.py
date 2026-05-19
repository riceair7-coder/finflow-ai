"""로그인 / 내 정보."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import LoginRequest, LoginResponse, UserOut
from app.services.auth_service import (
    create_access_token,
    current_user,
    verify_password,
)

router = APIRouter()


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
    return ApiResponse(
        success=True,
        data=LoginResponse(access_token=token, user=UserOut.model_validate(user)),
    )


@router.get("/me", response_model=ApiResponse[UserOut])
async def me(user: User = Depends(current_user)):
    return ApiResponse(success=True, data=UserOut.model_validate(user))
