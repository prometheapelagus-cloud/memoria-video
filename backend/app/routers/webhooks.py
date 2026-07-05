import io
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request
from sqlalchemy import select

from app.config import settings
from app.database.mongodb import get_db, get_gridfs
from app.database.postgres import get_session
from app.database.redis import get_redis
from app.models.cliente import Cliente
from app.models.evento import Evento
from app.models.pedido import Pedido
from app.services.chatwoot import chatwoot_client
from app.services import session as sess

logger = logging.getLogger(__name__)

router = APIRouter()

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

_AVATAR_NOMES = ["avatar1.png", "avatar2.png", "avatar3.png", "avatar4.png", "avatar5.png"]


async def _salvar_ou_atualizar_cliente(conversation_id: int, nome: str) -> Cliente:
    async with get_session() as db:
        result = await db.execute(select(Cliente).where(Cliente.chatwoot_conversation_id == conversation_id))
        cliente = result.scalar_one_or_none()
        if cliente:
            cliente.nome = nome
        else:
            cliente = Cliente(chatwoot_conversation_id=conversation_id, nome=nome)
            db.add(cliente)
        await db.commit()
        await db.refresh(cliente)
        return cliente


async def _criar_pedido(conversation_id: int, cliente_id, event_slug: str):
    async with get_session() as db:
        result = await db.execute(
            select(Evento).where(Evento.slug == event_slug, Evento.ativo.is_(True))
        )
        evento = result.scalar_one_or_none()
        if not evento:
            return None
        pedido = Pedido(cliente_id=cliente_id, evento_id=evento.id, status="awaiting_photos")
        db.add(pedido)
        await db.commit()
        await db.refresh(pedido)
        return pedido


async def _atualizar_foto_count(pedido_id, total: int):
    async with get_session() as db:
        result = await db.execute(select(Pedido).where(Pedido.id == pedido_id))
        pedido = result.scalar_one_or_none()
        if pedido:
            pedido.qtd_fotos_enviadas = total
            await db.commit()


async def _get_eventos_menu() -> str:
    async with get_session() as db:
        result = await db.execute(select(Evento).where(Evento.ativo.is_(True)).order_by(Evento.nome))
        eventos = result.scalars().all()
        if not eventos:
            return "😞 *Nenhum evento disponível no momento.*"
        lines = ["🎬 *Memórias em Vídeo* 🎬\n", "Olá! Vamos criar seu vídeo personalizado.\n"]
        lines.append("*Escolha o tipo de evento:*\n")
        for i, ev in enumerate(eventos, 1):
            lines.append(f"{i}👉 {ev.nome}")
        lines.append("\n*Digite o número da opção desejada:*")
        return "\n".join(lines)
