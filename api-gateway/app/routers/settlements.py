import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.settlement import SettlementCreate, SettlementOut, SettlementReview
from app.services.settlement_service import SettlementService

router = APIRouter()


@router.post("", response_model=ApiResponse[SettlementOut], status_code=201)
async def create_settlement(body: SettlementCreate, db: AsyncSession = Depends(get_db)):
    service = SettlementService(db)
    settlement = await service.create(body)
    return ApiResponse(success=True, data=SettlementOut.model_validate(settlement))


@router.get("", response_model=PaginatedResponse[SettlementOut])
async def list_settlements(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    vendor_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    service = SettlementService(db)
    items, total = await service.list(page=page, limit=limit, vendor_id=vendor_id, status=status)
    return PaginatedResponse(
        success=True,
        data=[SettlementOut.model_validate(s) for s in items],
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.get("/{settlement_id}", response_model=ApiResponse[SettlementOut])
async def get_settlement(settlement_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = SettlementService(db)
    settlement = await service.get(settlement_id)
    return ApiResponse(success=True, data=SettlementOut.model_validate(settlement))


@router.patch("/{settlement_id}/approve", response_model=ApiResponse[SettlementOut])
async def approve_settlement(
    settlement_id: uuid.UUID,
    body: SettlementReview,
    db: AsyncSession = Depends(get_db),
):
    service = SettlementService(db)
    settlement = await service.approve(settlement_id, body)
    return ApiResponse(success=True, data=SettlementOut.model_validate(settlement))


@router.patch("/{settlement_id}/reject", response_model=ApiResponse[SettlementOut])
async def reject_settlement(
    settlement_id: uuid.UUID,
    body: SettlementReview,
    db: AsyncSession = Depends(get_db),
):
    service = SettlementService(db)
    settlement = await service.reject(settlement_id, body)
    return ApiResponse(success=True, data=SettlementOut.model_validate(settlement))
