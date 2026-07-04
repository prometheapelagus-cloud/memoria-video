from redis.asyncio import Redis, ConnectionPool
from app.config import settings

_pool: ConnectionPool | None = None


async def get_redis() -> Redis:
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(settings.redis_url, decode_responses=True)
    return Redis(connection_pool=_pool)


async def close_redis():
    global _pool
    if _pool:
        await _pool.disconnect()
        _pool = None
