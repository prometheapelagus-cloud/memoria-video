from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database.postgres import init_db
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Memórias em Vídeo API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def jwt_auth_middleware(request: Request, call_next):
    path = request.url.path
    public_prefixes = ("/health", "/docs", "/redoc", "/openapi.json", "/api/v1/auth")
    if any(path.startswith(p) for p in public_prefixes):
        return await call_next(request)
    if path.startswith("/api/v1/"):
        auth = request.headers.get("Authorization")
        if not auth or not auth.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Token não fornecido"})
        from jose import JWTError, jwt
        try:
            jwt.decode(auth.split(" ")[1], settings.secret_key, algorithms=[settings.jwt_algorithm])
        except JWTError:
            return JSONResponse(status_code=401, content={"detail": "Token inválido"})
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "memoria-video", "version": "1.0.0"}


from app.routers import webhooks, pedidos, clientes, eventos, admin, status, auth
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(pedidos.router, prefix="/api/v1/pedidos", tags=["pedidos"])
app.include_router(clientes.router, prefix="/api/v1/clientes", tags=["clientes"])
app.include_router(eventos.router, prefix="/api/v1/eventos", tags=["eventos"])
app.include_router(admin.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(status.router, prefix="/api/v1/status", tags=["status"])
