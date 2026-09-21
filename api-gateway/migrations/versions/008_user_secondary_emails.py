"""user_secondary_emails table

Revision ID: 008
Revises: 007
Create Date: 2026-05-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_secondary_emails",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=200), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_user_secondary_emails_user_id",
        "user_secondary_emails",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_secondary_emails_user_id", table_name="user_secondary_emails")
    op.drop_table("user_secondary_emails")
