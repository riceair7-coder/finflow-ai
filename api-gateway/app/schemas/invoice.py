import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.invoice import InvoiceStatus


class InvoiceItemSchema(BaseModel):
    description: str
    quantity: float
    unit_price: float
    amount: float


class InvoiceCreate(BaseModel):
    vendor_id: uuid.UUID
    issue_date: date
    due_date: date
    items: list[InvoiceItemSchema]
    notes: Optional[str] = None


class InvoiceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    invoice_no: str
    vendor_id: uuid.UUID
    issue_date: date
    due_date: date
    subtotal: float
    tax_amount: float
    total_amount: float
    status: InvoiceStatus
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None
    items: Optional[list] = None
    created_at: datetime
    updated_at: datetime
