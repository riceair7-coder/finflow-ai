import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.settlement import SettlementStatus


class SettlementCreate(BaseModel):
    vendor_id: uuid.UUID
    # 기간을 지정하지 않으면 해당 공급자의 모든 미정산 거래를 묶고,
    # 정산기간은 매칭 거래의 최저~최고일자로 자동 설정한다.
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    notes: Optional[str] = None


class SettlementBulkCreate(BaseModel):
    vendor_ids: list[str]
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    notes: Optional[str] = None


class IssueInvoiceFromSettlements(BaseModel):
    settlement_ids: list[str]
    notes: Optional[str] = None
    due_date_days: int = 30


class SettlementUpdate(BaseModel):
    notes: Optional[str] = None


class SettlementReview(BaseModel):
    notes: Optional[str] = None


class SettlementOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    settlement_no: str
    vendor_id: uuid.UUID
    department_id: Optional[str] = None
    invoice_id: Optional[str] = None
    period_start: date
    period_end: date
    total_amount: float
    matched_transactions: Optional[list] = None
    status: SettlementStatus
    reviewer_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
