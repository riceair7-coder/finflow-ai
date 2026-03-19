import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class VendorCreate(BaseModel):
    business_registration_no: str
    name: str
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    bank_info: Optional[dict] = None
    payment_terms_days: int = 30
    credit_limit: Optional[float] = None
    department_id: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    bank_info: Optional[dict] = None
    payment_terms_days: Optional[int] = None
    credit_limit: Optional[float] = None
    department_id: Optional[str] = None
    is_active: Optional[bool] = None


class VendorOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    business_registration_no: str
    name: str
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    bank_info: Optional[dict] = None
    payment_terms_days: int
    credit_limit: Optional[float] = None
    department_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
