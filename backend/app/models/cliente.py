import uuid
from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database.postgres import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    chatwoot_contact_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    chatwoot_conversation_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_pedidos: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_evento: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    pedidos = relationship("Pedido", back_populates="cliente")
