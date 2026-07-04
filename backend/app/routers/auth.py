from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from datetime import datetime, timedelta, timezone

router = APIRouter()
security = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    if req.email != settings.admin_email or not pwd_context.verify(req.password, settings.admin_password):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    expire = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode({"sub": req.email, "exp": expire}, settings.secret_key, algorithm=settings.jwt_algorithm)
    return TokenResponse(access_token=token, user={"email": req.email, "name": "Admin"})


@router.get("/me")
async def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return {"email": payload["sub"], "name": "Admin"}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
