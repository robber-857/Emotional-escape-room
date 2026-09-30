"""Immutable per-journey policy, group ledger and action score receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0005_scoring"
down_revision = "0004_l4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("score_evaluations",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("game_sessions.id"), primary_key=True),
        sa.Column("evaluation_id", sa.String(36), nullable=False, unique=True),
        sa.Column("policy", sa.JSON(), nullable=False), sa.Column("policy_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False))
    op.create_table("score_ledger",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("score_evaluations.session_id"), primary_key=True),
        sa.Column("group_id", sa.String(64), primary_key=True),
        sa.Column("level", sa.String(2), nullable=False),
        sa.Column("entry", sa.JSON(), nullable=False))
    op.create_table("score_actions",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("score_evaluations.session_id"), primary_key=True),
        sa.Column("level", sa.String(2), primary_key=True),
        sa.Column("action_id", sa.String(36), primary_key=True),
        sa.Column("receipt", sa.JSON(), nullable=False), sa.Column("created_at", sa.String(40), nullable=False))


def downgrade():
    op.drop_table("score_actions")
    op.drop_table("score_ledger")
    op.drop_table("score_evaluations")
