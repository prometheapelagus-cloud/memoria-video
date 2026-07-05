import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database.postgres import Base
import enum


class TipoUsuario(str, enum.Enum):
    admin = "admin"
    user = "user"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    senha: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[TipoUsuario] = mapped_column(SAEnum(TipoUsuario), default=TipoUsuario.user)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
