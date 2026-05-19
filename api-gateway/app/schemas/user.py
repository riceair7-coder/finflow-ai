from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    name: Optional[str] = None
    department_id: Optional[str] = None
    role: UserRole = UserRole.member


class UserUpdate(BaseModel):
    name: Optional[str] = None
    department_id: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    email: str
    name: Optional[str] = None
    department_id: Optional[str] = None
    role: UserRole
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
