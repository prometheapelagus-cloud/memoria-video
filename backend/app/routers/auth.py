"""Auth JWT — login e cadastro com suporte a banco de dados + env vars."""
import os
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.postgres import get_db
from app.models.usuario import Usuario, TipoUsuario

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)


# ── Schemas ──────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    nome: str = "Admin"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class SetupResponse(BaseModel):
    message: str
    has_admin: bool
    login_url: str = "/#/login"


# ── Helpers ──────────────────────────────

def _verify_env_password(plain: str) -> bool:
    """Verifica contra env vars (fallback para quando não há banco)."""
    expected = os.environ.get("ADMIN_SECRET", "") or settings.admin_password or "m3m0r14v1d30"
    return plain == expected


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=8))
    to_encode = {**data, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token invalido ou expirado") from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token nao fornecido")
    payload = decode_access_token(credentials.credentials)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token invalido: sem subject")
    return {"email": email, "name": payload.get("name", email), "role": "admin"}


# ── Endpoints ────────────────────────────

@router.post("/register", response_model=SetupResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Cria o primeiro admin. So funciona se nao existir nenhum admin ainda."""
    try:
        result = await db.execute(select(Usuario).where(Usuario.tipo == TipoUsuario.admin))
        existing = result.scalars().first()
        if existing:
            return SetupResponse(
                message="Admin ja existe. Faca login.",
                has_admin=True,
                login_url="/#/login"
            )

        novo = Usuario(
            email=body.email,
            nome=body.nome,
            senha=hashlib.sha256(body.password.encode()).hexdigest(),
            tipo=TipoUsuario.admin,
        )
        db.add(novo)
        await db.commit()

        return SetupResponse(
            message=f"Admin {body.email} criado com sucesso! Faca login.",
            has_admin=True,
            login_url="/#/login"
        )
    except Exception as e:
        await db.rollback()
        logger.error("Erro ao criar admin: %s", e)
        raise HTTPException(status_code=500, detail=f"Erro ao criar admin: {str(e)}")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Autentica via banco de dados ou env var fallback."""
    try:
        result = await db.execute(
            select(Usuario).where(Usuario.email == body.email, Usuario.ativo == True)
        )
        user = result.scalars().first()
    except Exception:
        user = None

    if user:
        senha_hash = hashlib.sha256(body.password.encode()).hexdigest()
        if user.senha != senha_hash:
            raise HTTPException(status_code=401, detail="Email ou senha invalidos")
    elif body.email != "admin@memoriavideo.com" or not _verify_env_password(body.password):
        raise HTTPException(status_code=401, detail="Email ou senha invalidos")

    token = create_access_token({"sub": body.email, "name": user.nome if user else "Admin"})
    return TokenResponse(access_token=token, user={"email": body.email, "name": user.nome if user else "Admin"})


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db)):
    """Retorna se existe admin cadastrado."""
    try:
        result = await db.execute(select(Usuario).where(Usuario.tipo == TipoUsuario.admin))
        admin = result.scalars().first()
        return {"has_admin": admin is not None}
    except Exception:
        return {"has_admin": False}
