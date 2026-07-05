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

async def _listar_eventos_ativos() -> list[Evento]:
    async with get_session() as db:
        result = await db.execute(select(Evento).where(Evento.ativo.is_(True)).order_by(Evento.nome))
        return list(result.scalars().all())


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


async def _criar_pedido(conversation_id: int, cliente_id, event_slug: str) -> Pedido | None:
    async with get_session() as db:
        result = await db.execute(select(Evento).where(Evento.slug == event_slug, Evento.ativo.is_(True)))
        evento = result.scalar_one_or_none()
        if not evento:
            return None
        pedido = Pedido(cliente_id=cliente_id, evento_id=evento.id, status="awaiting_photos")
        db.add(pedido)
        await db.commit()
        await db.refresh(pedido)
        return pedido


async def _atualizar_foto_count(pedido_id, total: int) -> None:
    async with get_session() as db:
        result = await db.execute(select(Pedido).where(Pedido.id == pedido_id))
        pedido = result.scalar_one_or_none()
        if pedido:
            pedido.qtd_fotos_enviadas = total
            await db.commit()


async def _enviar_menu_eventos(conversation_id: int) -> None:
    eventos = await _listar_eventos_ativos()
    if not eventos:
        try:
            await chatwoot_client.send_message(
                conversation_id=conversation_id,
                message="😞 Nenhum evento dispon\u00edvel no momento. Tente novamente mais tarde.",
            )
        except Exception as exc:
            logger.error("Falha ao enviar mensagem de eventos vazia: %s", exc)
        return

    lines = [
        "\U0001f3ac *Mem\u00f3rias em V\u00eddeo* \U0001f3ac\n",
        "Ol\u00e1! Vamos criar seu v\u00eddeo personalizado.\n",
        "*Escolha o tipo de evento:*\n",
    ]
    for i, ev in enumerate(eventos, 1):
        lines.append(f"{i}\U0001f449 {ev.nome}")
    lines.append("\n*Digite o n\u00famero da op\u00e7\u00e3o desejada:*")

    try:
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message="\n".join(lines),
        )
    except Exception as exc:
        logger.error("Falha ao enviar menu de eventos: %s", exc)


async def _enviar_prompt_nome(conversation_id: int) -> None:
    try:
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message="\U0001f60d *Qual o seu nome?*",
        )
    except Exception as exc:
        logger.error("Falha ao enviar prompt de nome: %s", exc)


async def _enviar_prompt_fotos(conversation_id: int, slug_evento: str) -> None:
    nomes_evento = {
        "aniversario": "Anivers\u00e1rio \U0001f382",
        "casamento": "Casamento \U0001f491",
        "formatura": "Formatura \U0001f393",
        "natal": "Natal \U0001f384",
        "reveillon": "R\u00e9veillon \U0001f386",
        "pascoa": "P\u00e1scoa \U0001f423",
        "dia-das-maes": "Dia das M\u00e3es \U0001f490",
        "dia-dos-pais": "Dia dos Pais \U0001f464",
        "confraternizacao": "Confraterniza\u00e7\u00e3o \U0001f973",
        "outro": "Especial \u2122\ufe0f",
    }
    nome_evento = nomes_evento.get(slug_evento, slug_evento)
    try:
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message=(
                f"\U0001f4f8 *Evento:* {nome_evento}\n\n"
                "*Agora, me envie as fotos!* \U0001f4f7\n\n"
                "Voc\u00ea pode enviar v\u00e1rias fotos de uma vez.\n"
                "Envie quantas quiser e digite *PRONTO* quando terminar.\n\n"
                "\u26a0\ufe0f *Limite:* At\u00e9 20 fotos por pedido."
            ),
        )
    except Exception as exc:
        logger.error("Falha ao enviar prompt de fotos: %s", exc)


