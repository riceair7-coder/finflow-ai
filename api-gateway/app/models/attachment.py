"""정산 첨부파일 — 거래명세서, 영수증, 견적서 등."""
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SettlementAttachment(Base):
    __tablename__ = "settlement_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    settlement_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("settlements.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    kind: Mapped[str | None] = mapped_column(String(40))
    uploaded_by: Mapped[str | None] = mapped_column(String(36))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
