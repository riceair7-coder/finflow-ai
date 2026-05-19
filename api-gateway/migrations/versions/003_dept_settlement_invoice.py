"""add department_id to settlements/invoices and settlement_id to invoices

Revision ID: 003
Revises: 002
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("settlements", sa.Column("department_id", sa.String(36), nullable=True))
    op.add_column("invoices", sa.Column("department_id", sa.String(36), nullable=True))
    op.add_column("invoices", sa.Column("settlement_id", sa.String(36), nullable=True))
    op.create_unique_constraint(
        "invoices_settlement_id_key", "invoices", ["settlement_id"]
    )
    op.create_foreign_key(
        "invoices_settlement_id_fkey",
        "invoices", "settlements",
        ["settlement_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("invoices_settlement_id_fkey", "invoices", type_="foreignkey")
    op.drop_constraint("invoices_settlement_id_key", "invoices", type_="unique")
    op.drop_column("invoices", "settlement_id")
    op.drop_column("invoices", "department_id")
    op.drop_column("settlements", "department_id")
