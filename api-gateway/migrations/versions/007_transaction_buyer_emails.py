"""add buyer_email1, buyer_email2 to transactions

Revision ID: 007
Revises: 006
Create Date: 2026-05-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("buyer_email1", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("buyer_email2", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "buyer_email2")
    op.drop_column("transactions", "buyer_email1")
