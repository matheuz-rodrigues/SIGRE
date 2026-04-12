"""google_event_id na alocacao; fk_alocacao em solicitacoes

Revision ID: c7f1a2b3c4d5
Revises: b2c8e1a0f3d4
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c7f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "b2c8e1a0f3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("alocacao", sa.Column("google_event_id", sa.String(length=255), nullable=True))
    op.add_column("solicitacoes", sa.Column("fk_alocacao", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_solicitacoes_alocacao",
        "solicitacoes",
        "alocacao",
        ["fk_alocacao"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_solicitacoes_alocacao", "solicitacoes", type_="foreignkey")
    op.drop_column("solicitacoes", "fk_alocacao")
    op.drop_column("alocacao", "google_event_id")
