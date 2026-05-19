import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.invoice import Invoice, InvoiceStatus
from app.models.settlement import Settlement, SettlementStatus
from app.models.vendor import Vendor
from app.schemas.invoice import InvoiceCreate


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def create(self, data: InvoiceCreate) -> Invoice:
        items = [item.model_dump() for item in data.items]
        subtotal = sum(item["amount"] for item in items)
        tax_amount = round(subtotal * 0.1, 2)  # VAT 10%
        total_amount = subtotal + tax_amount
        # 같은 초에 여러 호출 시 UNIQUE 충돌 방지 — microsecond + random suffix
        invoice_no = (
            f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
            f"-{secrets.token_hex(2).upper()}"
        )

        invoice = Invoice(
            invoice_no=invoice_no,
            vendor_id=data.vendor_id,
            issue_date=data.issue_date,
            due_date=data.due_date,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=total_amount,
            items=items,
            notes=data.notes,
        )
        self._db.add(invoice)
        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice

    async def get(self, invoice_id) -> Invoice:
        result = await self._db.execute(select(Invoice).where(Invoice.id == str(invoice_id)))
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError("Invoice", str(invoice_id))
        return invoice

    async def send(self, invoice_id: uuid.UUID) -> Invoice:
        invoice = await self.get(invoice_id)
        if invoice.status != InvoiceStatus.draft:
            raise ConflictError(f"Cannot send invoice in status: {invoice.status}")
        invoice.status = InvoiceStatus.sent
        invoice.sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice

    async def mark_paid(self, invoice_id: uuid.UUID) -> Invoice:
        invoice = await self.get(invoice_id)
        if invoice.status not in (InvoiceStatus.sent, InvoiceStatus.overdue):
            raise ConflictError(f"Cannot mark as paid invoice in status: {invoice.status}")
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
        # 묶인 정산도 결제완료(paid)로 자동 전환
        await self._db.execute(
            update(Settlement)
            .where(Settlement.invoice_id == invoice.id)
            .values(status=SettlementStatus.paid)
        )
        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice

    async def list_with_filter(
        self,
        page: int,
        limit: int,
        department_id: str | None = None,
        unassigned: bool = False,
        status: str | None = None,
        vendor_id: str | None = None,
        date_from=None,
        date_to=None,
        amount_min: float | None = None,
        amount_max: float | None = None,
        search: str | None = None,
    ) -> tuple[list[Invoice], int]:
        q = select(Invoice)
        if status:
            q = q.where(Invoice.status == status)
        if vendor_id:
            q = q.where(Invoice.vendor_id == vendor_id)
        if unassigned:
            q = q.where(Invoice.department_id.is_(None))
        elif department_id:
            q = q.where(Invoice.department_id == department_id)
        if date_from:
            q = q.where(Invoice.issue_date >= date_from)
        if date_to:
            q = q.where(Invoice.issue_date <= date_to)
        if amount_min is not None:
            q = q.where(Invoice.total_amount >= amount_min)
        if amount_max is not None:
            q = q.where(Invoice.total_amount <= amount_max)
        if search:
            q = q.where(Invoice.invoice_no.ilike(f"%{search}%"))

        total_r = await self._db.execute(select(func.count()).select_from(q.subquery()))
        total = total_r.scalar() or 0

        q = q.offset((page - 1) * limit).limit(limit).order_by(Invoice.created_at.desc())
        result = await self._db.execute(q)
        return result.scalars().all(), total

    async def department_counts(self) -> dict:
        total_r = await self._db.execute(select(func.count()).select_from(Invoice))
        total = total_r.scalar() or 0
        unassigned_r = await self._db.execute(
            select(func.count()).select_from(Invoice).where(Invoice.department_id.is_(None))
        )
        unassigned = unassigned_r.scalar() or 0
        grouped_r = await self._db.execute(
            select(Invoice.department_id, func.count(Invoice.id))
            .where(Invoice.department_id.isnot(None))
            .group_by(Invoice.department_id)
        )
        by_department = {dept_id: count for dept_id, count in grouped_r.all() if dept_id}
        return {"total": int(total), "unassigned": int(unassigned), "by_department": by_department}

    async def create_from_settlements(
        self,
        settlement_ids: list[str],
        due_date_days: int = 30,
        notes: str | None = None,
    ) -> Invoice:
        """여러 정산을 한 청구서로 통합 발행한다.

        - 모든 정산은 같은 공급자여야 함
        - 모든 정산은 status=approved이고 아직 청구서에 묶이지 않아야 함
        - 청구서의 부서는 첫 정산의 부서, items는 각 정산을 한 줄씩
        """
        if not settlement_ids:
            raise ConflictError("정산 ID가 비어있습니다.")

        s_rows = await self._db.execute(
            select(Settlement).where(Settlement.id.in_(settlement_ids))
        )
        settlements = list(s_rows.scalars().all())
        if len(settlements) != len(settlement_ids):
            raise NotFoundError("Settlement", "(일부 ID를 찾을 수 없음)")

        vendor_ids = {s.vendor_id for s in settlements}
        if len(vendor_ids) > 1:
            raise ConflictError("같은 공급자의 정산만 통합 발행할 수 있습니다.")
        for s in settlements:
            if s.status != SettlementStatus.approved:
                raise ConflictError(
                    f"승인되지 않은 정산이 포함됨: {s.settlement_no} (현재 {s.status.value})"
                )
            if s.invoice_id:
                raise ConflictError(
                    f"이미 청구서에 묶인 정산: {s.settlement_no}"
                )

        vendor_id = next(iter(vendor_ids))
        v_row = await self._db.execute(select(Vendor).where(Vendor.id == vendor_id))
        vendor = v_row.scalar_one_or_none()

        # 정산의 matched_transactions를 모두 조회해 거래의 supply_amount/tax_amount/amount를 합산
        # settlement.total_amount는 이미 부가세 포함 금액(Transaction.amount의 합)이므로
        # 그것을 invoice.total_amount로 사용하면 부가세 이중계산을 막을 수 있다.
        from app.models.transaction import Transaction
        all_tx_ids: list[str] = []
        for s in settlements:
            all_tx_ids.extend(s.matched_transactions or [])

        subtotal = 0.0
        tax_amount = 0.0
        total_amount = float(sum(s.total_amount for s in settlements))

        if all_tx_ids:
            tx_r = await self._db.execute(
                select(Transaction).where(Transaction.id.in_(all_tx_ids))
            )
            transactions = list(tx_r.scalars().all())
            # 거래에 supply/tax가 있으면 그대로 사용(매입세금계산서 import)
            # 없으면 amount/1.1로 추정 (한국 부가세 기본 10% 가정)
            for t in transactions:
                if t.supply_amount is not None and t.tax_amount is not None:
                    subtotal += float(t.supply_amount)
                    tax_amount += float(t.tax_amount)
                else:
                    s_amt = float(t.amount) / 1.1
                    subtotal += s_amt
                    tax_amount += float(t.amount) - s_amt
            subtotal = round(subtotal, 2)
            tax_amount = round(tax_amount, 2)
            # 부동소수점 보정: subtotal + tax가 total과 일치하도록
            diff = round(total_amount - subtotal - tax_amount, 2)
            if abs(diff) >= 0.01:
                tax_amount = round(tax_amount + diff, 2)

        today = datetime.now(timezone.utc).date()
        due_date = today + timedelta(days=due_date_days)
        # 같은 초에 여러 호출 시 UNIQUE 충돌 방지 — microsecond + random suffix
        invoice_no = (
            f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
            f"-{secrets.token_hex(2).upper()}"
        )

        items = [
            {
                "description": f"정산 {s.settlement_no} ({s.period_start} ~ {s.period_end})",
                "quantity": 1,
                "unit_price": float(s.total_amount),
                "amount": float(s.total_amount),
            }
            for s in settlements
        ]

        department_id = settlements[0].department_id or (vendor.department_id if vendor else None)
        first = settlements[0]
        invoice = Invoice(
            invoice_no=invoice_no,
            vendor_id=vendor_id,
            department_id=department_id,
            settlement_id=first.id,  # legacy 1:1 컬럼은 첫 정산만 (호환용)
            issue_date=today,
            due_date=due_date,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=total_amount,
            items=items,
            notes=notes,
        )
        self._db.add(invoice)
        await self._db.flush()  # invoice.id 확보

        # 모든 정산을 이 청구서에 묶음 (settlements.invoice_id)
        for s in settlements:
            s.invoice_id = invoice.id

        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice

    async def create_from_settlement(
        self,
        settlement_id: uuid.UUID,
        due_date_days: int = 30,
        notes: str | None = None,
    ) -> Invoice:
        """승인된 정산 1건을 청구서로 발행한다 (통합 발행 메서드에 위임)."""
        return await self.create_from_settlements([str(settlement_id)], due_date_days, notes)
