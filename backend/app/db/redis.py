import redis.asyncio as redis

from app.core.settings import settings

# Global connection pool — lazily initialized
_pool: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    """Get (or create) a shared async Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return _pool


async def close_redis() -> None:
    """Gracefully close the Redis connection pool."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
