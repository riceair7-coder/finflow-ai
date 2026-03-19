import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.settlement import Settlement, SettlementStatus
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.settlement import SettlementCreate, SettlementReview


class SettlementService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def create(self, data: SettlementCreate) -> Settlement:
        # Aggregate approved transactions for the vendor in the given period
        result = await self._db.execute(
            select(Transaction).where(
                Transaction.vendor_id == str(data.vendor_id),
                Transaction.transaction_date.between(data.period_start, data.period_end),
                Transaction.status == TransactionStatus.approved,
            )
        )
        transactions = result.scalars().all()

        total = float(sum(t.amount for t in transactions))
        matched_ids = [str(t.id) for t in transactions]
        settlement_no = f"STL-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

        settlement = Settlement(
            settlement_no=settlement_no,
            vendor_id=data.vendor_id,
            period_start=data.period_start,
            period_end=data.period_end,
            total_amount=total,
            matched_transactions=matched_ids,
            notes=data.notes,
        )
        self._db.add(settlement)
        await self._db.commit()
        await self._db.refresh(settlement)
        return settlement

    async def get(self, settlement_id) -> Settlement:
        result = await self._db.execute(select(Settlement).where(Settlement.id == str(settlement_id)))
        settlement = result.scalar_one_or_none()
        if not settlement:
            raise NotFoundError("Settlement", str(settlement_id))
        return settlement

    async def list(
        self,
        page: int,
        limit: int,
        vendor_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
    ) -> tuple[list[Settlement], int]:
        q = select(Settlement)
        if vendor_id:
            q = q.where(Settlement.vendor_id == vendor_id)
        if status:
            q = q.where(Settlement.status == status)

        total_result = await self._db.execute(select(func.count()).select_from(q.subquery()))
        total = total_result.scalar() or 0

        q = q.offset((page - 1) * limit).limit(limit)
        result = await self._db.execute(q)
        return result.scalars().all(), total

    async def approve(self, settlement_id: uuid.UUID, data: SettlementReview) -> Settlement:
        settlement = await self.get(settlement_id)
        if settlement.status not in (SettlementStatus.pending, SettlementStatus.reviewing):
            raise ConflictError(f"Cannot approve settlement in status: {settlement.status}")
        settlement.status = SettlementStatus.approved
        settlement.approved_at = datetime.now(timezone.utc)
        if data.notes:
            settlement.notes = data.notes
        await self._db.commit()
        await self._db.refresh(settlement)

        from app.websocket.manager import manager
        await manager.broadcast("settlement_approved", {
            "id": str(settlement.id),
            "settlement_no": settlement.settlement_no,
            "total_amount": float(settlement.total_amount),
        })
        return settlement

    async def reject(self, settlement_id: uuid.UUID, data: SettlementReview) -> Settlement:
        settlement = await self.get(settlement_id)
        if settlement.status == SettlementStatus.paid:
            raise ConflictError("Cannot reject a paid settlement")
        settlement.status = SettlementStatus.rejected
        if data.notes:
            settlement.notes = data.notes
        await self._db.commit()
        await self._db.refresh(settlement)

        from app.websocket.manager import manager
        await manager.broadcast("settlement_rejected", {
            "id": str(settlement.id),
            "settlement_no": settlement.settlement_no,
        })
        return settlement
