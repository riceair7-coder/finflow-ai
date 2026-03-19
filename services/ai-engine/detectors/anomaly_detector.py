"""거래 이상 감지 — 중복·누락·통계적 이상값 탐지"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class AnomalyType(str, Enum):
    duplicate = "duplicate"
    statistical_outlier = "statistical_outlier"
    unusual_amount = "unusual_amount"
    missing_vendor = "missing_vendor"


@dataclass
class AnomalyFlag:
    transaction_id: str
    anomaly_type: AnomalyType
    score: float       # 0~1, 높을수록 이상
    description: str
    suggested_action: str


class AnomalyDetector:
    def __init__(self, z_score_threshold: float = 3.0):
        self._z_threshold = z_score_threshold

    def detect(self, transactions: list[dict]) -> list[AnomalyFlag]:
        flags: list[AnomalyFlag] = []
        flags.extend(self._detect_duplicates(transactions))
        flags.extend(self._detect_outliers(transactions))
        flags.extend(self._detect_missing_vendor(transactions))
        return flags

    def _detect_duplicates(self, transactions: list[dict]) -> list[AnomalyFlag]:
        seen: dict[tuple, str] = {}
        flags = []
        for tx in transactions:
            key = (tx.get("transaction_date"), tx.get("amount"), tx.get("vendor_id"))
            if key in seen:
                flags.append(
                    AnomalyFlag(
                        transaction_id=tx["id"],
                        anomaly_type=AnomalyType.duplicate,
                        score=0.9,
                        description=f"동일 날짜/금액/거래처 거래 중복 (원본: {seen[key]})",
                        suggested_action="중복 거래 확인 후 삭제",
                    )
                )
            else:
                seen[key] = tx["id"]
        return flags

    def _detect_outliers(self, transactions: list[dict]) -> list[AnomalyFlag]:
        import numpy as np

        amounts = [float(tx.get("amount", 0)) for tx in transactions]
        if len(amounts) < 10:
            return []

        mean = np.mean(amounts)
        std = np.std(amounts)
        if std == 0:
            return []

        flags = []
        for tx in transactions:
            z = abs(float(tx.get("amount", 0)) - mean) / std
            if z > self._z_threshold:
                flags.append(
                    AnomalyFlag(
                        transaction_id=tx["id"],
                        anomaly_type=AnomalyType.statistical_outlier,
                        score=min(z / 10, 1.0),
                        description=f"통계적 이상값 (z-score: {z:.2f}, 평균: {mean:,.0f}원)",
                        suggested_action="금액 확인 필요",
                    )
                )
        return flags

    def _detect_missing_vendor(self, transactions: list[dict]) -> list[AnomalyFlag]:
        flags = []
        for tx in transactions:
            if not tx.get("vendor_id") and float(tx.get("amount", 0)) > 100_000:
                flags.append(
                    AnomalyFlag(
                        transaction_id=tx["id"],
                        anomaly_type=AnomalyType.missing_vendor,
                        score=0.6,
                        description="10만원 이상 거래에 거래처 미지정",
                        suggested_action="거래처 매핑 필요",
                    )
                )
        return flags
