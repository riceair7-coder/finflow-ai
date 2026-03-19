import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Department
from app.schemas.common import ApiResponse
from app.schemas.department import DepartmentCreate, DepartmentOut, DepartmentUpdate

router = APIRouter()


@router.get("", response_model=ApiResponse[list[DepartmentOut]])
async def list_departments(
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Department)
    if is_active is not None:
        q = q.where(Department.is_active == is_active)
    q = q.order_by(Department.code)
    result = await db.execute(q)
    items = result.scalars().all()
    return ApiResponse(success=True, data=[DepartmentOut.model_validate(d) for d in items])


@router.post("", response_model=ApiResponse[DepartmentOut], status_code=201)
async def create_department(body: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Department).where(Department.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 존재하는 부서 코드입니다.")

    dept = Department(id=str(uuid.uuid4()), **body.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return ApiResponse(success=True, data=DepartmentOut.model_validate(dept))


@router.get("/{dept_id}", response_model=ApiResponse[DepartmentOut])
async def get_department(dept_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")
    return ApiResponse(success=True, data=DepartmentOut.model_validate(dept))


@router.patch("/{dept_id}", response_model=ApiResponse[DepartmentOut])
async def update_department(dept_id: str, body: DepartmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")

    for key, value in body.model_dump(exclude_none=True).items():
        setattr(dept, key, value)
    await db.commit()
    await db.refresh(dept)
    return ApiResponse(success=True, data=DepartmentOut.model_validate(dept))


@router.delete("/{dept_id}", response_model=ApiResponse[dict])
async def delete_department(dept_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")
    dept.is_active = False
    await db.commit()
    return ApiResponse(success=True, data={"id": dept_id})
