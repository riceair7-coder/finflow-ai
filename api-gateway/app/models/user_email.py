"""사용자 보조 이메일 — 한 사용자가 여러 수령 이메일을 가질 수 있게 한다.

매입세금계산서 import 시 '공급받는자 이메일1/2'가 primary email뿐 아니라
secondary email 중 하나와 일치해도 그 사용자의 department_id로 부서 매칭.

email은 글로벌 UNIQUE — 두 사용자가 같은 이메일을 secondary로 등록 못 함.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSecondaryEmail(Base):
    __tablename__ = "user_secondary_emails"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
