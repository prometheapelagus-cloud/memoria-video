from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database.postgres import init_db
from app.config import settings

import logging
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando banco de dados...")
    await init_db()
    yield


app = FastAPI(title="Memórias em Vídeo", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.middleware("http")
async def jwt_auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in ("/health", "/", "/docs", "/openapi.json"):
        return await call_next(request)
    if path.startswith(("/webhooks", "/api/v1/auth", "/api/v1/status")):
        return await call_next(request)
    if path.startswith("/api/v1/"):
        auth = request.headers.get("Authorization")
        if not auth or not auth.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Token não fornecido"})
        from jose import JWTError, jwt
        try:
            jwt.decode(auth.split(" ")[1], settings.secret_key, algorithms=["HS256"])
        except JWTError:
            return JSONResponse(status_code=401, content={"detail": "Token inválido"})
    return await call_next(request)


from app.routers import webhooks, pedidos, clientes, eventos, admin, status, auth
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(pedidos.router, prefix="/api/v1/pedidos", tags=["pedidos"])
app.include_router(clientes.router, prefix="/api/v1/clientes", tags=["clientes"])
app.include_router(eventos.router, prefix="/api/v1/eventos", tags=["eventos"])
app.include_router(admin.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(status.router, prefix="/api/v1/status", tags=["status"])
