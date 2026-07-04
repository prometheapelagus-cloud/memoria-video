from app.database.redis import get_redis
import time

GLOBAL_LIMIT = 100
CONVERSATION_LIMIT = 20
WINDOW_SEC = 60


async def _rate_limit_counter(redis, key: str, limit: int) -> tuple[bool, int]:
    now = time.time()
    window_start = now - WINDOW_SEC
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, WINDOW_SEC)
    _, count, _, _ = await pipe.execute()
    return count <= limit, max(0, limit - count)


async def allow(conversation_id: int | str) -> bool:
    redis = await get_redis()
    ok_global, _ = await _rate_limit_counter(redis, "rate_limit:global", GLOBAL_LIMIT)
    if not ok_global:
        return False
    ok_conv, _ = await _rate_limit_counter(redis, f"rate_limit:{conversation_id}", CONVERSATION_LIMIT)
    return ok_conv


async def get_remaining(conversation_id: int | str) -> dict[str, int]:
    redis = await get_redis()
    now = time.time()
    ws = now - WINDOW_SEC
    await redis.zremrangebyscore("rate_limit:global", 0, ws)
    await redis.zremrangebyscore(f"rate_limit:{conversation_id}", 0, ws)
    g = await redis.zcard("rate_limit:global")
    c = await redis.zcard(f"rate_limit:{conversation_id}")
    return {"global": max(0, GLOBAL_LIMIT - g), "conversation": max(0, CONVERSATION_LIMIT - c)}


async def ban(conversation_id: int | str, duration_sec: int = 300):
    redis = await get_redis()
    await redis.setex(f"ban:{conversation_id}", duration_sec, "1")


async def unban(conversation_id: int | str):
    redis = await get_redis()
    await redis.delete(f"ban:{conversation_id}")


async def is_banned(conversation_id: int | str) -> bool:
    redis = await get_redis()
    return await redis.exists(f"ban:{conversation_id}")


async def reset_limits(conversation_id: int | str | None = None):
    redis = await get_redis()
    if conversation_id:
        await redis.delete(f"rate_limit:{conversation_id}")
    else:
        keys = await redis.keys("rate_limit:*")
        if keys:
            await redis.delete(*keys)
    return 0
