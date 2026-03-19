"""Celery 비동기 수집 태스크"""
from __future__ import annotations

import httpx
from datetime import date, timedelta

from tasks.celery_app import app


@app.task(bind=True, max_retries=3, default_retry_delay=300)
def fetch_bank_transactions(self, account_no: str = None, days_back: int = 7):
    """오픈뱅킹 거래내역 수집 → API 서버로 전송"""
    import asyncio
    from extractors.openbanking_extractor import OpenBankingExtractor
    from normalizers.transaction_normalizer import TransactionNormalizer
    from config import settings

    to_date = date.today()
    from_date = to_date - timedelta(days=days_back)

    extractor = OpenBankingExtractor()
    normalizer = TransactionNormalizer()

    try:
        txs = asyncio.run(
            extractor.fetch_transactions(
                account_no=account_no or "",
                bank_code="004",
                from_date=from_date,
                to_date=to_date,
            )
        )
        normalized = [normalizer.from_bank(tx) for tx in txs]
        _push_to_api(normalized, settings.api_base_url)
        return {"fetched": len(txs), "pushed": len(normalized)}
    except Exception as exc:
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=3, default_retry_delay=600)
def fetch_hometax_invoices(self, days_back: int = 7):
    """홈택스 세금계산서 수집"""
    import asyncio
    from rpa.hometax_bot import HometaxBot
    from normalizers.transaction_normalizer import TransactionNormalizer
    from config import settings

    to_date = date.today()
    from_date = to_date - timedelta(days=days_back)

    bot = HometaxBot(
        user_id=settings.hometax_api_key,
        password="",  # cert-based login in prod
    )
    normalizer = TransactionNormalizer()

    try:
        invoices = asyncio.run(bot.fetch_received_invoices(from_date, to_date))
        normalized = [normalizer.from_hometax(inv) for inv in invoices]
        _push_to_api(normalized, settings.api_base_url)
        return {"fetched": len(invoices), "pushed": len(normalized)}
    except Exception as exc:
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=3)
def process_ocr_image(self, image_path: str):
    """OCR 이미지 처리 태스크"""
    from extractors.ocr_extractor import OcrExtractor
    from normalizers.transaction_normalizer import TransactionNormalizer
    from config import settings

    extractor = OcrExtractor()
    normalizer = TransactionNormalizer()

    try:
        result = extractor.extract(image_path)
        if not extractor.is_confident(result):
            return {"status": "low_confidence", "confidence": result.confidence}

        normalized = normalizer.from_ocr(result)
        if normalized:
            _push_to_api([normalized], settings.api_base_url)
            return {"status": "ok", "confidence": result.confidence}
        return {"status": "parse_failed"}
    except Exception as exc:
        raise self.retry(exc=exc)


def _push_to_api(transactions: list, base_url: str) -> None:
    for tx in transactions:
        payload = {
            "transaction_date": str(tx.transaction_date),
            "amount": tx.amount,
            "currency": tx.currency,
            "description": tx.description,
            "source": tx.source,
            "external_id": tx.external_id,
        }
        httpx.post(f"{base_url}/api/v1/transactions", json=payload, timeout=10)
