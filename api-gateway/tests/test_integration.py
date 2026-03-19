"""통합 테스트 — 실제 DB 없이 앱 레이어 검증"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


@pytest.mark.anyio
async def test_create_transaction_validates_required_fields():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/transactions", json={})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_create_settlement_validates_required_fields():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/settlements", json={})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_create_invoice_validates_required_fields():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/invoices", json={})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_openapi_spec_available():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["info"]["title"] == "FinFlow AI API"
    # 핵심 경로 존재 확인
    paths = spec["paths"]
    assert "/api/v1/settlements" in paths
    assert "/api/v1/invoices" in paths
    assert "/api/v1/transactions" in paths
    assert "/api/v1/ar" in paths
    assert "/api/v1/reports/cashflow" in paths


@pytest.mark.anyio
async def test_bulk_classify_endpoint_exists():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/v1/transactions/bulk-classify")
    # DB 없이 500이 나올 수 있지만 404면 안 됨
    assert r.status_code != 404