async def _confirmar_recebimento_fotos(conversation_id: int, total_fotos: int, pedido_id: str) -> None:
    try:
        msg = (
            f"\U0001f4e1 *{total_fotos} foto(s) recebida(s) com sucesso!*\n\n"
            "Seu pedido ser\u00e1 processado em breve.\n"
            "Voc\u00ea receber\u00e1 uma notifica\u00e7\u00e3o quando o v\u00eddeo estiver pronto. \U0001f3ac"
        )
        if total_fotos >= 20:
            msg += "\n\n\u26a0\ufe0f *Aten\u00e7\u00e3o:* Voc\u00ea atingiu o limite de 20 fotos."

        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message=msg,
        )

        # Envia resumo
        pedido_ref = pedido_id[:8]
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message=f"\U0001f4cb *Resumo do Pedido*\nID: `{pedido_ref}`\nFotos: {total_fotos}\nStatus: \u23f3 Aguardando processamento",
        )
    except Exception as exc:
        logger.error("Falha ao confirmar fotos: %s", exc)


async def _finalizar_com_video(conversation_id: int, pedido_id: str) -> None:
    async with get_session() as db:
        from sqlalchemy import select
        result = await db.execute(select(Pedido).where(Pedido.id == uuid.UUID(pedido_id)))
        pedido = result.scalar_one_or_none()
        if pedido:
            pedido.status = "completed"
            pedido.completed_at = datetime.now(timezone.utc)
            await db.commit()

    try:
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message=(
                "\U0001f3ac *Seu v\u00eddeo ficou pronto!*\n\n"
                "Acesse o link abaixo para visualizar e baixar:\n"
                f"\U0001f517 https://admin.memoria.pelagus.com.br/#/pedido/{pedido_id}\n\n"
                "Obrigado por usar o Mem\u00f3rias em V\u00eddeo! \U0001f919"
            ),
        )
        await chatwoot_client.resolve_conversation(conversation_id)
    except Exception as exc:
        logger.error("Falha ao finalizar conversa: %s", exc)


async def _revisar_pedido(conversation_id: int, pedido_id: str) -> None:
    """
    Cliente pediu altera\u00e7\u00f5es — incrementa token_edicao, marca como revis\u00e3o
    e dispara reprocessamento.
    """
    async with get_session() as db:
        from sqlalchemy import select
        result = await db.execute(select(Pedido).where(Pedido.id == uuid.UUID(pedido_id)))
        pedido = result.scalar_one_or_none()
        if pedido:
            pedido.status = "revision"
            pedido.token_edicao += 1
            pedido.feedback_cliente = "cliente pediu revis\u00e3o"
            await db.commit()

    # Dispara reprocessamento
    try:
        from app.agents.orquestrador import orquestrador
        import asyncio
        asyncio.ensure_future(orquestrador.processar_pedido(pedido_id))
    except Exception as exc:
        logger.error("Falha ao disparar revis\u00e3o: %s", exc)

    try:
        await chatwoot_client.send_message(
            conversation_id=conversation_id,
            message="\U0001f4c4 *Seu pedido ser\u00e1 reprocessado com as altera\u00e7\u00f5es solicitadas!*\n\n"
            "Voc\u00ea receber\u00e1 uma notifica\u00e7\u00e3o quando o novo v\u00eddeo estiver pronto.",
        )
    except Exception as exc:
        logger.error("Falha ao notificar revis\u00e3o: %s", exc)


async def _garantir_sessao_chatwoot(inbox_id: int) -> bool:
    """Garante que a sess\u00e3o do Chatwoot est\u00e1 ativa."""
    chave = f"chatwoot:inbox:{inbox_id}:token"
    redis = await get_redis()
    token = await redis.get(chave)
    return bool(token)


# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------

_MENU_EVENTOS = (
    "\U0001f3ac *Mem\u00f3rias em V\u00eddeo* \U0001f3ac\n\n"
    "Ol\u00e1! Vamos criar seu v\u00eddeo personalizado.\n\n"
    "*Escolha o tipo de evento:*\n\n"
    "1\U0001f448\U0001f3c2 Anivers\u00e1rio\n"
    "2\U0001f448\U0001f491 Casamento\n"
    "3\U0001f448\U0001f393 Formatura\n"
    "4\U0001f448\U0001f384 Natal\n"
    "5\U0001f448\U0001f386 R\u00e9veillon\n"
    "6\U0001f448\U0001f423 P\u00e1scoa\n"
    "7\U0001f448\U0001f490 Dia das M\u00e3es\n"
    "8\U0001f448\U0001f464 Dia dos Pais\n"
    "9\U0001f448\U0001f973 Confraterniza\u00e7\u00e3o\n"
    "\U0001f54f Outro\n\n"
    "*Digite o n\u00famero da op\u00e7\u00e3o desejada:*"
)


