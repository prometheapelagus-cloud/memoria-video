"""Dashboard endpoints e admin check/setup."""
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgres import get_db
from app.models.pedido import Pedido
from app.models.evento import Evento
from app.models.cliente import Cliente
from app.models.usuario import Usuario, TipoUsuario
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/metrics")
async def dashboard_metrics(db: AsyncSession = Depends(get_db)):
    """Retorna métricas do dashboard: pedidos hoje, no mês, taxa de aprovação, tempo médio."""
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Pedidos hoje
    result = await db.execute(
        select(func.count()).select_from(Pedido).where(Pedido.created_at >= start_of_day)
    )
    hoje = result.scalar() or 0

    # Pedidos no mês
    result = await db.execute(
        select(func.count()).select_from(Pedido).where(Pedido.created_at >= start_of_month)
    )
    mes = result.scalar() or 0

    # Taxa de aprovação (concluidos / total)
    result = await db.execute(select(func.count()).select_from(Pedido))
    total = result.scalar() or 1
    result = await db.execute(
        select(func.count()).select_from(Pedido).where(Pedido.status == "concluido")
    )
    concluidos = result.scalar() or 0
    taxa_aprovacao = round((concluidos / total) * 100, 1) if total > 0 else 0.0

    # Tempo médio de processamento (em minutos)
    from sqlalchemy import text
    try:
        result = await db.execute(
            text("""
                SELECT COALESCE(
                    AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60),
                    0
                )
                FROM pedidos
                WHERE completed_at IS NOT NULL AND created_at IS NOT NULL
            """)
        )
        tempo_medio = round(float(result.scalar() or 0), 1)
    except Exception:
        tempo_medio = 0.0

    return {
        "hoje": hoje,
        "mes": mes,
        "taxa_aprovacao": taxa_aprovacao,
        "tempo_medio": tempo_medio,
    }


@router.get("/eventos")
async def dashboard_eventos(db: AsyncSession = Depends(get_db)):
    """Retorna contagem de pedidos por evento."""
    result = await db.execute(
        select(
            Evento.nome,
            func.count(Pedido.id).label("total"),
        )
        .outerjoin(Pedido, Pedido.evento_id == Evento.id)
        .group_by(Evento.id, Evento.nome)
        .order_by(func.count(Pedido.id).desc())
    )
    rows = result.all()
    return [{"nome": row[0], "total": row[1]} for row in rows]


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Estatísticas rápidas para o frontend."""
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Total de pedidos
    result = await db.execute(select(func.count()).select_from(Pedido))
    total_pedidos = result.scalar() or 0

    # Total de clientes
    result = await db.execute(select(func.count()).select_from(Cliente))
    total_clientes = result.scalar() or 0

    # Total de eventos
    result = await db.execute(select(func.count()).select_from(Evento))
    total_eventos = result.scalar() or 0

    # Pedidos este mês
    result = await db.execute(
        select(func.count()).select_from(Pedido).where(Pedido.created_at >= start_of_month)
    )
    pedidos_mes = result.scalar() or 0

    return {
        "total_pedidos": total_pedidos,
        "total_clientes": total_clientes,
        "total_eventos": total_eventos,
        "pedidos_mes": pedidos_mes,
    }