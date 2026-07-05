from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class FotoItem(BaseModel):
    gridfs_id: str = Field(default="", description="GridFS file ID")
    url: str = Field(default="", description="Download URL for the photo")
    filename: str = Field(default="", description="Original filename")
    mime_type: str = Field(default="image/jpeg", description="MIME type")
    status: str = Field(default="recebida", description="Status da foto (recebida/selecionada/descartada)")
    file_size_bytes: int = 0


class PedidoCreate(BaseModel):
    cliente_id: str
    evento_id: Optional[str] = None
    observacoes: Optional[str] = None


class PedidoUpdate(BaseModel):
    status: Optional[str] = None
    video_url: Optional[str] = None
    observacoes: Optional[str] = None
    roteiro_ia: Optional[str] = None
    trilha_usada: Optional[str] = None
    video_duration_seconds: Optional[int] = None
    feedback_cliente: Optional[str] = None


class PedidoResponse(BaseModel):
    id: str
    cliente_id: str
    evento_id: Optional[str] = None
    status: str
    fotos: list[FotoItem] = []
    video_url: Optional[str] = None
    observacoes: Optional[str] = None
    qtde_fotos_enviadas: int = 0
    qtde_fotos_selecionadas: int = 0
    roteiro_ia: Optional[str] = None
    trilha_usada: Optional[str] = None
    video_duration_seconds: Optional[int] = None
    feedback_cliente: Optional[str] = None
    cliente_nome: Optional[str] = None
    cliente_telefone: Optional[str] = None
    evento_nome: Optional[str] = None
    evento_slug: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None


class PedidoListResponse(BaseModel):
    items: list[PedidoResponse] = []
    total: int = 0
    total_pages: int = 0
    page: int = 1
    limit: int = 20


class PedidoActionResponse(BaseModel):
    message: str
    pedido_id: str
    status: str
