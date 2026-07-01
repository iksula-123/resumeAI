import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

_BASE_DIR = Path(__file__).parent
_env_file = _BASE_DIR.parent / ".env.local"
if _env_file.exists():
    load_dotenv(_env_file, override=True)

# ─────────────────────────────────────────────────────────────────────────────
# Database URL resolution
#
# Priority:
#   1. DATABASE_URL from .env.local — IF it has a real password (no placeholder)
#   2. Local SQLite file (zero config, works immediately)
#
# To use Supabase/Postgres instead: set a real password in DATABASE_URL.
# ─────────────────────────────────────────────────────────────────────────────
_raw_url = os.getenv("DATABASE_URL", "").strip()

_PLACEHOLDERS = ("YOUR_DB_PASSWORD", "[PASSWORD]", "password@", "")


def _is_usable_postgres(url: str) -> bool:
    if not url:
        return False
    if not url.startswith(("postgresql", "postgres")):
        return False
    # Reject if it still contains an obvious placeholder password
    return not any(ph and ph in url for ph in ("YOUR_DB_PASSWORD", "[PASSWORD]"))


if _is_usable_postgres(_raw_url):
    DATABASE_URL = _raw_url
    IS_SQLITE = False
else:
    # SQLite fallback — stored next to the backend code
    _db_path = (_BASE_DIR / "resumeai.db").as_posix()
    DATABASE_URL = f"sqlite+aiosqlite:///{_db_path}"
    IS_SQLITE = True

if IS_SQLITE:
    _connect_args = {"check_same_thread": False}
    _engine_kwargs = {}
else:
    # Supabase transaction pooler runs PgBouncer in transaction mode, which is
    # incompatible with asyncpg's prepared-statement cache — disabling it
    # (statement_cache_size=0) is the documented fix. pre_ping handles
    # connections the pooler may have dropped between requests.
    _connect_args = {"statement_cache_size": 0}
    _engine_kwargs = {"pool_pre_ping": True}

engine = create_async_engine(
    DATABASE_URL, echo=False, connect_args=_connect_args, **_engine_kwargs
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables. Imports models so they register on Base.metadata."""
    import models  # noqa: F401  (ensures models are registered)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
