from arq import create_pool
from arq.connections import RedisSettings


async def gerar_video(ctx, pedido_id: str, script_mpt: dict):
    return {"status": "ok", "pedido_id": pedido_id}


async def enviar_whatsapp(ctx, conversa_id: int, texto: str, media_gridfs_id: str | None = None):
    return {"status": "sent", "conversa_id": conversa_id}


class WorkerSettings:
    functions = [gerar_video, enviar_whatsapp]
    redis_settings = RedisSettings(host="redis", port=6379)
    max_tries = 3
    job_timeout = 600
