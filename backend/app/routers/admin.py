"""
Dashboard / Admin — métricas reais a partir do PostgreSQL.

Endpoints:
  - GET /metricas — contagens por status, média de tempo, total hoje/mês
"""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter
from sqlalchemy import select, func, and_

from app.database.postgres import get_session
from app.models.pedido import Pedido

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/metricas")
async def dashboard_metricas():
    """
    Retorna métricas do dashboard:
    - total_pedidos: total de pedidos
    - pedidos_hoje: pedidos criados hoje
    - pedidos_mes: pedidos criados no mês
    - taxa_conclusao: percentual de concluídos
    - tempo_medio_seg: tempo médio de processamento
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    async with get_session() as db:
        # Total de pedidos
        result = await db.execute(select(func.count(Pedido.id)))
        total_pedidos = result.scalar() or 0

        # Pedidos hoje
        result = await db.execute(
            select(func.count(Pedido.id)).where(Pedido.created_at >= today_start)
        )
        pedidos_hoje = result.scalar() or 0

        # Pedidos no mês
        result = await db.execute(
            select(func.count(Pedido.id)).where(Pedido.created_at >= month_start)
        )
        pedidos_mes = result.scalar() or 0

        # Concluídos
        result = await db.execute(
            select(func.count(Pedido.id)).where(Pedido.status == "completed")
        )
        concluidos = result.scalar() or 0

        # Tempo médio de processamento (em segundos)
        result = await db.execute(
            select(func.avg(
                (func.extract("epoch", Pedido.completed_at) - func.extract("epoch", Pedido.created_at))
            )).where(and_(
                Pedido.completed_at.isnot(None),
                Pedido.created_at.isnot(None),
            ))
        )
        tempo_medio_seg = result.scalar() or 0

    taxa_conclusao = (concluidos / total_pedidos * 100) if total_pedidos > 0 else 0.0

    return {
        "total_pedidos": total_pedidos,
        "pedidos_hoje": pedidos_hoje,
        "pedidos_mes": pedidos_mes,
        "concluidos": concluidos,
        "taxa_conclusao": round(taxa_conclusao, 1),
        "tempo_medio_seg": round(float(tempo_medio_seg), 1),
    }


@router.get("/stats")
async def dashboard_stats():
    """Alias para /metricas — compatibilidade com frontend."""
    return await dashboard_metricas()


@router.get("/eventos")
async def dashboard_eventos():
    """Retorna contagem de pedidos por evento (para gráfico de pizza)."""
    from app.models.evento import Evento

    async with get_session() as db:
        result = await db.execute(
            select(Evento.slug, Evento.nome, func.count(Pedido.id)).outerjoin(
                Pedido, Pedido.evento_id == Evento.id
            ).group_by(Evento.id, Evento.slug, Evento.nome)
        )
        rows = result.all()

    return [
        {"slug": slug, "nome": nome, "total": total}
        for slug, nome, total in rows
    ]
