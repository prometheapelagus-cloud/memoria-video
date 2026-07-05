"""Webhooks recebidos do Chatwoot."""
import json
import logging

from fastapi import APIRouter, Request, HTTPException

from app.database.redis import get_redis
from app.services.bouncer import allow, is_banned

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chatwoot/message")
async def chatwoot_message(request: Request):
    """Recebe webhook de mensagem do Chatwoot e enfileira para processamento."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    conversation_id = (
        payload.get("conversation", {}).get("id")
        or payload.get("conversation_id")
    )
    message_type = payload.get("message_type", "")
    content = payload.get("content", "")
    attachments = payload.get("attachments", [])
    contact = payload.get("contact", {}) or payload.get("meta", {}).get("sender", {})

    if not conversation_id:
        logger.warning("Webhook sem conversation_id")
        return {"status": "ignored", "reason": "sem conversation_id"}

    # Verificar rate limit / ban
    if await is_banned(conversation_id):
        logger.info("Conversa %s está banida, ignorando", conversation_id)
        return {"status": "ignored", "reason": "banned"}

    if not await allow(conversation_id):
        logger.warning("Rate limit excedido para conversa %s", conversation_id)
        return {"status": "ignored", "reason": "rate_limited"}

    # Publicar no Redis para processamento assíncrono
    try:
        redis = await get_redis()
        await redis.rpush(
            "fila:chatwoot_messages",
            json.dumps({
                "conversation_id": conversation_id,
                "message_type": message_type,
                "content": content,
                "attachments": attachments,
                "contact": contact,
                "raw_payload": payload,
            }),
        )
        logger.info("Mensagem %s da conversa %s enfileirada", message_type, conversation_id)
    except Exception as e:
        logger.error("Erro ao enfileirar mensagem: %s", e)

    return {"status": "received", "conversation_id": conversation_id}


@router.post("/chatwoot/conversation")
async def chatwoot_conversation(request: Request):
    """Recebe webhook de atualização de conversa do Chatwoot."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    conversation_id = payload.get("id") or payload.get("conversation", {}).get("id")
    status = payload.get("status") or payload.get("conversation", {}).get("status")

    if not conversation_id:
        return {"status": "ignored", "reason": "sem conversation_id"}

    logger.info("Conversa %s atualizada para status %s", conversation_id, status)

    # Publicar no Redis
    try:
        redis = await get_redis()
        await redis.rpush(
            "fila:chatwoot_conversations",
            json.dumps({
                "conversation_id": conversation_id,
                "status": status,
                "raw_payload": payload,
            }),
        )
    except Exception as e:
        logger.error("Erro ao enfileirar conversa: %s", e)

    return {"status": "received", "conversation_id": conversation_id}