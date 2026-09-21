import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.transaction import TransactionSource, TransactionStatus


class TransactionCreate(BaseModel):
    transaction_date: date
    amount: float
    supply_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    currency: str = "KRW"
    vendor_id: Optional[uuid.UUID] = None
    account_code: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    source: TransactionSource = TransactionSource.manual
    external_id: Optional[str] = None
    is_prepaid: bool = False
    paid_at: Optional[date] = None


class TransactionClassify(BaseModel):
    account_code: str
    department_id: Optional[uuid.UUID] = None
    vendor_id: Optional[uuid.UUID] = None


class TransactionBulkSetPrepaid(BaseModel):
    tx_ids: list[str]
    is_prepaid: bool
    paid_at: Optional[date] = None  # is_prepaid=True 시 기본 = today


class TransactionBulkSetTarget(BaseModel):
    tx_ids: list[str]
    is_settlement_target: bool


class TransactionBulkDelete(BaseModel):
    tx_ids: list[str]


class TransactionBulkAssignDepartment(BaseModel):
    tx_ids: list[str]
    department_id: Optional[uuid.UUID] = None  # None이면 미배정으로 되돌림


class TransactionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    external_id: Optional[str] = None
    transaction_date: date
    amount: float
    supply_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    currency: str
    vendor_id: Optional[uuid.UUID] = None
    account_code: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    buyer_email1: Optional[str] = None
    buyer_email2: Optional[str] = None
    status: TransactionStatus
    is_prepaid: bool = False
    is_settlement_target: bool = False
    is_settled: bool = False  # 정산관리로 넘어감(정산 묶임) 여부 — 응답 시 계산되는 파생값
    paid_at: Optional[date] = None
    ai_classification_confidence: Optional[float] = None
    source: TransactionSource
    created_at: datetime
    updated_at: datetime