@router.post("/chatwoot/message")
async def chatwoot_message_webhook(request: Request):
    """
    Webhook do Chatwoot para mensagens recebidas.
    Gerencia o fluxo: menu \u2192 nome \u2192 fotos \u2192 confirma\u00e7\u00e3o \u2192 processamento.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "detail": "invalid payload"}

    event = payload.get("event")
    if event != "message_created":
        return {"status": "ignored", "reason": f"event {event}"}

    conversation_id = (
        payload.get("conversation", {}).get("id")
        or payload.get("conversation_id")
    )
    message_type = payload.get("message", {}).get("message_type", "")
    content = (payload.get("message", {}) or {}).get("content", "") or ""
    attachments = (payload.get("message", {}) or {}).get("attachments", []) or []
    sender = (payload.get("message", {}) or {}).get("sender", {}) or {}

    # S\u00f3 processa mensagens incoming
    if message_type != "incoming":
        return {"status": "ignored", "reason": "not incoming"}

    if not conversation_id:
        return {"status": "ignored", "reason": "no conversation_id"}

    # Recupera sess\u00e3o da conversa
    redis = await get_redis()
    chave_sessao = f"chatwoot:flow:{conversation_id}"
    sessao_raw = await redis.get(chave_sessao)
    sessao = sessao_raw if isinstance(sessao_raw, dict) else {}
    if isinstance(sessao_raw, str):
        import json
        try:
            sessao = json.loads(sessao_raw)
        except (json.JSONDecodeError, TypeError):
            sessao = {}

    step = sessao.get("step", "menu")

    # Upload das fotos para o GridFS
    fotos_gridfs_ids = []
    if attachments:
        try:
            mongodb = await get_db()
            gridfs = get_gridfs(mongodb)
            for att in attachments:
                if "data_url" in att:
                    import base64
                    raw = att["data_url"]
                    if "," in raw:
                        raw = raw.split(",", 1)[1]
                    buf = base64.b64decode(raw)
                    file_id = await gridfs.upload_file(
                        buf,
                        filename=att.get("file_name", "foto.jpg"),
                        content_type=att.get("content_type", "image/jpeg"),
                    )
                    fotos_gridfs_ids.append(str(file_id))
        except Exception as exc:
            logger.error("Falha ao fazer upload de fotos para GridFS: %s", exc)

    # Processa baseado no step atual
    if step == "menu":
        eventos_map = {
            "1": "aniversario",
            "2": "casamento",
            "3": "formatura",
            "4": "natal",
            "5": "reveillon",
            "6": "pascoa",
            "7": "dia-das-maes",
            "8": "dia-dos-pais",
            "9": "confraternizacao",
            "10": "outro",
        }
        choice = content.strip()
        slug_evento = eventos_map.get(choice)
        if slug_evento:
            sessao["step"] = "nome"
            sessao["evento_slug"] = slug_evento
            await redis.set(chave_sessao, str(sessao))
            await _enviar_prompt_nome(conversation_id)
        else:
            await chatwoot_client.send_message(
                conversation_id=conversation_id,
                message="\u2753 Op\u00e7\u00e3o inv\u00e1lida. Digite um n\u00famero de 1 a 10.",
            )

    elif step == "nome":
        nome = content.strip()
        if nome and len(nome) > 1:
            cliente = await _salvar_ou_atualizar_cliente(conversation_id, nome)
            slug_evento = sessao.get("evento_slug", "outro")
            pedido = await _criar_pedido(
                conversation_id=conversation_id,
                cliente_id=cliente.id,
                event_slug=slug_evento,
            )
            if pedido:
                sessao["step"] = "fotos"
                sessao["pedido_id"] = str(pedido.id)
                await redis.set(chave_sessao, str(sessao))
                await _enviar_prompt_fotos(conversation_id, slug_evento)
            else:
                await chatwoot_client.send_message(
                    conversation_id=conversation_id,
                    message="\u274c Erro ao criar pedido. Tente novamente.",
                )
        else:
            await chatwoot_client.send_message(
                conversation_id=conversation_id,
                message="\U0001f60d Por favor, digite seu nome.",
            )

    elif step == "fotos":
        pedido_id = sessao.get("pedido_id")
        if fotos_gridfs_ids:
            try:
                mongodb = await get_db()
                collection = mongodb["fotos_metadados"]
                for gridfs_id in fotos_gridfs_ids:
                    await collection.insert_one({
                        "pedido_id": pedido_id,
                        "gridfs_id": gridfs_id,
                        "tipo": "foto",
                        "filename": None,
                        "mime_type": "image/jpeg",
                    })
            except Exception as exc:
                logger.error("Falha ao salvar metadados: %s", exc)

            # Atualiza contagem
            try:
                mongodb = await get_db()
                collection = mongodb["fotos_metadados"]
                total = await collection.count_documents({"pedido_id": pedido_id})
                await _atualizar_foto_count(uuid.UUID(pedido_id), total)
            except Exception as exc:
                logger.error("Falha ao contar fotos: %s", exc)
                total = 0

            if total > 0:
                await _confirmar_recebimento_fotos(
                    conversation_id=conversation_id,
                    total_fotos=total,
                    pedido_id=pedido_id,
                )
                sessao["step"] = "confirmacao"
                await redis.set(chave_sessao, str(sessao))

                # Dispara processamento (ass\u00edncrono)
                try:
                    from app.agents.orquestrador import orquestrador
                    import asyncio
                    asyncio.ensure_future(orquestrador.processar_pedido(pedido_id))
                except Exception as exc:
                    logger.error("Falha ao disparar processamento: %s", exc)
            else:
                await chatwoot_client.send_message(
                    conversation_id=conversation_id,
                    message="\U0001f4f8 N\u00e3o recebi nenhuma foto. Envie as fotos ou digite *CANCELAR* para cancelar.",
                )

    elif step == "confirmacao":
        text = content.strip().upper()
        if text in ("PRONTO", "SIM", "OK", "S"):
            await _finalizar_com_video(
                conversation_id=conversation_id,
                pedido_id=sessao.get("pedido_id"),
            )
            await redis.delete(chave_sessao)
        elif text in ("REVER", "REVISAR", "ALTERAR", "MUDAR"):
            await _revisar_pedido(
                conversation_id=conversation_id,
                pedido_id=sessao.get("pedido_id"),
            )
        elif text in ("CANCELAR", "CANCEL", "NAO", "N\u00c3O"):
            await chatwoot_client.send_message(
                conversation_id=conversation_id,
                message="\u274c Pedido cancelado. Se quiser come\u00e7ar de novo, \u00e9 s\u00f3 enviar *OI*.",
            )
            await redis.delete(chave_sessao)
        else:
            await chatwoot_client.send_message(
                conversation_id=conversation_id,
                message="\U0001f4f8 Envie mais fotos ou digite *PRONTO* para finalizar.",
            )

    else:
        # Step desconhecido — reinicia
        await redis.delete(chave_sessao)
        await _enviar_menu_eventos(conversation_id)

    return {"status": "ok"}


@router.post("/chatwoot/conversation")
async def chatwoot_conversation_webhook(request: Request):
    """Webhook de atualiza\u00e7\u00e3o de conversa do Chatwoot."""
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error"}

    event = payload.get("event")
    conversation_id = (
        payload.get("conversation", {}).get("id")
        or payload.get("conversation_id")
    )

    if not conversation_id:
        return {"status": "ignored"}

    logger.info("Conversa %s atualizada: %s", conversation_id, event)

    # Se for uma nova conversa, inicia o fluxo
    if event in ("conversation_created", "conversation_opened"):
        await _enviar_menu_eventos(conversation_id)
        return {"status": "menu_enviado"}

    return {"status": "ok"}
