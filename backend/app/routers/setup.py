"""
Setup / Migração / Diagnóstico — endpoints administrativos.
"""

import logging
import traceback
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, inspect, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgres import engine, Base, get_db
from app.models.pedido import Pedido
from app.models.evento import Evento
from app.models.cliente import Cliente

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/db")
async def check_db():
    """Verifica quais tabelas existem no banco."""
    try:
        async with engine.begin() as conn:
            def _inspect(sync_conn):
                inspector = inspect(sync_conn)
                existing = inspector.get_table_names()
                model_tables = list(Base.metadata.tables.keys())
                missing = [t for t in model_tables if t not in existing]
                return {
                    "existing": existing,
                    "model_tables": model_tables,
                    "missing": missing,
                }
            result = await conn.run_sync(_inspect)
            return result
    except Exception as e:
        return {"error": str(e)}


@router.post("/db")
async def create_missing_tables():
    """Cria as tabelas que estão faltando."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return {"status": "ok", "message": "Tabelas criadas/verificadas com sucesso"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/debug")
async def debug_queries(db: AsyncSession = Depends(get_db)):
    """Roda queries uma a uma e retorna o resultado de cada uma."""
    results = {}

    # Query 1: count(Pedido.id)
    try:
        r = await db.execute(select(func.count(Pedido.id)))
        results["q1_count_pedidos"] = r.scalar() or 0
    except Exception as e:
        results["q1_count_pedidos"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    # Query 2: select(Pedido).limit(1)
    try:
        r = await db.execute(select(Pedido).limit(1))
        p = r.scalar_one_or_none()
        results["q2_select_pedido"] = str(p.id) if p else "no data"
    except Exception as e:
        results["q2_select_pedido"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    # Query 3: count with where
    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        r = await db.execute(
            select(func.count(Pedido.id)).where(Pedido.created_at >= today_start)
        )
        results["q3_count_hoje"] = r.scalar() or 0
    except Exception as e:
        results["q3_count_hoje"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    # Query 4: group by status
    try:
        r = await db.execute(
            select(Pedido.status, func.count(Pedido.id)).group_by(Pedido.status)
        )
        results["q4_por_status"] = {row[0]: row[1] for row in r.all()}
    except Exception as e:
        results["q4_por_status"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    # Query 5: avg time
    try:
        r = await db.execute(
            select(func.avg(
                (func.extract("epoch", Pedido.completed_at) - func.extract("epoch", Pedido.created_at))
            )).where(and_(
                Pedido.completed_at.isnot(None),
                Pedido.created_at.isnot(None),
            ))
        )
        results["q5_avg_tempo"] = r.scalar() or 0
    except Exception as e:
        results["q5_avg_tempo"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    # Query 6: select columns directly (without ORM)
    try:
        from sqlalchemy import text
        r = await db.execute(text("SELECT count(*) FROM pedidos"))
        results["q6_raw_sql"] = r.scalar() or 0
    except Exception as e:
        results["q6_raw_sql"] = {"error": str(e), "tb": traceback.format_exc()[-500:]}

    return results
