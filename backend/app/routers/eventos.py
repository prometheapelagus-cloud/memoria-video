"""Listagem de eventos cadastrados.""""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgres import get_db
from app.models.evento import Evento
from app.services.bouncer import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_eventos(
    ativo: bool | None = Query(None, description="Filtrar por ativo"),
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Lista todos os eventos cadastrados."""
    query = select(Evento)
    if ativo is not None:
        query = query.where(Evento.ativo == ativo)
    query = query.order_by(Evento.nome)

    result = await db.execute(query)
    eventos = result.scalars().all()

    return {
        "eventos": [
            {
                "id": str(e.id),
                "slug": e.slug,
                "nome": e.nome,
                "descricao": e.descricao,
                "estilo_video": e.estilo_video,
                "musica_sugerida": e.musica_sugerida,
                "cor_emocao": e.cor_emocao,
                "duracao_por_foto_seg": e.duracao_por_foto_seg,
                "ativo": e.ativo,
            }
            for e in eventos
        ],
        "total": len(eventos),
    }