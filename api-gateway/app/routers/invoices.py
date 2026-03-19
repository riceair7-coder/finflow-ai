import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.invoice import Invoice
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.invoice import InvoiceCreate, InvoiceOut
from app.services.invoice_service import InvoiceService

router = APIRouter()


@router.get("", response_model=PaginatedResponse[InvoiceOut])
async def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    q = select(Invoice).order_by(Invoice.created_at.desc())
    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    items = result.scalars().all()
    return PaginatedResponse(
        success=True,
        data=[InvoiceOut.model_validate(i) for i in items],
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.post("", response_model=ApiResponse[InvoiceOut], status_code=201)
async def create_invoice(body: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    service = InvoiceService(db)
    invoice = await service.create(body)
    return ApiResponse(success=True, data=InvoiceOut.model_validate(invoice))


@router.get("/{invoice_id}", response_model=ApiResponse[InvoiceOut])
async def get_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InvoiceService(db)
    invoice = await service.get(invoice_id)
    return ApiResponse(success=True, data=InvoiceOut.model_validate(invoice))


@router.post("/{invoice_id}/send", response_model=ApiResponse[InvoiceOut])
async def send_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InvoiceService(db)
    invoice = await service.send(invoice_id)
    return ApiResponse(success=True, data=InvoiceOut.model_validate(invoice))


@router.patch("/{invoice_id}/paid", response_model=ApiResponse[InvoiceOut])
async def mark_paid(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InvoiceService(db)
    invoice = await service.mark_paid(invoice_id)
    return ApiResponse(success=True, data=InvoiceOut.model_validate(invoice))
