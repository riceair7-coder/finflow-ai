import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.settlement import SettlementStatus


class SettlementCreate(BaseModel):
    vendor_id: uuid.UUID
    period_start: date
    period_end: date
    notes: Optional[str] = None


class SettlementUpdate(BaseModel):
    notes: Optional[str] = None


class SettlementReview(BaseModel):
    notes: Optional[str] = None


class SettlementOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    settlement_no: str
    vendor_id: uuid.UUID
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
