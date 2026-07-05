from pydantic import BaseModel
from typing import Optional


class DashboardMetricsResponse(BaseModel):
    hoje: int = 0
    mes: int = 0
    taxa_aprovacao: float = 0.0
    tempo_medio: float = 0.0


class DashboardEventoItem(BaseModel):
    nome: str
    total: int = 0


class AdminCheckResponse(BaseModel):
    has_admin: bool = False


class AdminSetupRequest(BaseModel):
    email: str
    password: str
    nome: str = "Admin"


class AdminSetupResponse(BaseModel):
    message: str
    has_admin: bool = False
