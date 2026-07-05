from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClienteResponse(BaseModel):
    id: str
    nome: Optional[str] = None
    telefone: str
    email: Optional[str] = None
    total_pedidos: int = 0
    ultimo_evento: Optional[str] = None
    created_at: Optional[str] = None


class ClienteListResponse(BaseModel):
    clientes: list[ClienteResponse] = []
    total: int = 0
