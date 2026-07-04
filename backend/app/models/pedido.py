import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, BigInteger, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database.postgres import Base


class Pedido(Base):
    __tablename__ = "pedidos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cliente_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clientes.id"))
    evento_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("eventos.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="collecting_photos")
    qtde_fotos_enviadas: Mapped[int] = mapped_column(Integer, default=0)
    qtde_fotos_selecionadas: Mapped[int] = mapped_column(Integer, default=0)
    roteiro_ia: Mapped[str | None] = mapped_column(Text, nullable=True)
    trilha_usada: Mapped[str | None] = mapped_column(String(255), nullable=True)
    video_gridfs_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    video_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chatwoot_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    feedback_cliente: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_edicao: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    cliente = relationship("Cliente", back_populates="pedidos")
    evento = relationship("Evento", back_populates="pedidos")
