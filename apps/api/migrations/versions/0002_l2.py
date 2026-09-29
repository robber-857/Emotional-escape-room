"""Add L2 runs linked to existing L1 sessions without rewriting L1 data."""
from alembic import op
import sqlalchemy as sa
revision = "0002_l2"
down_revision = "0001_l1"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("l2_runs",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("game_sessions.id"), primary_key=True),
        sa.Column("rules_version", sa.String(40), nullable=False), sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False), sa.Column("time_anchor", sa.String(40), nullable=True))
    op.create_table("l2_events",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("l2_runs.session_id"), primary_key=True),
        sa.Column("action_id", sa.String(36), primary_key=True), sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False), sa.Column("received_at", sa.String(40), nullable=False))

def downgrade():
    op.drop_table("l2_events")
    op.drop_table("l2_runs")
