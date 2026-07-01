import os
import re
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Import Base so models are registered
from database import Base
import models  # noqa: F401 — registers all ORM models

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_url(async_url: str) -> str:
    """Convert asyncpg URL to psycopg2 for Alembic sync runner."""
    return re.sub(r"postgresql\+asyncpg://", "postgresql+psycopg2://", async_url)


def _get_url() -> str:
    raw = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url", ""))
    return _sync_url(raw)


def run_migrations_offline() -> None:
    url = _get_url()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
