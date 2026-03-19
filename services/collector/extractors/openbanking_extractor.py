"""오픈뱅킹 API 기반 계좌 거래내역 수집"""
from __future__ import annotations

import httpx
from dataclasses import dataclass
from datetime import date
from typing import Optional

from config import settings


@dataclass
class BankTransaction:
    external_id: str
    transaction_date: str  # YYYY-MM-DD
    amount: float
    description: str
    bank_code: str
    account_no: str
    transaction_type: str  # credit / debit


class OpenBankingExtractor:
    def __init__(self):
        self._access_token: Optional[str] = None

    async def _get_token(self) -> str:
        if self._access_token:
            return self._access_token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.openbanking_base_url}/oauth/2.0/token",
                data={
                    "client_id": settings.openbanking_client_id,
                    "client_secret": settings.openbanking_client_secret,
                    "grant_type": "client_credentials",
                    "scope": "inquiry",
                },
            )
            response.raise_for_status()
            self._access_token = response.json()["access_token"]
        return self._access_token

    async def fetch_transactions(
        self,
        account_no: str,
        bank_code: str,
        from_date: date,
        to_date: date,
    ) -> list[BankTransaction]:
        token = await self._get_token()
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.openbanking_base_url}/v2.0/account/transaction/list/fin_num",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "bank_tran_id": f"{settings.openbanking_client_id}U{account_no[:8]}",
                    "fintech_use_num": account_no,
                    "inquiry_type": "A",
                    "inquiry_base": "D",
                    "from_date": from_date.strftime("%Y%m%d"),
                    "to_date": to_date.strftime("%Y%m%d"),
                    "sort_order": "D",
                    "tran_dtime": "",
                },
            )
            response.raise_for_status()
            data = response.json()

        return [
            BankTransaction(
                external_id=tx["tran_num"],
                transaction_date=tx["tran_date"],
                amount=float(tx["tran_amt"]),
                description=tx.get("print_content", ""),
                bank_code=bank_code,
                account_no=account_no,
                transaction_type="credit" if tx["inout_type"] == "IN" else "debit",
            )
            for tx in data.get("res_list", [])
        ]
