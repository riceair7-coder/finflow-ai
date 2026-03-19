import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.transaction import TransactionSource, TransactionStatus


class TransactionCreate(BaseModel):
    transaction_date: date
    amount: float
    currency: str = "KRW"
    vendor_id: Optional[uuid.UUID] = None
    account_code: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    source: TransactionSource = TransactionSource.manual
    external_id: Optional[str] = None


class TransactionClassify(BaseModel):
    account_code: str
    department_id: Optional[uuid.UUID] = None
    vendor_id: Optional[uuid.UUID] = None


class TransactionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    external_id: Optional[str] = None
    transaction_date: date
    amount: float
    currency: str
    vendor_id: Optional[uuid.UUID] = None
    account_code: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    status: TransactionStatus
    ai_classification_confidence: Optional[float] = None
    source: TransactionSource
    created_at: datetime
    updated_at: datetime
