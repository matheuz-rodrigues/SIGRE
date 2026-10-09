"""add auth_events and user_mfa tables

Revision ID: e5f6a7b8c9d0
Revises: c1d2e3f4a5b6
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'auth_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=20), nullable=False),
        sa.Column('identifier', sa.String(length=255), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_auth_events_type_identifier_created', 'auth_events', ['event_type', 'identifier', 'created_at'])
    op.create_index('ix_auth_events_type_ip_created', 'auth_events', ['event_type', 'ip', 'created_at'])

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


def downgrade() -> None:
    op.drop_table('user_mfa')
    op.drop_index('ix_auth_events_type_ip_created', table_name='auth_events')
    op.drop_index('ix_auth_events_type_identifier_created', table_name='auth_events')
    op.drop_table('auth_events')
