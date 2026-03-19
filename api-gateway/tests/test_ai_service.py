"""AI 서비스 클라이언트 단위 테스트"""
import pytest
from unittest.mock import AsyncMock, patch

from app.services.ai_service import AIServiceClient


@pytest.mark.anyio
async def test_classify_returns_fallback_on_error():
    client = AIServiceClient()
    with patch("httpx.AsyncClient.post", side_effect=Exception("connection refused")):
        result = await client.classify_transaction("택시 요금", 12000.0)
    assert result["account_code"] == "99999"
    assert result["confidence"] == 0.0


@pytest.mark.anyio
async def test_classify_batch_returns_fallback_on_error():
    client = AIServiceClient()
    items = [{"description": "커피", "amount": 5500}]
    with patch("httpx.AsyncClient.post", side_effect=Exception("timeout")):
        results = await client.classify_batch(items)
    assert len(results) == 1
    assert results[0]["account_code"] == "99999"


@pytest.mark.anyio
async def test_detect_anomalies_returns_empty_on_error():
    client = AIServiceClient()
    with patch("httpx.AsyncClient.post", side_effect=Exception("timeout")):
        flags = await client.detect_anomalies([{"id": "abc", "amount": 100}])
    assert flags == []
