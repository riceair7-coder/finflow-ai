from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.settlement import Settlement, SettlementStatus
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.common import ApiResponse

router = APIRouter()


@router.get("/summary", response_model=ApiResponse[dict])
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """대시보드 요약 지표"""
    today = date.today()
    month_start = today.replace(day=1)

    # 이번달 총 지출
    monthly_total_r = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        )
    )
    monthly_total = float(monthly_total_r.scalar() or 0)

    # 지난달 총 지출 (전월비 계산용)
    if today.month == 1:
        prev_start = date(today.year - 1, 12, 1)
        prev_end = date(today.year - 1, 12, 31)
    else:
        import calendar
        prev_month = today.month - 1
        prev_start = date(today.year, prev_month, 1)
        last_day = calendar.monthrange(today.year, prev_month)[1]
        prev_end = date(today.year, prev_month, last_day)

    prev_total_r = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.transaction_date >= prev_start,
            Transaction.transaction_date <= prev_end,
        )
    )
    prev_total = float(prev_total_r.scalar() or 0)
    monthly_change = ((monthly_total - prev_total) / prev_total * 100) if prev_total else 0

    # 미처리 정산
    pending_stl_r = await db.execute(
        select(func.count(), func.sum(Settlement.total_amount)).where(
            Settlement.status.in_([SettlementStatus.pending, SettlementStatus.reviewing])
        )
    )
    pending_stl = pending_stl_r.one()
    pending_settlement_count = pending_stl[0] or 0
    pending_settlement_amount = float(pending_stl[1] or 0)

    # 미수금 (sent + overdue)
    ar_r = await db.execute(
        select(func.count(), func.sum(Invoice.total_amount)).where(
            Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.overdue])
        )
    )
    ar = ar_r.one()
    ar_count = ar[0] or 0
    ar_amount = float(ar[1] or 0)

    # 연체 건수
    overdue_r = await db.execute(
        select(func.count()).where(Invoice.status == InvoiceStatus.overdue)
    )
    overdue_count = overdue_r.scalar() or 0

    # 이번달 승인된 정산
    approved_stl_r = await db.execute(
        select(func.count(), func.sum(Settlement.total_amount)).where(
            Settlement.status == SettlementStatus.approved
        )
    )
    approved_stl = approved_stl_r.one()

    # AI 분류 현황
    tx_stats_r = await db.execute(
        select(Transaction.status, func.count()).group_by(Transaction.status)
    )
    tx_stats = {row[0]: row[1] for row in tx_stats_r.all()}
    total_tx = sum(tx_stats.values()) or 1
    classified = tx_stats.get(TransactionStatus.classified, 0) + tx_stats.get(TransactionStatus.approved, 0)
    pending_tx = tx_stats.get(TransactionStatus.pending, 0)

    return ApiResponse(success=True, data={
        "monthly_total": monthly_total,
        "monthly_change_pct": round(monthly_change, 1),
        "pending_settlement_count": pending_settlement_count,
        "pending_settlement_amount": pending_settlement_amount,
        "ar_amount": ar_amount,
        "ar_count": ar_count,
        "overdue_count": overdue_count,
        "approved_settlement_count": approved_stl[0] or 0,
        "approved_settlement_amount": float(approved_stl[1] or 0),
        "ai_classified_pct": round(classified / total_tx * 100),
        "ai_pending_pct": round(pending_tx / total_tx * 100),
    })


@router.get("/cashflow", response_model=ApiResponse[dict])
async def cashflow_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            func.strftime("%Y-%m", Transaction.transaction_date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.transaction_date.between(start_date, end_date))
        .group_by("month")
        .order_by("month")
    )
    rows = result.all()
    data = [{"month": str(r.month), "total": float(r.total or 0)} for r in rows]
    return ApiResponse(success=True, data={"cashflow": data})


@router.get("/expense", response_model=ApiResponse[dict])
async def expense_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Transaction.account_code,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.transaction_date.between(start_date, end_date))
        .group_by(Transaction.account_code)
        .order_by(func.sum(Transaction.amount).desc())
    )
    rows = result.all()
    data = [{"account_code": r.account_code, "total": float(r.total or 0), "count": r.count} for r in rows]
    return ApiResponse(success=True, data={"expenses": data})
