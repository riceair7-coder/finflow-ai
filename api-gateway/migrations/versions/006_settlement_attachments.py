"""settlement_attachments table

Revision ID: 006
Revises: 005
Create Date: 2026-05-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settlement_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("settlement_id", sa.String(36), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100)),
        sa.Column("file_size", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("kind", sa.String(40)),
        sa.Column("uploaded_by", sa.String(36)),
        sa.Column("uploaded_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["settlement_id"], ["settlements.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_settlement_attachments_settlement_id",
        "settlement_attachments", ["settlement_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_settlement_attachments_settlement_id", table_name="settlement_attachments")
    op.drop_table("settlement_attachments")
