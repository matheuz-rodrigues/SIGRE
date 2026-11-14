"""alocacao: google_owner_id (dono do evento na Agenda Google)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-11-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK_NAME = 'fk_alocacao_google_owner_id_usuarios'


def upgrade() -> None:
    # Nulo nas reservas antigas: a API descobre o dono na primeira edição ou exclusão e grava
    op.add_column('alocacao', sa.Column('google_owner_id', sa.Integer(), nullable=True))
    op.create_foreign_key(FK_NAME, 'alocacao', 'usuarios', ['google_owner_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(FK_NAME, 'alocacao', type_='foreignkey')
    op.drop_column('alocacao', 'google_owner_id')
