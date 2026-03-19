"""PaddleOCR 기반 영수증/세금계산서 텍스트 추출"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from config import settings


@dataclass
class OcrResult:
    raw_text: str
    fields: dict
    confidence: float
    source_path: str


class OcrExtractor:
    def __init__(self):
        self._ocr = None  # lazy init (PaddleOCR 초기화 비용 큼)

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(use_angle_cls=True, lang=settings.ocr_language, show_log=False)
        return self._ocr

    def extract(self, image_path: str) -> OcrResult:
        ocr = self._get_ocr()
        result = ocr.ocr(image_path, cls=True)

        lines = []
        confidences = []
        for page in result:
            if page is None:
                continue
            for line in page:
                text = line[1][0]
                conf = line[1][1]
                lines.append(text)
                confidences.append(conf)

        raw_text = "\n".join(lines)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        fields = self._parse_fields(raw_text)

        return OcrResult(
            raw_text=raw_text,
            fields=fields,
            confidence=avg_confidence,
            source_path=image_path,
        )

    def _parse_fields(self, text: str) -> dict:
        fields: dict = {}

        # 사업자등록번호 (xxx-xx-xxxxx)
        biz_no = re.search(r"\d{3}-\d{2}-\d{5}", text)
        if biz_no:
            fields["business_registration_no"] = biz_no.group().replace("-", "")

        # 금액 (숫자 + 원)
        amounts = re.findall(r"[\d,]+\s*원", text)
        if amounts:
            raw = amounts[-1].replace(",", "").replace("원", "").strip()
            try:
                fields["amount"] = int(raw)
            except ValueError:
                pass

        # 날짜 (yyyy-mm-dd or yyyy.mm.dd)
        date_match = re.search(r"(\d{4})[.\-/](\d{2})[.\-/](\d{2})", text)
        if date_match:
            fields["date"] = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"

        # 공급자명 (상호)
        vendor_match = re.search(r"상\s*호\s*[：:]\s*(.+)", text)
        if vendor_match:
            fields["vendor_name"] = vendor_match.group(1).strip()

        return fields

    def is_confident(self, result: OcrResult) -> bool:
        return result.confidence >= settings.ocr_confidence_threshold
