import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    business_registration_no: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    representative: Mapped[str | None] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(100))
    bank_info: Mapped[dict | None] = mapped_column(JSON)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(15, 2))
    department_id: Mapped[str | None] = mapped_column(String(36))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="vendor", foreign_keys="Transaction.vendor_id")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="vendor", foreign_keys="Invoice.vendor_id")
    settlements: Mapped[list["Settlement"]] = relationship(back_populates="vendor", foreign_keys="Settlement.vendor_id")
