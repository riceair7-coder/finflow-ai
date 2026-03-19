from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.schemas.common import ApiResponse
from app.schemas.invoice import InvoiceOut

router = APIRouter()


@router.get("", response_model=ApiResponse[list[InvoiceOut]])
async def get_ar_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invoice).where(Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.overdue]))
    )
    invoices = result.scalars().all()
    return ApiResponse(success=True, data=[InvoiceOut.model_validate(i) for i in invoices])


@router.get("/overdue", response_model=ApiResponse[list[InvoiceOut]])
async def get_overdue(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.status == InvoiceStatus.overdue))
    invoices = result.scalars().all()
    return ApiResponse(success=True, data=[InvoiceOut.model_validate(i) for i in invoices])
