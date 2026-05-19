"""홈택스 매입 전자세금계산서 엑셀 파서.

홈택스에서 다운로드한 '매입 전자(수정) 세금계산서 목록조회' 엑셀(.xls)을
파싱하여 거래 등록에 필요한 핵심 필드를 추출한다.

엑셀 구조 (홈택스 표준 양식):
    row 0: 사업자등록번호 / 상호 / 대표자명 (공급받는자 = 본인 회사)
    row 2: 총 합계금액 / 총 공급가액 / 총 세액
    row 4: 표 제목
    row 5: 데이터 컬럼 헤더 (헤더명으로 컬럼 위치를 동적 매핑)
    row 6~: 명세 데이터
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, BinaryIO

import xlrd

HEADER_ROW = 5
DATA_START_ROW = 6

# 헤더명 → TaxInvoiceRow 필드명. 양식이 사소하게 바뀌어도 헤더만 같으면 동작.
# 동일한 의미의 헤더가 여러 표기로 올 수 있으므로 가능한 변종을 list로 둔다.
REQUIRED_COLUMNS: dict[str, list[str]] = {
    "write_date":      ["작성일자"],
    "approval_no":     ["승인번호"],
    "supplier_brn":    ["공급자사업자등록번호", "공급자 사업자등록번호"],
    "supplier_name":   ["상호"],          # 공급자 상호 (헤더가 단순히 "상호"로 옴)
    "supplier_ceo":    ["대표자명"],      # 공급자 대표자명
    "total_amount":    ["합계금액"],
    "supply_amount":   ["공급가액"],
    "tax_amount":      ["세액"],
    "item_name":       ["품목명"],
}

OPTIONAL_COLUMNS: dict[str, list[str]] = {
    "buyer_email1":    ["공급받는자 이메일1", "공급받는자이메일1", "이메일1"],
    "buyer_email2":    ["공급받는자 이메일2", "공급받는자이메일2", "이메일2"],
}


@dataclass
class TaxInvoiceRow:
    """매입 세금계산서 한 건."""

    write_date: str          # YYYY-MM-DD
    approval_no: str         # 승인번호 (external_id로 사용)
    supplier_brn: str        # 공급자사업자번호 (하이픈 포함)
    supplier_name: str       # 공급자 상호
    supplier_ceo: str        # 공급자 대표자명
    total_amount: int        # 합계금액
    supply_amount: int       # 공급가액
    tax_amount: int          # 세액
    item_name: str           # 품목명
    buyer_email1: str        # 공급받는자 이메일1
    buyer_email2: str        # 공급받는자 이메일2


@dataclass
class TaxInvoiceSummary:
    """엑셀 상단 요약 정보."""

    buyer_brn: str
    buyer_name: str
    buyer_ceo: str
    total_amount_sum: int
    supply_amount_sum: int
    tax_amount_sum: int


@dataclass
class ParsedTaxInvoice:
    summary: TaxInvoiceSummary
    rows: list[TaxInvoiceRow]


def _to_int(value: Any) -> int:
    if value in (None, ""):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).replace(",", "").strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _normalize_header(h: str) -> str:
    # 공백/줄바꿈 제거해서 비교 (홈택스가 헤더에 줄바꿈을 넣는 경우 대비)
    return "".join(_to_str(h).split())


def _build_header_index(sheet: Any) -> dict[str, int]:
    """row 5의 모든 헤더 텍스트 → 컬럼 인덱스 매핑을 만든다."""
    idx: dict[str, int] = {}
    for c in range(sheet.ncols):
        h = _normalize_header(sheet.cell_value(HEADER_ROW, c))
        if h and h not in idx:
            idx[h] = c
    return idx


def _resolve_columns(
    header_index: dict[str, int],
    spec: dict[str, list[str]],
    required: bool,
) -> dict[str, int | None]:
    """헤더 매핑 spec을 적용해 필드명 → 컬럼 인덱스로 변환한다."""
    resolved: dict[str, int | None] = {}
    for field, variants in spec.items():
        found: int | None = None
        for v in variants:
            key = _normalize_header(v)
            if key in header_index:
                found = header_index[key]
                break
        if found is None and required:
            raise ValueError(
                f"엑셀 양식이 홈택스 매입 세금계산서 표준과 다릅니다 "
                f"(필수 헤더 '{variants[0]}' 을 찾을 수 없습니다)."
            )
        resolved[field] = found
    return resolved


def parse_tax_invoice(source: str | bytes | BinaryIO) -> ParsedTaxInvoice:
    """매입 전자세금계산서 엑셀을 파싱한다.

    - 경로(str) / 바이트(bytes) / 파일-라이크 객체 모두 지원.
    - 컬럼 위치는 헤더명으로 동적 매핑한다 (홈택스 양식의 사소한 변경에 견고).
    """

    if isinstance(source, bytes):
        wb = xlrd.open_workbook(file_contents=source)
    elif isinstance(source, str):
        wb = xlrd.open_workbook(source)
    else:
        wb = xlrd.open_workbook(file_contents=source.read())

    sheet = wb.sheet_by_index(0)

    summary = TaxInvoiceSummary(
        buyer_brn=_to_str(sheet.cell_value(0, 1)),
        buyer_name=_to_str(sheet.cell_value(0, 3)),
        buyer_ceo=_to_str(sheet.cell_value(0, 5)),
        total_amount_sum=_to_int(sheet.cell_value(2, 1)),
        supply_amount_sum=_to_int(sheet.cell_value(2, 3)),
        tax_amount_sum=_to_int(sheet.cell_value(2, 5)),
    )

    header_index = _build_header_index(sheet)
    required_cols = _resolve_columns(header_index, REQUIRED_COLUMNS, required=True)
    optional_cols = _resolve_columns(header_index, OPTIONAL_COLUMNS, required=False)

    rows: list[TaxInvoiceRow] = []
    for r in range(DATA_START_ROW, sheet.nrows):
        write_date_col = required_cols["write_date"]
        assert write_date_col is not None
        write_date = _to_str(sheet.cell_value(r, write_date_col))
        if not write_date:
            continue

        def s(field: str) -> str:
            col = required_cols.get(field) or optional_cols.get(field)
            return _to_str(sheet.cell_value(r, col)) if col is not None else ""

        def i(field: str) -> int:
            col = required_cols.get(field) or optional_cols.get(field)
            return _to_int(sheet.cell_value(r, col)) if col is not None else 0

        rows.append(
            TaxInvoiceRow(
                write_date=write_date,
                approval_no=s("approval_no"),
                supplier_brn=s("supplier_brn"),
                supplier_name=s("supplier_name"),
                supplier_ceo=s("supplier_ceo"),
                total_amount=i("total_amount"),
                supply_amount=i("supply_amount"),
                tax_amount=i("tax_amount"),
                item_name=s("item_name"),
                buyer_email1=s("buyer_email1"),
                buyer_email2=s("buyer_email2"),
            )
        )

    return ParsedTaxInvoice(summary=summary, rows=rows)
