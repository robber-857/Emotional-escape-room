"""Add L4 without changing existing journey states or receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0004_l4"
down_revision = "0003_l3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("l4_runs",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("l3_runs.session_id"), primary_key=True),
        sa.Column("rules_version", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("state", sa.JSON(), nullable=False))
    op.create_table("l4_events",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("l4_runs.session_id"), primary_key=True),
        sa.Column("action_id", sa.String(36), primary_key=True), sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False), sa.Column("received_at", sa.String(40), nullable=False))


def downgrade():
    op.drop_table("l4_events")
    op.drop_table("l4_runs")
