"""add supply_amount and tax_amount to transactions

Revision ID: 002
Revises: 001
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("supply_amount", sa.Numeric(15, 2), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "tax_amount")
    op.drop_column("transactions", "supply_amount")
