"""
API de Pedidos — consulta, reprocessamento e cancelamento.

Endpoints:
  - GET  /{id}          — detalhes do pedido com URLs das fotos e vídeo
  - POST /{id}/reprocessar — força reprocessamento do pedido
  - POST /{id}/cancelar    — cancela pedido (não processa mais)
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.database.postgres import get_session
from app.database.mongodb import get_db as get_mongo
from app.database.redis import get_redis
from app.models.pedido import Pedido
from app.models.cliente import Cliente
from app.models.evento import Evento

logger = logging.getLogger(__name__)

router = APIRouter()

MONGO_COLLECTION = "fotos_metadados"


# ---------------------------------------------------------------------------
# GET / — listagem com filtros e paginação
# ---------------------------------------------------------------------------


@router.get("")
async def list_pedidos(
    status: str | None = None,
    evento_id: str | None = None,
    busca: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """
    Lista pedidos com filtros opcionais e paginação.

    Filtros:
      - status: filtra por status (ex: completed, analyzing, cancelled)
      - evento_id: filtra por UUID do evento
      - busca: busca textual em cliente.nome ou pedido.id (parcial)
      - page: número da página (default 1)
      - page_size: itens por página (default 20, max 100)
    """
    from sqlalchemy import or_

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > 100:
        page_size = 100

    async with get_session() as db:
        # Query base
        query = select(Pedido).order_by(Pedido.created_at.desc())

        # Filtros
        if status:
            query = query.where(Pedido.status == status)
        if evento_id:
            try:
                ev_uuid = uuid.UUID(evento_id)
                query = query.where(Pedido.evento_id == ev_uuid)
            except ValueError:
                raise HTTPException(status_code=400, detail="evento_id inválido")

        if busca:
            # Busca textual: tenta interpretar como UUID (busca exata por ID)
            # ou busca por nome do cliente via join
            try:
                busca_uuid = uuid.UUID(busca)
                query = query.where(
                    or_(
                        Pedido.id == busca_uuid,
                        Pedido.cliente_id == busca_uuid,
                    )
                )
            except ValueError:
                # Não é UUID — busca por nome do cliente
                query = query.join(Cliente).where(
                    Cliente.nome.ilike(f"%{busca}%")
                )

        # Total (para paginação)
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginação
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        pedidos = result.scalars().all()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
        "pedidos": [
            {
                "id": str(p.id),
                "status": p.status,
                "cliente_id": str(p.cliente_id) if p.cliente_id else None,
                "evento_id": str(p.evento_id) if p.evento_id else None,
                "qtde_fotos_enviadas": p.qtde_fotos_enviadas,
                "qtde_fotos_selecionadas": p.qtde_fotos_selecionadas,
                "token_edicao": p.token_edicao,
                "feedback_cliente": p.feedback_cliente,
                "video_gridfs_id": p.video_gridfs_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "completed_at": p.completed_at.isoformat() if p.completed_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in pedidos
        ],
    }


# ---------------------------------------------------------------------------
# GET /{id} — detalhes completos do pedido
# ---------------------------------------------------------------------------


@router.get("/{pedido_id}")
async def get_pedido(pedido_id: str) -> dict:
    """
    Retorna detalhes completos de um pedido, incluindo:

    - Dados do pedido (status, datas, token_edicao)
    - Cliente (nome, telefone)
    - Evento (nome, slug)
    - Fotos (metadados do GridFS)
    - Vídeo (URL de download do GridFS)
    """
    try:
        pedido_uuid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    async with get_session() as db:
        result = await db.execute(
            select(Pedido).where(Pedido.id == pedido_uuid)
        )
        pedido = result.scalar_one_or_none()
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")

        # Carrega cliente
        cliente = None
        if pedido.cliente_id:
            cl_result = await db.execute(
                select(Cliente).where(Cliente.id == pedido.cliente_id)
            )
            cliente = cl_result.scalar_one_or_none()

        # Carrega evento
        evento = None
        if pedido.evento_id:
            ev_result = await db.execute(
                select(Evento).where(Evento.id == pedido.evento_id)
            )
            evento = ev_result.scalar_one_or_none()

    # Busca fotos do GridFS (metadados)
    fotos = []
    if pedido_id:
        try:
            mongo = await get_mongo()
            collection = mongo[MONGO_COLLECTION]
            cursor = collection.find(
                {"pedido_id": pedido_id, "tipo": "foto"},
                {"_id": 0},
            ).sort("_id", 1)
            fotos = await cursor.to_list(length=None)
        except Exception as exc:
            logger.warning("Falha ao buscar fotos do GridFS: %s", exc)

    return {
        "id": str(pedido.id),
        "status": pedido.status,
        "cliente": {
            "id": str(cliente.id) if cliente else None,
            "nome": cliente.nome if cliente else None,
            "telefone": cliente.telefone if cliente else None,
        } if cliente else None,
        "evento": {
            "id": str(evento.id) if evento else None,
            "nome": evento.nome if evento else None,
            "slug": evento.slug if evento else None,
        } if evento else None,
        "qtde_fotos_enviadas": pedido.qtde_fotos_enviadas,
        "qtde_fotos_selecionadas": pedido.qtde_fotos_selecionadas,
        "video_gridfs_id": pedido.video_gridfs_id,
        "video_duration_seconds": pedido.video_duration_seconds,
        "token_edicao": pedido.token_edicao,
        "feedback_cliente": pedido.feedback_cliente,
        "roteiro_ia": pedido.roteiro_ia,
        "trilha_usada": pedido.trilha_usada,
        "fotos": [
            {
                "gridfs_id": foto.get("gridfs_id"),
                "filename": foto.get("filename"),
                "mime_type": foto.get("mime_type"),
                "tamanho": foto.get("tamanho"),
            }
            for foto in fotos
        ],
        "created_at": pedido.created_at.isoformat() if pedido.created_at else None,
        "completed_at": pedido.completed_at.isoformat() if pedido.completed_at else None,
        "updated_at": pedido.updated_at.isoformat() if pedido.updated_at else None,
    }


# ---------------------------------------------------------------------------
# POST /{id}/reprocessar — força reprocessamento
# ---------------------------------------------------------------------------


@router.post("/{pedido_id}/reprocessar")
async def reprocessar_pedido(pedido_id: str) -> dict:
    """
    Força o reprocessamento de um pedido.

    - Reseta o status para 'analyzing'
    - Dispara o orquestrador novamente
    - Útil para recuperar de erros ou forçar nova geração
    """
    try:
        pedido_uuid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    async with get_session() as db:
        result = await db.execute(
            select(Pedido).where(Pedido.id == pedido_uuid)
        )
        pedido = result.scalar_one_or_none()
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")

        if pedido.status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail=f"Pedido já está {pedido.status}. Não é possível reprocessar.",
            )

        # Reseta status
        pedido.status = "analyzing"
        pedido.token_edicao += 1
        pedido.feedback_cliente = "reprocessamento manual"
        await db.commit()

    # Dispara orquestrador
    try:
        from app.agents.orquestrador import orquestrador
        import asyncio
        asyncio.ensure_future(orquestrador.processar_pedido(pedido_id))
        logger.info("Reprocessamento manual disparado para pedido %s", pedido_id)
    except Exception as exc:
        logger.exception("Falha ao disparar reprocessamento: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao iniciar reprocessamento: {str(exc)}",
        )

    # Publica status
    try:
        import json
        r = await get_redis()
        mensagem = json.dumps({
            "pedido_id": pedido_id,
            "evento": "reprocessamento_manual",
            "status_geral": "analyzing",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await r.publish("processamento:status", mensagem)
    except Exception as exc:
        logger.warning("Falha ao publicar reprocessamento: %s", exc)

    return {
        "status": "reprocessando",
        "pedido_id": pedido_id,
        "token_edicao": pedido.token_edicao,
    }


# ---------------------------------------------------------------------------
# POST /{id}/cancelar — cancela pedido
# ---------------------------------------------------------------------------


@router.post("/{pedido_id}/cancelar")
async def cancelar_pedido(pedido_id: str) -> dict:
    """
    Cancela um pedido.

    - Marca status como 'cancelled'
    - Não processa mais filas
    """
    try:
        pedido_uuid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    async with get_session() as db:
        result = await db.execute(
            select(Pedido).where(Pedido.id == pedido_uuid)
        )
        pedido = result.scalar_one_or_none()
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")

        if pedido.status == "cancelled":
            raise HTTPException(status_code=400, detail="Pedido já está cancelado")

        pedido.status = "cancelled"
        pedido.feedback_cliente = "cancelado pelo usuário"
        await db.commit()

    # Publica status
    try:
        import json
        r = await get_redis()
        mensagem = json.dumps({
            "pedido_id": pedido_id,
            "evento": "cancelado",
            "status_geral": "cancelled",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await r.publish("processamento:status", mensagem)
    except Exception as exc:
        logger.warning("Falha ao publicar cancelamento: %s", exc)

    logger.info("Pedido %s cancelado", pedido_id)

    return {"status": "cancelled", "pedido_id": pedido_id}
