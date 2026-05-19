import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.settlement import Settlement, SettlementStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.vendor import Vendor
from app.schemas.settlement import SettlementCreate, SettlementReview


class SettlementService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def _create_one(
        self,
        vendor_id: str,
        period_start=None,
        period_end=None,
        notes: Optional[str] = None,
        seq: int = 0,
    ) -> Settlement:
        """단일 정산 생성 (트랜잭션 commit은 호출자가 담당).

        period_start/period_end가 None이면 해당 공급자의 모든 미정산 거래를 묶고,
        정산기간은 매칭 거래의 최저~최고일자로 자동 설정한다.
        """
        v_row = await self._db.execute(select(Vendor).where(Vendor.id == vendor_id))
        vendor = v_row.scalar_one_or_none()
        if not vendor:
            raise NotFoundError("Vendor", vendor_id)

        # 이미 다른 정산에 묶인 거래는 제외하기 위해 모든 정산의 matched_transactions를 조회
        existing_r = await self._db.execute(select(Settlement.matched_transactions))
        already_matched: set[str] = set()
        for row in existing_r.all():
            ids = row[0] or []
            already_matched.update(ids)

        # 사전입금/이미정산 거래는 제외, classified/approved만 후보
        tx_q = select(Transaction).where(
            Transaction.vendor_id == vendor_id,
            Transaction.status.in_([TransactionStatus.approved, TransactionStatus.classified]),
            Transaction.is_prepaid.is_(False),
        )
        if period_start is not None:
            tx_q = tx_q.where(Transaction.transaction_date >= period_start)
        if period_end is not None:
            tx_q = tx_q.where(Transaction.transaction_date <= period_end)

        result = await self._db.execute(tx_q)
        transactions = [t for t in result.scalars().all() if str(t.id) not in already_matched]

        total = float(sum(t.amount for t in transactions))
        matched_ids = [str(t.id) for t in transactions]
        # 기간을 명시하지 않은 경우 매칭 거래의 min/max로 자동
        if transactions:
            tx_dates = [t.transaction_date for t in transactions]
            auto_start = min(tx_dates)
            auto_end = max(tx_dates)
            final_start = period_start if period_start is not None else auto_start
            final_end = period_end if period_end is not None else auto_end
        else:
            from datetime import date as _date_cls
            today = _date_cls.today()
            final_start = period_start if period_start is not None else today
            final_end = period_end if period_end is not None else today

        # 순번을 붙여 동시 호출 시 settlement_no 충돌 방지
        suffix = f"-{seq:02d}" if seq > 0 else ""
        settlement_no = f"STL-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{suffix}"

        settlement = Settlement(
            settlement_no=settlement_no,
            vendor_id=vendor_id,
            department_id=vendor.department_id,
            period_start=final_start,
            period_end=final_end,
            total_amount=total,
            matched_transactions=matched_ids,
            notes=notes,
        )
        self._db.add(settlement)
        return settlement

    async def create(self, data: SettlementCreate) -> Settlement:
        settlement = await self._create_one(
            vendor_id=str(data.vendor_id),
            period_start=data.period_start,
            period_end=data.period_end,
            notes=data.notes,
        )
        await self._db.commit()
        await self._db.refresh(settlement)
        return settlement

    async def bulk_create(
        self,
        vendor_ids: list[str],
        period_start,
        period_end,
        notes: Optional[str] = None,
    ) -> list[Settlement]:
        """여러 공급자에 대해 같은 기간의 정산을 일괄 생성."""
        created: list[Settlement] = []
        for i, vid in enumerate(vendor_ids, start=1):
            s = await self._create_one(
                vendor_id=vid,
                period_start=period_start,
                period_end=period_end,
                notes=notes,
                seq=i,
            )
            created.append(s)
        await self._db.commit()
        for s in created:
            await self._db.refresh(s)
        return created

    async def unsettled_by_vendor(
        self,
        department_id: Optional[str] = None,
    ) -> list[dict]:
        """공급자별 미정산 거래 잔액.

        - 사전입금 거래 제외
        - 이미 어떤 정산의 matched_transactions에 포함된 거래도 제외
        - department_id로 필터(member 자기 부서 한정용)
        """
        existing_r = await self._db.execute(select(Settlement.matched_transactions))
        already_matched: set[str] = set()
        for row in existing_r.all():
            ids = row[0] or []
            already_matched.update(ids)

        q = select(Transaction).where(
            Transaction.is_prepaid.is_(False),
            Transaction.status.in_([TransactionStatus.approved, TransactionStatus.classified]),
            Transaction.vendor_id.isnot(None),
        )
        if department_id:
            q = q.where(Transaction.department_id == department_id)

        txs_r = await self._db.execute(q)
        groups: dict[str, dict] = {}
        for t in txs_r.scalars().all():
            if str(t.id) in already_matched:
                continue
            v = t.vendor_id
            if v not in groups:
                groups[v] = {
                    "vendor_id": v,
                    "department_id": t.department_id,
                    "count": 0,
                    "total_amount": 0.0,
                    "earliest_date": None,
                    "latest_date": None,
                }
            g = groups[v]
            g["count"] += 1
            g["total_amount"] += float(t.amount)
            if g["earliest_date"] is None or t.transaction_date < g["earliest_date"]:
                g["earliest_date"] = t.transaction_date
            if g["latest_date"] is None or t.transaction_date > g["latest_date"]:
                g["latest_date"] = t.transaction_date

        # 큰 금액 먼저
        items = sorted(groups.values(), key=lambda g: g["total_amount"], reverse=True)
        # date를 isoformat 문자열로
        for g in items:
            if g["earliest_date"]:
                g["earliest_date"] = g["earliest_date"].isoformat()
            if g["latest_date"]:
                g["latest_date"] = g["latest_date"].isoformat()
        return items

    async def prepaid_by_vendor(
        self,
        department_id: Optional[str] = None,
    ) -> list[dict]:
        """공급자별 사전입금 거래 집계.

        - is_prepaid=True 거래만
        - department_id로 필터(member 자기 부서 한정용)
        - paid_at의 min/max도 함께 반환
        """
        q = select(Transaction).where(
            Transaction.is_prepaid.is_(True),
            Transaction.vendor_id.isnot(None),
        )
        if department_id:
            q = q.where(Transaction.department_id == department_id)

        txs_r = await self._db.execute(q)
        groups: dict[str, dict] = {}
        for t in txs_r.scalars().all():
            v = t.vendor_id
            if v not in groups:
                groups[v] = {
                    "vendor_id": v,
                    "department_id": t.department_id,
                    "count": 0,
                    "total_amount": 0.0,
                    "earliest_date": None,
                    "latest_date": None,
                    "earliest_paid_at": None,
                    "latest_paid_at": None,
                }
            g = groups[v]
            g["count"] += 1
            g["total_amount"] += float(t.amount)
            if g["earliest_date"] is None or t.transaction_date < g["earliest_date"]:
                g["earliest_date"] = t.transaction_date
            if g["latest_date"] is None or t.transaction_date > g["latest_date"]:
                g["latest_date"] = t.transaction_date
            if t.paid_at is not None:
                if g["earliest_paid_at"] is None or t.paid_at < g["earliest_paid_at"]:
                    g["earliest_paid_at"] = t.paid_at
                if g["latest_paid_at"] is None or t.paid_at > g["latest_paid_at"]:
                    g["latest_paid_at"] = t.paid_at

        items = sorted(groups.values(), key=lambda g: g["total_amount"], reverse=True)
        for g in items:
            for k in ("earliest_date", "latest_date", "earliest_paid_at", "latest_paid_at"):
                if g[k]:
                    g[k] = g[k].isoformat()
        return items

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
        department_id: Optional[str] = None,
        unassigned: bool = False,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        amount_min: Optional[float] = None,
        amount_max: Optional[float] = None,
        search: Optional[str] = None,
    ) -> tuple[list[Settlement], int]:
        q = select(Settlement)
        if vendor_id:
            q = q.where(Settlement.vendor_id == vendor_id)
        if status:
            q = q.where(Settlement.status == status)
        if unassigned:
            q = q.where(Settlement.department_id.is_(None))
        elif department_id:
            q = q.where(Settlement.department_id == department_id)
        # 정산기간이 사용자가 지정한 범위와 겹치는 정산
        if date_from:
            q = q.where(Settlement.period_end >= date_from)
        if date_to:
            q = q.where(Settlement.period_start <= date_to)
        if amount_min is not None:
            q = q.where(Settlement.total_amount >= amount_min)
        if amount_max is not None:
            q = q.where(Settlement.total_amount <= amount_max)
        if search:
            q = q.where(Settlement.settlement_no.ilike(f"%{search}%"))

        total_result = await self._db.execute(select(func.count()).select_from(q.subquery()))
        total = total_result.scalar() or 0

        q = q.offset((page - 1) * limit).limit(limit).order_by(Settlement.created_at.desc())
        result = await self._db.execute(q)
        return result.scalars().all(), total

    async def department_counts(self) -> dict:
        total_r = await self._db.execute(select(func.count()).select_from(Settlement))
        total = total_r.scalar() or 0

        unassigned_r = await self._db.execute(
            select(func.count()).select_from(Settlement).where(Settlement.department_id.is_(None))
        )
        unassigned = unassigned_r.scalar() or 0

        grouped_r = await self._db.execute(
            select(Settlement.department_id, func.count(Settlement.id))
            .where(Settlement.department_id.isnot(None))
            .group_by(Settlement.department_id)
        )
        by_department = {dept_id: count for dept_id, count in grouped_r.all() if dept_id}

        return {"total": int(total), "unassigned": int(unassigned), "by_department": by_department}

    async def approve(self, settlement_id: uuid.UUID, data: SettlementReview) -> Settlement:
        settlement = await self.get(settlement_id)
        if settlement.status not in (SettlementStatus.pending, SettlementStatus.reviewing):
            raise ConflictError(f"Cannot approve settlement in status: {settlement.status}")
        settlement.status = SettlementStatus.approved
        # DateTime 컬럼은 TIMESTAMP WITHOUT TIME ZONE — naive UTC로 저장
        settlement.approved_at = datetime.now(timezone.utc).replace(tzinfo=None)
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
