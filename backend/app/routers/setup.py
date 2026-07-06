"""
Setup / Migração — endpoints administrativos para corrigir o banco.
"""

import logging

from fastapi import APIRouter
from sqlalchemy import inspect

from app.database.postgres import engine, Base

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
