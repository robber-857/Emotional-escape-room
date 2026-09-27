"""Initial L1 sessions and immutable action receipts."""
from alembic import op
import sqlalchemy as sa
revision = "0001_l1"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("game_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("rules_version", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("positions", sa.JSON(), nullable=False))
    op.create_table("game_events",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("game_sessions.id"), primary_key=True),
        sa.Column("action_id", sa.String(36), primary_key=True),
        sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("received_at", sa.String(40), nullable=False))

def downgrade():
    op.drop_table("game_events")
    op.drop_table("game_sessions")
