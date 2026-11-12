"""Seed mínimo: apenas administrador (cadastros via painel ou scripts/seed.py)

Revision ID: 8e9a7ae084c1
Revises:
Create Date: 2025-11-17 21:35:14.835643

"""
from typing import Sequence, Union

from alembic import op

revision: str = "8e9a7ae084c1"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Não cria mais administrador com senha fixa. O admin inicial é criado no startup
    # (app/main.py:_seed_admin) a partir de ADMIN_SEED_PASSWORD, definida por ambiente.
    pass


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM usuarios WHERE email IN (
            'admin@uepa.br', 'admin@admin.com', 'prof@uepa.br', 'aluno@uepa.br'
        );
        """
    )
    op.execute(
        "DELETE FROM salas WHERE codigo_sala IN (101, 102, 201, 202, 300, 401);"
    )
