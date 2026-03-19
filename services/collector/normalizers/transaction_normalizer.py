"""수집된 다양한 소스의 거래 데이터를 공통 포맷으로 정규화"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass
class NormalizedTransaction:
    external_id: Optional[str]
    transaction_date: date
    amount: float
    currency: str
    description: Optional[str]
    vendor_name: Optional[str]
    vendor_biz_no: Optional[str]
    source: str  # card / bank / ocr / hometax
    raw_data: dict


class TransactionNormalizer:
    def from_bank(self, tx) -> NormalizedTransaction:
        """오픈뱅킹 거래 → 정규화"""
        year = tx.transaction_date[:4]
        month = tx.transaction_date[4:6]
        day = tx.transaction_date[6:8]
        return NormalizedTransaction(
            external_id=tx.external_id,
            transaction_date=date(int(year), int(month), int(day)),
            amount=tx.amount,
            currency="KRW",
            description=tx.description,
            vendor_name=None,
            vendor_biz_no=None,
            source="bank",
            raw_data={"bank_code": tx.bank_code, "account_no": tx.account_no},
        )

    def from_ocr(self, ocr_result) -> Optional[NormalizedTransaction]:
        """OCR 추출 결과 → 정규화 (신뢰도 미달 시 None 반환)"""
        fields = ocr_result.fields
        if "amount" not in fields or "date" not in fields:
            return None

        parts = fields["date"].split("-")
        try:
            tx_date = date(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            return None

        return NormalizedTransaction(
            external_id=None,
            transaction_date=tx_date,
            amount=float(fields["amount"]),
            currency="KRW",
            description=ocr_result.raw_text[:200],
            vendor_name=fields.get("vendor_name"),
            vendor_biz_no=fields.get("business_registration_no"),
            source="ocr",
            raw_data={"confidence": ocr_result.confidence, "path": ocr_result.source_path},
        )

    def from_hometax(self, invoice) -> NormalizedTransaction:
        """홈택스 세금계산서 → 정규화"""
        parts = invoice.issue_date.replace(".", "-").split("-")
        try:
            tx_date = date(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            tx_date = date.today()

        return NormalizedTransaction(
            external_id=invoice.invoice_no,
            transaction_date=tx_date,
            amount=invoice.total_amount,
            currency="KRW",
            description=f"세금계산서 {invoice.invoice_no}",
            vendor_name=invoice.supplier_name,
            vendor_biz_no=invoice.supplier_biz_no,
            source="hometax",
            raw_data={
                "supply_amount": invoice.supply_amount,
                "tax_amount": invoice.tax_amount,
                "items": invoice.items,
            },
        )
