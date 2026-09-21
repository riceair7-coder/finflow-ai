from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.invoice import Invoice, InvoiceStatus
from app.models.settlement import Settlement, SettlementStatus
from app.models.transaction import Transaction, TransactionStatus
from app.schemas.common import ApiResponse
from app.services.auth_service import current_user

router = APIRouter()


@router.get("/summary", response_model=ApiResponse[dict])
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_user),
):
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

    # 사전입금 — 전체 사전입금 거래 (is_prepaid=true)
    prepaid_r = await db.execute(
        select(func.count(), func.sum(Transaction.amount)).where(
            Transaction.is_prepaid.is_(True)
        )
    )
    prepaid = prepaid_r.one()
    prepaid_count = prepaid[0] or 0
    prepaid_amount = float(prepaid[1] or 0)

    # 이번달 사전입금 (paid_at 기준)
    prepaid_month_r = await db.execute(
        select(func.count(), func.sum(Transaction.amount)).where(
            Transaction.is_prepaid.is_(True),
            Transaction.paid_at >= month_start,
            Transaction.paid_at <= today,
        )
    )
    prepaid_month = prepaid_month_r.one()
    prepaid_month_count = prepaid_month[0] or 0
    prepaid_month_amount = float(prepaid_month[1] or 0)

    # AI 분류 현황
    tx_stats_r = await db.execute(
        select(Transaction.status, func.count()).group_by(Transaction.status)
    )
    tx_stats = {row[0]: row[1] for row in tx_stats_r.all()}
    total_tx = sum(tx_stats.values()) or 1
    classified = tx_stats.get(TransactionStatus.classified, 0) + tx_stats.get(TransactionStatus.approved, 0)
    pending_tx = tx_stats.get(TransactionStatus.pending, 0)

    # 미정산 거래 — 정산관리 '미정산 공급자'와 동일 기준
    # (사전입금 제외 / approved·classified / 공급자 지정 / 어떤 정산에도 안 묶임)
    matched_r = await db.execute(
        select(Settlement.matched_transactions).where(Settlement.status != SettlementStatus.rejected)
    )
    already_matched: set[str] = set()
    for row in matched_r.all():
        already_matched.update(row[0] or [])

    unsettled_r = await db.execute(
        select(Transaction.id, Transaction.amount, Transaction.vendor_id).where(
            Transaction.is_prepaid.is_(False),
            Transaction.status.in_([TransactionStatus.approved, TransactionStatus.classified]),
            Transaction.vendor_id.isnot(None),
        )
    )
    unsettled_count = 0
    unsettled_amount = 0.0
    unsettled_vendors: set[str] = set()
    for tx_id, amount, vendor_id in unsettled_r.all():
        if str(tx_id) in already_matched:
            continue
        unsettled_count += 1
        unsettled_amount += float(amount or 0)
        unsettled_vendors.add(vendor_id)

    # 이상치 — 부서 미배정 거래 / 이번달 지출의 30% 이상을 차지하는 단일 거래
    unassigned_r = await db.execute(
        select(func.count()).where(Transaction.department_id.is_(None))
    )
    unassigned_count = unassigned_r.scalar() or 0

    outlier_count = 0
    outlier_max = 0.0
    if monthly_total > 0:
        threshold = monthly_total * 0.3
        outlier_r = await db.execute(
            select(func.count(), func.max(Transaction.amount)).where(
                Transaction.transaction_date >= month_start,
                Transaction.transaction_date <= today,
                Transaction.amount >= threshold,
            )
        )
        outlier = outlier_r.one()
        outlier_count = outlier[0] or 0
        outlier_max = float(outlier[1] or 0)

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
        "prepaid_count": prepaid_count,
        "prepaid_amount": prepaid_amount,
        "prepaid_month_count": prepaid_month_count,
        "prepaid_month_amount": prepaid_month_amount,
        "ai_classified_pct": round(classified / total_tx * 100),
        "ai_pending_pct": round(pending_tx / total_tx * 100),
        "unsettled_count": unsettled_count,
        "unsettled_amount": unsettled_amount,
        "unsettled_vendor_count": len(unsettled_vendors),
        "unassigned_dept_count": unassigned_count,
        "outlier_count": outlier_count,
        "outlier_max_amount": outlier_max,
    })


@router.get("/cashflow", response_model=ApiResponse[dict])
async def cashflow_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_user),
):
    # PostgreSQL: to_char (기존 strftime은 SQLite 전용이라 운영 DB에서 항상 500이었음)
    month_col = func.to_char(Transaction.transaction_date, "YYYY-MM").label("month")
    result = await db.execute(
        select(month_col, func.sum(Transaction.amount).label("total"))
        .where(Transaction.transaction_date.between(start_date, end_date))
        .group_by(month_col)
        .order_by(month_col)
    )
    totals = {str(r.month): float(r.total or 0) for r in result.all()}

    # 거래가 없는 달도 0으로 채워 그래프가 끊기지 않게 한다
    data = []
    y, m = start_date.year, start_date.month
    while (y, m) <= (end_date.year, end_date.month):
        key = f"{y:04d}-{m:02d}"
        data.append({"month": key, "total": totals.get(key, 0.0)})
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    return ApiResponse(success=True, data={"cashflow": data})


@router.get("/expense", response_model=ApiResponse[dict])
async def expense_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_user),
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
