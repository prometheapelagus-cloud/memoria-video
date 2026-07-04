# Stack Memória em Vídeo — Docker Swarm

Stack completa da plataforma de curadoria de fotos e geração de vídeos para eventos.
Rodando em Docker Swarm no servidor `pelagus-core`.

## Acesso

| Item | URL |
|------|-----|
| Admin | https://admin.memoria.pelagus.com.br |
| API | https://memoria.pelagus.com.br |
| Health | https://memoria.pelagus.com.br/health |

## Stack YAML

```yaml
version: "3.7"


services:
  # ====================================================================
  #   MONGODB — Cache / armazenamento de fotos
  # ====================================================================
  mongodb:
    image: mongo:7
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    networks:
      - memoria-internal
    volumes:
      - mongodb-data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M


  # ====================================================================
  #   REDIS — Filas e cache
  # ====================================================================
  redis:
    image: redis:7-alpine
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    networks:
      - memoria-internal
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 64M


  # ====================================================================
  #   POSTGRES — Banco principal
  # ====================================================================
  postgres:
    image: postgres:16-alpine
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    environment:
      POSTGRES_DB: memoria_video
      POSTGRES_USER: memoria
      POSTGRES_PASSWORD: SUA_SENHA_AQUI
    networks:
      - memoria-internal
    volumes:
      - postgresql-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memoria -d memoria_video"]
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.role == manager


  # ====================================================================
  #   BACKEND — FastAPI (API principal)
  # ====================================================================
  backend:
    image: pelagus/memoria-video:latest
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    environment:
      # Database
      DATABASE_URL: 'postgresql+asyncpg://memoria:SUA_SENHA_AQUI@postgres:5432/memoria_video'
      MONGODB_URL: 'mongodb://mongodb:27017/memoria_video'
      REDIS_URL: 'redis://redis:6379/0'

      # General
      DEBUG: "false"
    networks:
      - memoria-internal
      - traefik-public
    depends_on:
      - mongodb
      - redis
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s
    deploy:
      mode: replicated
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      labels:
        - traefik.enable=true
        - traefik.http.routers.memoria.rule=Host(`memoria.pelagus.com.br`)
        - traefik.http.routers.memoria.entrypoints=websecure
        - traefik.http.routers.memoria.tls=true
        - traefik.http.routers.memoria.tls.certresolver=letsencrypt
        - traefik.http.services.memoria.loadbalancer.server.port=8000
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 256M


  # ====================================================================
  #   FRONTEND — Nginx (SPA estático)
  # ====================================================================
  frontend:
    image: nginx:alpine
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    volumes:
      - ./frontend:/usr/share/nginx/html:ro
      - ./frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - memoria-internal
      - traefik-public
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      mode: replicated
      replicas: 2
      labels:
        - traefik.enable=true
        - traefik.http.routers.memoria-front.rule=Host(`admin.memoria.pelagus.com.br`)
        - traefik.http.routers.memoria-front.entrypoints=websecure
        - traefik.http.routers.memoria-front.tls=true
        - traefik.http.routers.memoria-front.tls.certresolver=letsencrypt
        - traefik.http.services.memoria-front.loadbalancer.server.port=80


volumes:
  mongodb-data:
  postgresql-data:


networks:
  traefik-public:
    external: true
    name: network_swarm_public
  memoria-internal:
    driver: overlay
    attachable: true
```

## Serviços

| Serviço | Imagem | Réplicas | Função |
|---------|--------|----------|--------|
| `mongodb` | `mongo:7` | 1 | Cache / armazenamento de fotos |
| `redis` | `redis:7-alpine` | 1 | Filas (ARQ) e cache |
| `postgres` | `postgres:16-alpine` | 1 | Banco principal (asyncpg) |
| `backend` | `pelagus/memoria-video:latest` | 2 | API FastAPI (porta 8000) |
| `frontend` | `nginx:alpine` | 2 | SPA estático (porta 80) |

## Redes

| Rede | Driver | Tipo |
|------|--------|------|
| `memoria-internal` | `overlay` | Interna |
| `traefik-public` | `overlay` | **Externa** — alias para `network_swarm_public` |

## Volumes

| Volume | Uso |
|--------|-----|
| `mongodb-data` | Dados do MongoDB |
| `postgresql-data` | Dados do PostgreSQL |

## Build da imagem do backend

A imagem é construída pelo **Portainer URL Builder**:

```
URL:  https://github.com/prometheapelagus-cloud/memoria-video.git
Path: backend/Dockerfile
Tag:  pelagus/memoria-video:latest
```

## Deploy manual

```bash
docker stack deploy -c stack-memoria.yml memoria-video
```
