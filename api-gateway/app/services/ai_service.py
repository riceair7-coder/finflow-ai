"""AI Engine HTTP 클라이언트 — 분류·이상감지·예측 API 호출"""
from __future__ import annotations

from typing import Optional

import httpx

from app.config import settings


class AIServiceClient:
    def __init__(self, base_url: str = "http://ai-engine:8001"):
        self._base_url = base_url
        self._timeout = 10.0

    async def classify_transaction(
        self, description: str, amount: float = 0.0
    ) -> dict:
        """단건 거래 분류"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/classify",
                    json={"description": description, "amount": amount},
                )
                resp.raise_for_status()
                return resp.json().get("data", {})
            except httpx.HTTPError:
                return {"account_code": "99999", "account_name": "미분류", "confidence": 0.0}

    async def classify_batch(self, items: list[dict]) -> list[dict]:
        """배치 분류"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/classify/batch",
                    json={"items": items},
                )
                resp.raise_for_status()
                return resp.json().get("data", [])
            except httpx.HTTPError:
                return [{"account_code": "99999", "confidence": 0.0}] * len(items)

    async def detect_anomalies(self, transactions: list[dict]) -> list[dict]:
        """이상 거래 감지"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/anomaly/detect",
                    json={"transactions": transactions},
                )
                resp.raise_for_status()
                return resp.json().get("data", [])
            except httpx.HTTPError:
                return []

    async def predict_overdue(self, invoice: dict, vendor_history: list[dict]) -> dict:
        """연체 예측"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/predict/overdue",
                    json={"invoice": invoice, "vendor_history": vendor_history},
                )
                resp.raise_for_status()
                return resp.json().get("data", {})
            except httpx.HTTPError:
                return {"overdue_probability": 0.0, "risk_level": "unknown"}

    async def forecast_cashflow(
        self, transactions: list[dict], months: int = 3
    ) -> list[dict]:
        """현금흐름 예측"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/predict/cashflow",
                    json={"historical_transactions": transactions, "forecast_months": months},
                )
                resp.raise_for_status()
                return resp.json().get("data", [])
            except httpx.HTTPError:
                return []


# 싱글턴
ai_client = AIServiceClient()
