"""Pedidos CRUD completo com paginação, filtros e integração GridFS."""
import logging
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.postgres import get_db
from app.database.redis import get_redis
from app.models.pedido import Pedido
from app.models.cliente import Cliente
from app.models.evento import Evento
from app.services.gridfs_storage import list_by_pedido, get_from_gridfs
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _pedido_to_dict(pedido: Pedido) -> dict:
    """Converte modelo Pedido para dict serializável."""
    data = {
        "id": str(pedido.id),
        "cliente_id": str(pedido.cliente_id),
        "evento_id": str(pedido.evento_id) if pedido.evento_id else None,
        "status": pedido.status,
        "qtde_fotos_enviadas": pedido.qtde_fotos_enviadas,
        "qtde_fotos_selecionadas": pedido.qtde_fotos_selecionadas,
        "roteiro_ia": pedido.roteiro_ia,
        "trilha_usada": pedido.trilha_usada,
        "video_url": f"/api/v1/pedidos/{pedido.id}/video" if pedido.video_gridfs_id else None,
        "video_duration_seconds": pedido.video_duration_seconds,
        "feedback_cliente": pedido.feedback_cliente,
        "observacoes": None,
        "token_edicao": pedido.token_edicao,
        "created_at": pedido.created_at.isoformat() if pedido.created_at else None,
        "updated_at": pedido.updated_at.isoformat() if pedido.updated_at else None,
        "completed_at": pedido.completed_at.isoformat() if pedido.completed_at else None,
        "cliente_nome": pedido.cliente.nome if pedido.cliente else None,
        "cliente_telefone": pedido.cliente.telefone if pedido.cliente else None,
        "evento_nome": pedido.evento.nome if pedido.evento else None,
        "evento_slug": pedido.evento.slug if pedido.evento else None,
        "fotos": [],
    }
    return data


@router.get("")
async def list_pedidos(
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(20, ge=1, le=100, description="Itens por página"),
    status: str | None = Query(None, description="Filtrar por status"),
    evento: str | None = Query(None, description="Filtrar por evento slug"),
    data_inicio: str | None = Query(None, description="Data início (YYYY-MM-DD)"),
    data_fim: str | None = Query(None, description="Data fim (YYYY-MM-DD)"),
    busca: str | None = Query(None, description="Busca por nome do cliente"),
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Lista pedidos com paginação e filtros."""
    query = select(Pedido).options(selectinload(Pedido.cliente), selectinload(Pedido.evento))

    if status:
        query = query.where(Pedido.status == status)
    if evento:
        query = query.join(Evento, Pedido.evento_id == Evento.id).where(Evento.slug == evento)
    if data_inicio:
        try:
            dt_inicio = datetime.strptime(data_inicio, "%Y-%m-%d")
            query = query.where(Pedido.created_at >= dt_inicio)
        except ValueError:
            pass
    if data_fim:
        try:
            dt_fim = datetime.strptime(data_fim + "T23:59:59", "%Y-%m-%dT%H:%M:%S")
            query = query.where(Pedido.created_at <= dt_fim)
        except ValueError:
            pass
    if busca:
        query = query.join(Cliente, Pedido.cliente_id == Cliente.id).where(
            Cliente.nome.ilike(f"%{busca}%")
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 1

    offset = (page - 1) * limit
    query = query.order_by(Pedido.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    pedidos = result.scalars().all()

    items = [_pedido_to_dict(p) for p in pedidos]

    return {
        "items": items,
        "total": total,
        "total_pages": total_pages,
        "page": page,
        "limit": limit,
    }


@router.get("/{pedido_id}")
async def get_pedido(
    pedido_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Detalhe do pedido com fotos do GridFS."""
    import uuid
    try:
        pid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    result = await db.execute(
        select(Pedido)
        .options(selectinload(Pedido.cliente), selectinload(Pedido.evento))
        .where(Pedido.id == pid)
    )
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    data = _pedido_to_dict(pedido)

    try:
        fotos = await list_by_pedido(str(pedido.id))
        data["fotos"] = [
            {
                "gridfs_id": str(f.get("gridfs_file_id", "")),
                "url": f"/api/v1/pedidos/{pedido.id}/fotos/{f.get('gridfs_file_id', '')}" if f.get("gridfs_file_id") else "",
                "filename": f.get("filename", ""),
                "mime_type": f.get("mime_type", "image/jpeg"),
                "file_size_bytes": f.get("file_size_bytes", 0),
                "status": "recebida",
            }
            for f in fotos
        ]
    except Exception as e:
        logger.warning("Erro ao buscar fotos do GridFS: %s", e)

    return data


@router.get("/{pedido_id}/fotos/{file_id}")
async def get_foto(
    pedido_id: str,
    file_id: str,
    _current_user: dict = Depends(get_current_user),
):
    """Serve uma foto do GridFS."""
    from fastapi.responses import Response
    try:
        data = await get_from_gridfs(file_id)
        return Response(content=data, media_type="image/jpeg")
    except Exception as e:
        logger.error("Erro ao buscar foto %s: %s", file_id, e)
        raise HTTPException(status_code=404, detail="Foto não encontrada")


@router.get("/{pedido_id}/video")
async def get_video(
    pedido_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Serve o vídeo do pedido do GridFS."""
    from fastapi.responses import Response
    import uuid
    try:
        pid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    result = await db.execute(select(Pedido).where(Pedido.id == pid))
    pedido = result.scalar_one_or_none()
    if not pedido or not pedido.video_gridfs_id:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")

    try:
        data = await get_from_gridfs(pedido.video_gridfs_id)
        return Response(content=data, media_type="video/mp4")
    except Exception as e:
        logger.error("Erro ao buscar vídeo %s: %s", pedido_id, e)
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")


@router.post("/{pedido_id}/reprocessar")
async def reprocessar_pedido(
    pedido_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Reprocessa um pedido: reseta status e enfileira novamente."""
    import uuid
    try:
        pid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    result = await db.execute(select(Pedido).where(Pedido.id == pid))
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    if pedido.status not in ("concluido", "erro", "cancelado"):
        raise HTTPException(status_code=400, detail=f"Pedido em status '{pedido.status}' não pode ser reprocessado")

    pedido.status = "processando"
    pedido.token_edicao += 1
    pedido.video_gridfs_id = None
    pedido.completed_at = None
    await db.commit()

    try:
        redis = await get_redis()
        await redis.rpush("fila:processamento", json.dumps({
            "pedido_id": pedido_id,
            "action": "reprocess",
            "token_edicao": pedido.token_edicao,
        }))
        logger.info("Pedido %s enfileirado para reprocessamento", pedido_id)
    except Exception as e:
        logger.warning("Erro ao enfileirar reprocessamento: %s", e)

    return {
        "message": "Pedido enfileirado para reprocessamento",
        "pedido_id": pedido_id,
        "status": pedido.status,
    }


@router.post("/{pedido_id}/cancelar")
async def cancelar_pedido(
    pedido_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Cancela um pedido."""
    import uuid
    try:
        pid = uuid.UUID(pedido_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de pedido inválido")

    result = await db.execute(select(Pedido).where(Pedido.id == pid))
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    if pedido.status in ("cancelado", "concluido"):
        raise HTTPException(status_code=400, detail=f"Pedido já está '{pedido.status}'")

    pedido.status = "cancelado"
    await db.commit()

    return {
        "message": "Pedido cancelado com sucesso",
        "pedido_id": pedido_id,
        "status": pedido.status,
    }