from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# SQLite는 check_same_thread=False 필요
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    """SQLite 로컬 개발용 테이블 자동 생성"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def migrate_schema() -> None:
    """기존 배포 환경의 누락 컬럼을 idempotent하게 추가한다.

    create_tables()는 신규 테이블만 만들고 컬럼은 추가하지 않으므로,
    여기서 ALTER TABLE IF NOT EXISTS로 점진적 변경을 적용한다.
    PostgreSQL >= 9.6 및 SQLite >= 3.35에서 IF NOT EXISTS 지원.
    """
    statements = [
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS supply_amount NUMERIC(15,2)",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2)",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_at DATE",
        "ALTER TABLE settlements ADD COLUMN IF NOT EXISTS department_id VARCHAR(36)",
        "ALTER TABLE settlements ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(36)",
        "ALTER TABLE settlements ADD CONSTRAINT settlements_invoice_id_fkey "
        "FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS department_id VARCHAR(36)",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS settlement_id VARCHAR(36)",
        # 발급 정산-청구서 (legacy 1:1 컬럼은 호환용으로 유지; 새 코드는 settlements.invoice_id 사용)
        "ALTER TABLE invoices ADD CONSTRAINT invoices_settlement_id_key UNIQUE (settlement_id)",
        "ALTER TABLE invoices ADD CONSTRAINT invoices_settlement_id_fkey "
        "FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL",
        # 정산 첨부파일 테이블 (006) — 거래명세서/영수증/견적서 등
        """CREATE TABLE IF NOT EXISTS settlement_attachments (
            id VARCHAR(36) PRIMARY KEY,
            settlement_id VARCHAR(36) NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
            filename VARCHAR(255) NOT NULL,
            stored_path VARCHAR(500) NOT NULL,
            content_type VARCHAR(100),
            file_size BIGINT NOT NULL DEFAULT 0,
            kind VARCHAR(40),
            uploaded_by VARCHAR(36),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""",
        "CREATE INDEX IF NOT EXISTS ix_settlement_attachments_settlement_id "
        "ON settlement_attachments (settlement_id)",
    ]
    # 각 statement를 별도 트랜잭션으로 — 하나가 실패해도(이미 존재 등) 후속은 진행
    for sql in statements:
        try:
            async with engine.begin() as conn:
                await conn.exec_driver_sql(sql)
        except Exception:
            pass
