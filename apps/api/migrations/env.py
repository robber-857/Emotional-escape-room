from alembic import context
from dotenv import load_dotenv
from app.db import make_engine, metadata
load_dotenv()
engine = make_engine()
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction(): context.run_migrations()
engine.dispose()
