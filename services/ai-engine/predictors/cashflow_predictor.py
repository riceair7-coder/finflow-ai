"""미수금 연체 예측 + 월별 현금흐름 예측"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional


@dataclass
class OverduePrediction:
    invoice_id: str
    overdue_probability: float   # 0~1
    predicted_payment_date: Optional[date]
    risk_level: str              # low / medium / high


@dataclass
class CashflowForecast:
    month: str          # YYYY-MM
    predicted_inflow: float
    predicted_outflow: float
    predicted_net: float
    confidence: float


class CashflowPredictor:
    def predict_overdue(self, invoice: dict, vendor_history: list[dict]) -> OverduePrediction:
        """
        거래처 납부 이력 기반 연체 확률 계산
        vendor_history: [{"due_date": ..., "paid_date": ..., "amount": ...}, ...]
        """
        if not vendor_history:
            return OverduePrediction(
                invoice_id=invoice["id"],
                overdue_probability=0.3,
                predicted_payment_date=None,
                risk_level="medium",
            )

        # 평균 납부 지연일 계산
        delays = []
        for h in vendor_history:
            if h.get("paid_date") and h.get("due_date"):
                due = date.fromisoformat(str(h["due_date"]))
                paid = date.fromisoformat(str(h["paid_date"]))
                delays.append((paid - due).days)

        avg_delay = sum(delays) / len(delays) if delays else 0
        overdue_rate = len([d for d in delays if d > 0]) / len(delays) if delays else 0.3

        due_date = date.fromisoformat(str(invoice["due_date"]))
        predicted_payment = due_date + timedelta(days=max(0, int(avg_delay)))

        risk_level = "low" if overdue_rate < 0.2 else "medium" if overdue_rate < 0.5 else "high"

        return OverduePrediction(
            invoice_id=invoice["id"],
            overdue_probability=overdue_rate,
            predicted_payment_date=predicted_payment,
            risk_level=risk_level,
        )

    def forecast_cashflow(
        self,
        historical_transactions: list[dict],
        forecast_months: int = 3,
    ) -> list[CashflowForecast]:
        """단순 이동평균 기반 현금흐름 예측"""
        import pandas as pd
        import numpy as np

        if not historical_transactions:
            return []

        df = pd.DataFrame(historical_transactions)
        df["transaction_date"] = pd.to_datetime(df["transaction_date"])
        df["month"] = df["transaction_date"].dt.to_period("M")
        df["amount"] = df["amount"].astype(float)

        monthly = df.groupby("month")["amount"].sum().reset_index()
        monthly = monthly.sort_values("month")

        if len(monthly) < 3:
            return []

        amounts = monthly["amount"].values
        window = min(3, len(amounts))
        moving_avg = float(np.mean(amounts[-window:]))
        std = float(np.std(amounts[-window:]))

        forecasts = []
        last_month = monthly["month"].iloc[-1]
        for i in range(1, forecast_months + 1):
            target_month = last_month + i
            confidence = max(0.5, 1.0 - (i * 0.15) - (std / (moving_avg + 1e-9)) * 0.1)
            forecasts.append(
                CashflowForecast(
                    month=str(target_month),
                    predicted_inflow=moving_avg * 0.6,
                    predicted_outflow=moving_avg * 0.4,
                    predicted_net=moving_avg * 0.2,
                    confidence=min(confidence, 1.0),
                )
            )

        return forecasts
