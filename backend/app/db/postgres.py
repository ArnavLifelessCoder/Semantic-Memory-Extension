from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.settings import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


# Async engine with connection pool
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables and install pgvector extension."""
    async with engine.begin() as conn:
        # Install pgvector extension
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Import models so they register with Base.metadata
        import app.models.user  # noqa: F401
        import app.models.page  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
