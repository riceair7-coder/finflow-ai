import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import auth, transactions, settlements, invoices, ar_tracker, reports, vendors, departments, users
from app.websocket.router import router as ws_router
from app.core.exceptions import add_exception_handlers
from app.database import create_tables, migrate_schema, AsyncSessionLocal


async def _bootstrap_admin():
    """ADMIN_EMAIL/PASSWORD가 .env에 있고 해당 사용자가 없으면 admin 계정 생성."""
    import uuid as _uuid
    from sqlalchemy import select
    from app.config import settings as _settings
    from app.models.user import User, UserRole
    from app.services.auth_service import hash_password

    if not _settings.admin_email or not _settings.admin_password:
        return

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == _settings.admin_email))
        if existing.scalar_one_or_none():
            return
        db.add(User(
            id=str(_uuid.uuid4()),
            email=_settings.admin_email,
            hashed_password=hash_password(_settings.admin_password),
            name=_settings.admin_name,
            role=UserRole.admin,
            is_active=True,
        ))
        await db.commit()
        print(f"✅ 부트스트랩 admin 생성: {_settings.admin_email}")


async def _seed_demo_data():
    """로컬 개발용 데모 데이터 삽입"""
    from sqlalchemy import select
    from app.models.account import Department
    from app.models.vendor import Vendor
    from app.models.transaction import Transaction, TransactionSource, TransactionStatus
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.settlement import Settlement, SettlementStatus

    async with AsyncSessionLocal() as db:
        # 이미 데이터 있으면 스킵
        count = await db.execute(select(Vendor))
        if count.scalars().first():
            return

        # 부서 4개
        depts = [
            Department(id=str(uuid.uuid4()), code="DEV", name="개발팀", cost_center="CC001"),
            Department(id=str(uuid.uuid4()), code="MKT", name="마케팅팀", cost_center="CC002"),
            Department(id=str(uuid.uuid4()), code="OPS", name="운영팀", cost_center="CC003"),
            Department(id=str(uuid.uuid4()), code="GEN", name="총무팀", cost_center="CC004"),
        ]
        for d in depts:
            db.add(d)
        await db.flush()

        # 거래처 3개 (부서 연결)
        vendors = [
            Vendor(id=str(uuid.uuid4()), business_registration_no="1234567890", name="(주)테크솔루션", email="tech@example.com", payment_terms_days=30, department_id=depts[0].id),
            Vendor(id=str(uuid.uuid4()), business_registration_no="9876543210", name="마케팅파트너스", email="mkt@example.com", payment_terms_days=15, department_id=depts[1].id),
            Vendor(id=str(uuid.uuid4()), business_registration_no="5555555555", name="클라우드인프라(주)", email="cloud@example.com", payment_terms_days=30, department_id=depts[2].id),
        ]
        for v in vendors:
            db.add(v)
        await db.flush()

        # 거래 내역 10건
        today = date.today()
        tx_data = [
            ("AWS 서버비 2024-03", 2_850_000, "52100", vendors[2], TransactionStatus.approved),
            ("구글 광고비", 1_200_000, "55100", vendors[1], TransactionStatus.approved),
            ("택시 영수증 출장", 35_000, "51100", None, TransactionStatus.classified),
            ("스타벅스 팀 미팅", 48_000, "51200", None, TransactionStatus.classified),
            ("KTX 부산 출장", 118_000, "51110", None, TransactionStatus.approved),
            ("테크솔루션 개발용역비", 8_500_000, "52100", vendors[0], TransactionStatus.approved),
            ("페이스북 광고", 980_000, "55100", vendors[1], TransactionStatus.approved),
            ("호텔 숙박비", 220_000, "51300", None, TransactionStatus.pending),
            ("미분류 비용", 75_000, "99999", None, TransactionStatus.pending),
            ("클라우드 CDN 비용", 430_000, "52100", vendors[2], TransactionStatus.approved),
        ]
        txs = []
        for i, (desc, amount, code, vendor, status) in enumerate(tx_data):
            tx = Transaction(
                id=str(uuid.uuid4()),
                transaction_date=date(today.year, today.month, max(1, today.day - i)),
                amount=amount,
                description=desc,
                account_code=code,
                vendor_id=vendor.id if vendor else None,
                status=status,
                source=TransactionSource.manual,
                ai_classification_confidence=0.92 if status != TransactionStatus.pending else None,
            )
            db.add(tx)
            txs.append(tx)

        # 청구서 4건
        inv1 = Invoice(
            id=str(uuid.uuid4()), invoice_no="INV-2026001",
            vendor_id=vendors[0].id,
            issue_date=date(today.year, today.month, 1),
            due_date=date(today.year, today.month, 30),
            subtotal=8_500_000, tax_amount=850_000, total_amount=9_350_000,
            status=InvoiceStatus.sent,
            sent_at=datetime.now(),
            items=[{"description": "개발용역", "quantity": 1, "unit_price": 8_500_000, "amount": 8_500_000}],
        )
        inv2 = Invoice(
            id=str(uuid.uuid4()), invoice_no="INV-2026002",
            vendor_id=vendors[1].id,
            issue_date=date(today.year, today.month, 5),
            due_date=date(today.year, today.month, 20),
            subtotal=2_180_000, tax_amount=218_000, total_amount=2_398_000,
            status=InvoiceStatus.overdue,
            sent_at=datetime.now(),
            items=[{"description": "광고비", "quantity": 1, "unit_price": 2_180_000, "amount": 2_180_000}],
        )
        inv3 = Invoice(
            id=str(uuid.uuid4()), invoice_no="INV-2026003",
            vendor_id=vendors[2].id,
            issue_date=date(today.year, today.month, 10),
            due_date=date(today.year, today.month + 1 if today.month < 12 else 1, 10),
            subtotal=3_280_000, tax_amount=328_000, total_amount=3_608_000,
            status=InvoiceStatus.draft,
            items=[{"description": "클라우드 인프라", "quantity": 1, "unit_price": 3_280_000, "amount": 3_280_000}],
        )
        inv4 = Invoice(
            id=str(uuid.uuid4()), invoice_no="INV-2025012",
            vendor_id=vendors[0].id,
            issue_date=date(today.year, max(1, today.month - 1), 1),
            due_date=date(today.year, max(1, today.month - 1), 28),
            subtotal=7_000_000, tax_amount=700_000, total_amount=7_700_000,
            status=InvoiceStatus.paid,
            sent_at=datetime.now(), paid_at=datetime.now(),
            items=[{"description": "개발용역 (이전달)", "quantity": 1, "unit_price": 7_000_000, "amount": 7_000_000}],
        )
        for inv in [inv1, inv2, inv3, inv4]:
            db.add(inv)

        # 정산 2건
        stl1 = Settlement(
            id=str(uuid.uuid4()), settlement_no="STL-2026001",
            vendor_id=vendors[0].id,
            period_start=date(today.year, today.month, 1),
            period_end=date(today.year, today.month, 28),
            total_amount=8_500_000,
            matched_transactions=[txs[0].id, txs[5].id],
            status=SettlementStatus.reviewing,
        )
        stl2 = Settlement(
            id=str(uuid.uuid4()), settlement_no="STL-2026002",
            vendor_id=vendors[1].id,
            period_start=date(today.year, today.month, 1),
            period_end=date(today.year, today.month, 28),
            total_amount=2_180_000,
            matched_transactions=[txs[1].id, txs[6].id],
            status=SettlementStatus.pending,
        )
        for stl in [stl1, stl2]:
            db.add(stl)

        await db.commit()
        print("✅ 데모 데이터 삽입 완료")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await create_tables()
    await migrate_schema()
    await _bootstrap_admin()
    await _seed_demo_data()
    yield
    # shutdown (필요 시 정리)


app = FastAPI(
    title="FinFlow AI API",
    description="AI-powered financial management platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["transactions"])
app.include_router(settlements.router, prefix="/api/v1/settlements", tags=["settlements"])
app.include_router(invoices.router, prefix="/api/v1/invoices", tags=["invoices"])
app.include_router(ar_tracker.router, prefix="/api/v1/ar", tags=["ar"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(vendors.router, prefix="/api/v1/vendors", tags=["vendors"])
app.include_router(departments.router, prefix="/api/v1/departments", tags=["departments"])
app.include_router(ws_router, tags=["websocket"])

add_exception_handlers(app)
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/", include_in_schema=False)
async def root():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "service": "finflow-api"}
