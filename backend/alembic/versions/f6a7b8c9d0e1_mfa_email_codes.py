"""troca o MFA por app autenticador (user_mfa) por código enviado por e-mail (mfa_codes)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-04 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('user_mfa')
    op.create_table(
        'mfa_codes',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('mfa_codes')
    op.create_table(
        'user_mfa',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('secret_encrypted', sa.String(length=255), nullable=False),
        sa.Column('enabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_step', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )
