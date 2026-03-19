import uuid
import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Float, Numeric, String, Text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TransactionStatus(str, enum.Enum):
    pending = "pending"
    classified = "classified"
    approved = "approved"
    rejected = "rejected"


class TransactionSource(str, enum.Enum):
    card = "card"
    bank = "bank"
    manual = "manual"
    ocr = "ocr"
    hometax = "hometax"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    external_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="KRW")
    vendor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    account_code: Mapped[str | None] = mapped_column(String(10))
    department_id: Mapped[str | None] = mapped_column(String(36))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.pending)
    ai_classification_confidence: Mapped[float | None] = mapped_column(Float)
    source: Mapped[TransactionSource] = mapped_column(Enum(TransactionSource), default=TransactionSource.manual)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    vendor: Mapped["Vendor | None"] = relationship(back_populates="transactions", foreign_keys=[vendor_id])
