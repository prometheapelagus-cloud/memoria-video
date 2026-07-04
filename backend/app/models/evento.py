import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database.postgres import Base


class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String, nullable=True)
    estilo_video: Mapped[str | None] = mapped_column(String(50), nullable=True)
    musica_sugerida: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cor_emocao: Mapped[str | None] = mapped_column(String(7), nullable=True)
    transicao_padrao: Mapped[str | None] = mapped_column(String(30), nullable=True)
    duracao_por_foto_seg: Mapped[int] = mapped_column(Integer, default=3)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    pedidos = relationship("Pedido", back_populates="evento")
