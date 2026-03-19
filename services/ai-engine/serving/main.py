"""AI Engine FastAPI 서빙 서버"""
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

from classifiers.transaction_classifier import TransactionClassifier, ClassificationResult
from detectors.anomaly_detector import AnomalyDetector
from predictors.cashflow_predictor import CashflowPredictor

app = FastAPI(title="FinFlow AI Engine", version="1.0.0")

_classifier = TransactionClassifier()
_detector = AnomalyDetector()
_predictor = CashflowPredictor()


class ClassifyRequest(BaseModel):
    description: str
    amount: float = 0.0


class BatchClassifyRequest(BaseModel):
    items: list[dict]


class AnomalyRequest(BaseModel):
    transactions: list[dict]


class OverdueRequest(BaseModel):
    invoice: dict
    vendor_history: list[dict] = []


class ForecastRequest(BaseModel):
    historical_transactions: list[dict]
    forecast_months: int = 3


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-engine"}


@app.post("/classify")
async def classify_single(req: ClassifyRequest) -> dict:
    result = _classifier.classify(req.description, req.amount)
    return {
        "success": True,
        "data": {
            "account_code": result.account_code,
            "account_name": result.account_name,
            "confidence": result.confidence,
        },
    }


@app.post("/classify/batch")
async def classify_batch(req: BatchClassifyRequest) -> dict:
    results = _classifier.batch_classify(req.items)
    return {
        "success": True,
        "data": [
            {
                "account_code": r.account_code,
                "account_name": r.account_name,
                "confidence": r.confidence,
            }
            for r in results
        ],
    }


@app.post("/anomaly/detect")
async def detect_anomalies(req: AnomalyRequest) -> dict:
    flags = _detector.detect(req.transactions)
    return {
        "success": True,
        "data": [
            {
                "transaction_id": f.transaction_id,
                "anomaly_type": f.anomaly_type,
                "score": f.score,
                "description": f.description,
                "suggested_action": f.suggested_action,
            }
            for f in flags
        ],
    }


@app.post("/predict/overdue")
async def predict_overdue(req: OverdueRequest) -> dict:
    prediction = _predictor.predict_overdue(req.invoice, req.vendor_history)
    return {
        "success": True,
        "data": {
            "invoice_id": prediction.invoice_id,
            "overdue_probability": prediction.overdue_probability,
            "predicted_payment_date": str(prediction.predicted_payment_date) if prediction.predicted_payment_date else None,
            "risk_level": prediction.risk_level,
        },
    }


@app.post("/predict/cashflow")
async def predict_cashflow(req: ForecastRequest) -> dict:
    forecasts = _predictor.forecast_cashflow(
        req.historical_transactions, req.forecast_months
    )
    return {
        "success": True,
        "data": [
            {
                "month": f.month,
                "predicted_inflow": f.predicted_inflow,
                "predicted_outflow": f.predicted_outflow,
                "predicted_net": f.predicted_net,
                "confidence": f.confidence,
            }
            for f in forecasts
        ],
    }
