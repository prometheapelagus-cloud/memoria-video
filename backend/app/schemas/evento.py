from pydantic import BaseModel
from typing import Optional


class EventoResponse(BaseModel):
    id: str
    slug: str
    nome: str
    descricao: Optional[str] = None
    estilo_video: Optional[str] = None
    musica_sugerida: Optional[str] = None
    cor_emocao: Optional[str] = None
    duracao_por_foto_seg: int = 3
    ativo: bool = True


class EventoListResponse(BaseModel):
    eventos: list[EventoResponse] = []
    total: int = 0
