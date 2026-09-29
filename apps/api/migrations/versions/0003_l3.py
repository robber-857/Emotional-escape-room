"""Add L3 without changing any L1/L2 rows or receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0003_l3"
down_revision = "0002_l2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("l3_runs",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("l2_runs.session_id"), primary_key=True),
        sa.Column("rules_version", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("state", sa.JSON(), nullable=False))
    op.create_table("l3_events",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("l3_runs.session_id"), primary_key=True),
        sa.Column("action_id", sa.String(36), primary_key=True), sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False), sa.Column("received_at", sa.String(40), nullable=False))


def downgrade():
    op.drop_table("l3_events")
    op.drop_table("l3_runs")
