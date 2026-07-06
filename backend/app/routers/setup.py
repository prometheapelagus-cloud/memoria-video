"""
Setup / Migração / Diagnóstico — endpoints administrativos.
"""

import logging
import traceback

from fastapi import APIRouter
from sqlalchemy import inspect, select, func
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
    tables = {}
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
            tables = result
    except Exception as e:
        return {"error": str(e)}
    return tables


@router.post("/db")
async def create_missing_tables():
    """Cria as tabelas que estão faltando (se houver)."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return {"status": "ok", "message": "Tabelas criadas/verificadas com sucesso"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/debug/metricas")
async def debug_metricas(db: AsyncSession = get_db()):
    """Executa queries uma a uma para diagnosticar onde quebra."""
    results = {}
    
    try:
        r = await db.execute(select(func.count(Pedido.id)))
        results["count_pedidos"] = r.scalar() or 0
    except Exception as e:
        results["count_pedidos"] = {"error": str(e), "traceback": traceback.format_exc()}
    
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        r = await db.execute(
            select(func.count(Pedido.id)).where(Pedido.created_at >= today_start)
        )
        results["pedidos_hoje"] = r.scalar() or 0
    except Exception as e:
        results["pedidos_hoje"] = {"error": str(e), "traceback": traceback.format_exc()}
    
    try:
        r = await db.execute(
            select(Pedido.status, func.count(Pedido.id)).group_by(Pedido.status)
        )
        results["por_status"] = {row[0]: row[1] for row in r.all()}
    except Exception as e:
        results["por_status"] = {"error": str(e), "traceback": traceback.format_exc()}
    
    try:
        r = await db.execute(select(Pedido).limit(1))
        p = r.scalar_one_or_none()
        if p:
            results["pedido_sample"] = {"id": str(p.id), "status": p.status}
        else:
            results["pedido_sample"] = "no data"
    except Exception as e:
        results["pedido_sample"] = {"error": str(e), "traceback": traceback.format_exc()}
    
    return results
