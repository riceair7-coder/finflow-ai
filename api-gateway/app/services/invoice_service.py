import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.invoice import Invoice, InvoiceStatus
from app.schemas.invoice import InvoiceCreate


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def create(self, data: InvoiceCreate) -> Invoice:
        items = [item.model_dump() for item in data.items]
        subtotal = sum(item["amount"] for item in items)
        tax_amount = round(subtotal * 0.1, 2)  # VAT 10%
        total_amount = subtotal + tax_amount
        invoice_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

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
        invoice.sent_at = datetime.now(timezone.utc)
        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice

    async def mark_paid(self, invoice_id: uuid.UUID) -> Invoice:
        invoice = await self.get(invoice_id)
        if invoice.status not in (InvoiceStatus.sent, InvoiceStatus.overdue):
            raise ConflictError(f"Cannot mark as paid invoice in status: {invoice.status}")
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = datetime.now(timezone.utc)
        await self._db.commit()
        await self._db.refresh(invoice)
        return invoice
