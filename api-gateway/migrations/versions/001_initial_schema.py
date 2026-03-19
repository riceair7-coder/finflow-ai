"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # accounts
    op.create_table(
        "accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("code", sa.String(10), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.Enum("asset", "liability", "equity", "revenue", "expense", name="accountcategory"), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # departments
    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cost_center", sa.String(20), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # vendors
    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("business_registration_no", sa.String(12), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("representative", sa.String(100), nullable=True),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(100), nullable=True),
        sa.Column("bank_info", postgresql.JSONB, nullable=True),
        sa.Column("payment_terms_days", sa.Integer, server_default="30"),
        sa.Column("credit_limit", sa.Numeric(15, 2), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_vendors_name_trgm", "vendors", ["name"], postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"})

    # transactions
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("external_id", sa.String(100), unique=True, nullable=True),
        sa.Column("transaction_date", sa.Date, nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(3), server_default="KRW"),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("account_code", sa.String(10), nullable=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.Enum("pending", "classified", "approved", "rejected", name="transactionstatus"), server_default="pending"),
        sa.Column("ai_classification_confidence", sa.Float, nullable=True),
        sa.Column("source", sa.Enum("card", "bank", "manual", "ocr", "hometax", name="transactionsource"), server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_transactions_date", "transactions", ["transaction_date"])
    op.create_index("ix_transactions_vendor", "transactions", ["vendor_id"])
    op.create_index("ix_transactions_status", "transactions", ["status"])

    # invoices
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("invoice_no", sa.String(50), nullable=False, unique=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(15, 2), server_default="0"),
        sa.Column("total_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("status", sa.Enum("draft", "sent", "paid", "overdue", "cancelled", name="invoicestatus"), server_default="draft"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("items", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_invoices_vendor", "invoices", ["vendor_id"])
    op.create_index("ix_invoices_due_date", "invoices", ["due_date"])
    op.create_index("ix_invoices_status", "invoices", ["status"])

    # settlements
    op.create_table(
        "settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("settlement_no", sa.String(50), nullable=False, unique=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("total_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("matched_transactions", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.Enum("pending", "reviewing", "approved", "rejected", "paid", name="settlementstatus"), server_default="pending"),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_settlements_vendor", "settlements", ["vendor_id"])
    op.create_index("ix_settlements_status", "settlements", ["status"])

    # seed: basic chart of accounts
    op.execute("""
    INSERT INTO accounts (id, code, name, category) VALUES
        (uuid_generate_v4(), '11000', '현금및현금성자산', 'asset'),
        (uuid_generate_v4(), '12000', '매출채권', 'asset'),
        (uuid_generate_v4(), '21000', '매입채무', 'liability'),
        (uuid_generate_v4(), '41000', '매출액', 'revenue'),
        (uuid_generate_v4(), '51100', '교통비', 'expense'),
        (uuid_generate_v4(), '51110', '출장교통비', 'expense'),
        (uuid_generate_v4(), '51200', '복리후생비', 'expense'),
        (uuid_generate_v4(), '51300', '숙박비', 'expense'),
        (uuid_generate_v4(), '52100', '서버비', 'expense'),
        (uuid_generate_v4(), '55100', '광고선전비', 'expense'),
        (uuid_generate_v4(), '99999', '미분류', 'expense')
    ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("settlements")
    op.drop_table("invoices")
    op.drop_table("transactions")
    op.drop_table("vendors")
    op.drop_table("departments")
    op.drop_table("accounts")
    op.execute("DROP TYPE IF EXISTS settlementstatus")
    op.execute("DROP TYPE IF EXISTS invoicestatus")
    op.execute("DROP TYPE IF EXISTS transactionstatus")
    op.execute("DROP TYPE IF EXISTS transactionsource")
    op.execute("DROP TYPE IF EXISTS accountcategory")
