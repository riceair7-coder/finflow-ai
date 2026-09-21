"""인증 헬퍼: 비밀번호 해시, JWT 발급/검증, current_user 의존성."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# tokenUrl은 OpenAPI 문서용 — 실제 라우팅은 routers/auth.py에서 처리
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(sub: str, role: str, department_id: Optional[str]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": sub,
        "role": role,
        "department_id": department_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


async def _resolve_user(token: Optional[str], db: AsyncSession) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    row = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    return row.scalar_one_or_none()


async def current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """필수: 인증된 사용자가 아니면 401."""
    user = await _resolve_user(token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """선택: 없으면 None, 있으면 검증."""
    return await _resolve_user(token, db)


def require_admin(user: User = Depends(current_user)) -> User:
    """admin 권한 가드."""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return user
