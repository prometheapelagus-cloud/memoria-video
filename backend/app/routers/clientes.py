"""Listagem de clientes cadastrados."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.postgres import get_db
from app.models.cliente import Cliente
from app.services.bouncer import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_clientes(
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(50, ge=1, le=200, description="Itens por página"),
    busca: str | None = Query(None, description="Busca por nome ou telefone"),
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Lista todos os clientes cadastrados."""
    query = select(Cliente)

    if busca:
        query = query.where(
            Cliente.nome.ilike(f"%{busca}%") | Cliente.telefone.ilike(f"%{busca}%")
        )

    # Total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginação
    offset = (page - 1) * limit
    query = query.order_by(Cliente.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    clientes = result.scalars().all()

    return {
        "clientes": [
            {
                "id": str(c.id),
                "nome": c.nome,
                "telefone": c.telefone,
                "email": c.email,
                "total_pedidos": c.total_pedidos,
                "ultimo_evento": c.ultimo_evento,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in clientes
        ],
        "total": total,
    }