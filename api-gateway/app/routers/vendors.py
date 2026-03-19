import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vendor import Vendor
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.vendor import VendorCreate, VendorOut, VendorUpdate

router = APIRouter()


@router.get("", response_model=PaginatedResponse[VendorOut])
async def list_vendors(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    department_id: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Vendor)
    if department_id:
        q = q.where(Vendor.department_id == department_id)
    if is_active is not None:
        q = q.where(Vendor.is_active == is_active)
    if search:
        q = q.where(
            Vendor.name.ilike(f"%{search}%")
            | Vendor.business_registration_no.ilike(f"%{search}%")
        )

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    q = q.offset((page - 1) * limit).limit(limit).order_by(Vendor.name)
    result = await db.execute(q)
    items = result.scalars().all()

    return PaginatedResponse(
        success=True,
        data=[VendorOut.model_validate(v) for v in items],
        meta=PaginationMeta(total=total, page=page, limit=limit, pages=(total + limit - 1) // limit),
    )


@router.post("", response_model=ApiResponse[VendorOut], status_code=201)
async def create_vendor(body: VendorCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Vendor).where(Vendor.business_registration_no == body.business_registration_no)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 등록된 사업자등록번호입니다.")

    vendor = Vendor(id=str(uuid.uuid4()), **body.model_dump())
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return ApiResponse(success=True, data=VendorOut.model_validate(vendor))


@router.get("/{vendor_id}", response_model=ApiResponse[VendorOut])
async def get_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="공급자를 찾을 수 없습니다.")
    return ApiResponse(success=True, data=VendorOut.model_validate(vendor))


@router.patch("/{vendor_id}", response_model=ApiResponse[VendorOut])
async def update_vendor(vendor_id: str, body: VendorUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="공급자를 찾을 수 없습니다.")

    for key, value in body.model_dump(exclude_none=True).items():
        setattr(vendor, key, value)
    await db.commit()
    await db.refresh(vendor)
    return ApiResponse(success=True, data=VendorOut.model_validate(vendor))


@router.delete("/{vendor_id}", response_model=ApiResponse[dict])
async def delete_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="공급자를 찾을 수 없습니다.")
    vendor.is_active = False
    await db.commit()
    return ApiResponse(success=True, data={"id": vendor_id})


@router.get("/lookup/by-brn/{brn}", response_model=ApiResponse[VendorOut])
async def lookup_by_business_registration_no(brn: str, db: AsyncSession = Depends(get_db)):
    """사업자등록번호로 공급자 조회 — 거래 자동분류 시 사용"""
    clean_brn = brn.replace("-", "")
    result = await db.execute(
        select(Vendor).where(Vendor.business_registration_no == clean_brn)
    )
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="등록되지 않은 사업자입니다.")
    return ApiResponse(success=True, data=VendorOut.model_validate(vendor))
