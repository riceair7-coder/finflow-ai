import uuid
import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Numeric, String, Text, func, ForeignKey
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SettlementStatus(str, enum.Enum):
    pending = "pending"
    reviewing = "reviewing"
    approved = "approved"
    rejected = "rejected"
    paid = "paid"


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    settlement_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    department_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # 통합 청구 지원: Invoice 1:N Settlement (한 청구서가 여러 정산을 묶을 수 있음)
    invoice_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    matched_transactions: Mapped[list | None] = mapped_column(JSON)
    status: Mapped[SettlementStatus] = mapped_column(Enum(SettlementStatus), default=SettlementStatus.pending)
    reviewer_id: Mapped[str | None] = mapped_column(String(36))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    vendor: Mapped["Vendor"] = relationship(back_populates="settlements", foreign_keys=[vendor_id])
