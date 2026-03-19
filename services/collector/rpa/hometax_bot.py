"""Playwright 기반 홈택스 세금계산서 수집 RPA 봇"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date
from typing import Optional

from playwright.async_api import async_playwright, Page


@dataclass
class TaxInvoice:
    invoice_no: str
    supplier_biz_no: str
    supplier_name: str
    receiver_biz_no: str
    receiver_name: str
    supply_amount: float
    tax_amount: float
    total_amount: float
    issue_date: str
    items: list[dict]


class HometaxBot:
    BASE_URL = "https://www.hometax.go.kr"

    def __init__(self, user_id: str, password: str):
        self._user_id = user_id
        self._password = password

    async def fetch_received_invoices(
        self,
        from_date: date,
        to_date: date,
    ) -> list[TaxInvoice]:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            )
            page = await context.new_page()
            try:
                await self._login(page)
                invoices = await self._scrape_invoices(page, from_date, to_date)
                return invoices
            finally:
                await browser.close()

    async def _login(self, page: Page) -> None:
        await page.goto(f"{self.BASE_URL}/wts/rolSttemnt/taxSttemnt/list.do")
        await page.wait_for_selector("#userId", timeout=10_000)
        await page.fill("#userId", self._user_id)
        await page.fill("#userPw", self._password)
        await page.click("#loginBtn")
        await page.wait_for_load_state("networkidle", timeout=15_000)

    async def _scrape_invoices(
        self,
        page: Page,
        from_date: date,
        to_date: date,
    ) -> list[TaxInvoice]:
        # 조회 기간 설정
        await page.fill("#fromDate", from_date.strftime("%Y%m%d"))
        await page.fill("#toDate", to_date.strftime("%Y%m%d"))
        await page.click("#searchBtn")
        await page.wait_for_load_state("networkidle")

        invoices = []
        rows = await page.query_selector_all("table.tbl-type tbody tr")

        for row in rows:
            cells = await row.query_selector_all("td")
            if len(cells) < 8:
                continue
            try:
                invoice = TaxInvoice(
                    invoice_no=await cells[0].inner_text(),
                    supplier_biz_no=(await cells[1].inner_text()).replace("-", ""),
                    supplier_name=await cells[2].inner_text(),
                    receiver_biz_no=(await cells[3].inner_text()).replace("-", ""),
                    receiver_name=await cells[4].inner_text(),
                    supply_amount=float((await cells[5].inner_text()).replace(",", "")),
                    tax_amount=float((await cells[6].inner_text()).replace(",", "")),
                    total_amount=float((await cells[7].inner_text()).replace(",", "")),
                    issue_date=await cells[8].inner_text() if len(cells) > 8 else "",
                    items=[],
                )
                invoices.append(invoice)
            except (ValueError, IndexError):
                continue

        return invoices
