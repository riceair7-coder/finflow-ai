"""add transactions.is_prepaid and settlements.invoice_id (Invoice 1:N Settlement)

Revision ID: 005
Revises: 004
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("is_prepaid", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "settlements",
        sa.Column("invoice_id", sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        "settlements_invoice_id_fkey",
        "settlements", "invoices",
        ["invoice_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("settlements_invoice_id_fkey", "settlements", type_="foreignkey")
    op.drop_column("settlements", "invoice_id")
    op.drop_column("transactions", "is_prepaid")
