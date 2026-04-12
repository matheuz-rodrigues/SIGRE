"""disciplinas.fk_curso; garante admin aprovado após seed antigo

Revision ID: d8a0c1e2f3a4
Revises: c7f1a2b3c4d5
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d8a0c1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "c7f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("disciplinas", sa.Column("fk_curso", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_disciplinas_curso",
        "disciplinas",
        "cursos",
        ["fk_curso"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE usuarios
        SET status = 'aprovado',
            username = COALESCE(NULLIF(TRIM(username), ''), 'admin')
        WHERE email = 'admin@uepa.br' AND tipo_usuario = 3;
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_disciplinas_curso", "disciplinas", type_="foreignkey")
    op.drop_column("disciplinas", "fk_curso")
