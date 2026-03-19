from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DepartmentCreate(BaseModel):
    code: str
    name: str
    cost_center: Optional[str] = None
    parent_id: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    cost_center: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    code: str
    name: str
    cost_center: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: bool
