"""Professor matricula opcional (nullable)

Revision ID: b2c8e1a0f3d4
Revises: 1a542990513e
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c8e1a0f3d4"
down_revision: Union[str, Sequence[str], None] = "1a542990513e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "professores",
        "matricula",
        existing_type=sa.String(length=50),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "professores",
        "matricula",
        existing_type=sa.String(length=50),
        nullable=False,
    )
