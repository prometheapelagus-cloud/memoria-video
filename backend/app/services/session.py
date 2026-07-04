from app.database.redis import get_redis

VALID_STATES = {
    "awaiting_event_type", "awaiting_name", "collecting_photos",
    "confirming_photos", "analyzing", "curating", "generating",
    "awaiting_feedback", "revision", "completed",
}


async def get_session(conversation_id: int) -> dict:
    redis = await get_redis()
    data = await redis.hgetall(f"session:{conversation_id}")
    if not data:
        return {"state": "awaiting_event_type", "pedido_id": None, "cliente_id": None, "foto_count": 0, "evento_slug": None}
    return {k: v for k, v in data.items()}


async def set_session(conversation_id: int, data: dict):
    redis = await get_redis()
    await redis.hset(f"session:{conversation_id}", mapping=data)
    await redis.expire(f"session:{conversation_id}", 86400)


async def save_session(conversation_id: int, data: dict):
    await set_session(conversation_id, data)


async def update_state(conversation_id: int, state: str, extra: dict | None = None):
    if state not in VALID_STATES:
        raise ValueError(f"Estado inválido: {state}")
    data = await get_session(conversation_id)
    data["state"] = state
    if extra:
        data.update(extra)
    await set_session(conversation_id, data)


async def clear_session(conversation_id: int):
    redis = await get_redis()
    await redis.delete(f"session:{conversation_id}")


async def delete_session(conversation_id: int):
    await clear_session(conversation_id)


async def reset_session(conversation_id: int):
    await clear_session(conversation_id)


async def get_ai_cache(key: str) -> str | None:
    redis = await get_redis()
    return await redis.get(f"ia:cache:{key}")


async def set_ai_cache(key: str, value: str, ttl: int = 900):
    redis = await get_redis()
    await redis.setex(f"ia:cache:{key}", ttl, value)
