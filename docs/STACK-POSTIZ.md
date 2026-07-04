# Stack Postiz — Calendário de Posts

Stack completa do **Postiz** (agendador de posts para redes sociais),
rodando em Docker Swarm no servidor `pelagus-core`.

## Acesso

| Item | URL |
|------|-----|
| App | https://calenpost.pelagus.com.br |
| API | https://calenpost.pelagus.com.br/api |
| Temporal UI | http://temporal-ui:8080 (acesso interno) |

## Serviços

| Serviço | Imagem | Réplicas | Função |
|---------|--------|----------|--------|
| `postiz` | `ghcr.io/gitroomhq/postiz-app:latest` | 1 | App principal (Next.js) |
| `temporal` | `temporalio/auto-setup:1.28.1` | 1 | Workflow engine |
| `temporal-ui` | `temporalio/ui:2.34.0` | 1 | Dashboard do Temporal |
| `temporal-admin-tools` | `temporalio/admin-tools:1.28.1` | 1 | CLI de admin |
| `temporal-postgresql` | `postgres:16` | 1 | Banco do Temporal |
| `temporal-elasticsearch` | `elasticsearch:7.17.27` | 1 | Índice do Temporal |

## Rede

```yaml
networks:
  postiz-network:
    driver: overlay
    attachable: true
  network_swarm_public:
    external: true
```

- `postiz-network`: rede interna entre os serviços do Postiz
- `network_swarm_public`: rede externa compartilhada com o Traefik
  (já existente no Swarm — usada por outras stacks como `memoria-video`)

## Volumes

| Volume | Uso |
|--------|-----|
| `postiz-uploads` | Uploads de mídia dos posts |
| `temporal-postgres-data` | Dados do banco Temporal |
| `temporal-elasticsearch-data` | Índices do Elasticsearch |

## Stack completa

```yaml
version: "3.7"

services:
  # ====================================================================
  #   POSTIZ (App Principal)
  # ====================================================================
  postiz:
    image: ghcr.io/gitroomhq/postiz-app:latest
    hostname: "{{.Service.Name}}.{{.Task.Slot}}"
    restart: always
    environment:
      MAIN_URL: 'https://calenpost.pelagus.com.br'
      FRONTEND_URL: 'https://calenpost.pelagus.com.br'
      NEXT_PUBLIC_BACKEND_URL: 'https://calenpost.pelagus.com.br/api'
      JWT_SECRET: 'CAT6Wp6nLDAidoN6VFQmdXTj7LTrJTQT'
      DATABASE_URL: 'postgresql://postgres:***@postgres:5432/postizdblocal'
      REDIS_URL: 'redis://redis:6379/7'
      BACKEND_INTERNAL_URL: 'http://localhost:3000'
      TEMPORAL_ADDRESS: "temporal:7233"
      IS_GENERAL: 'true'
      DISABLE_REGISTRATION: 'true'
      RUN_CRON: 'true'

      # R2 Storage (Cloudflare)
      STORAGE_PROVIDER: 'cloudflare'
      CLOUDFLARE_ACCOUNT_ID: 'c4aade1b144d6cb6c2e564cc8727f13d'
      CLOUDFLARE_ACCESS_KEY: 'b061522e6f17df0ea42df2274815046b'
      CLOUDFLARE_SECRET_ACCESS_KEY: 'abed5f98f2e661478a067ad8cc69db90df2164c663221e63ccbec0ebc118095e'
      CLOUDFLARE_BUCKETNAME: 'postiz-media'
      CLOUDFLARE_BUCKET_URL: 'https://pub-077b791b56324045aca51f67788a113e.r2.dev'
      CLOUDFLARE_REGION: 'auto'

      # SSRF Protection
      DISABLE_SSRF_PROTECTION: 'false'

      # Social Media API Keys
      FACEBOOK_APP_ID: '2130260570904805'
      FACEBOOK_APP_SECRET: 'd65184c2c26a02c9099d677ba2240cc1'

    volumes:
      - postiz-uploads:/uploads/
    networks:
      - postiz-network
      - network_swarm_public
    depends_on:
      - temporal
    healthcheck:
      test: ["CMD", "node", "-e", "const r=require('http').get('http://localhost:5000/',res=>process.exit(res.statusCode<500?0:1));r.on('error',()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core
      labels:
        - traefik.enable=true
        - traefik.http.routers.postiz.rule=Host(`calenpost.pelagus.com.br`)
        - traefik.http.routers.postiz.entrypoints=websecure
        - traefik.http.routers.postiz.tls.certresolver=letsencryptresolver
        - traefik.http.routers.postiz.service=postiz
        - traefik.http.services.postiz.loadbalancer.server.port=5000

  # ====================================================================
  #   TEMPORAL (Workflow Engine)
  # ====================================================================
  temporal-elasticsearch:
    image: elasticsearch:7.17.27
    hostname: temporal-elasticsearch
    restart: always
    environment:
      - cluster.routing.allocation.disk.threshold_enabled=true
      - cluster.routing.allocation.disk.watermark.low=512mb
      - cluster.routing.allocation.disk.watermark.high=256mb
      - cluster.routing.allocation.disk.watermark.flood_stage=128mb
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms256m -Xmx256m
      - xpack.security.enabled=false
    networks:
      - postiz-network
    volumes:
      - temporal-elasticsearch-data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS \"http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s\" || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 10
      start_period: 60s
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core

  temporal-postgresql:
    image: postgres:16
    hostname: temporal-postgresql
    restart: always
    environment:
      POSTGRES_PASSWORD: temporal
      POSTGRES_USER: temporal
    networks:
      - postiz-network
    volumes:
      - temporal-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U temporal"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core

  temporal:
    image: temporalio/auto-setup:1.28.1
    hostname: temporal
    restart: always
    depends_on:
      - temporal-postgresql
      - temporal-elasticsearch
    environment:
      - DB=postgres12
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=temporal-postgresql
      - ENABLE_ES=true
      - ES_SEEDS=temporal-elasticsearch
      - ES_VERSION=v7
      - TEMPORAL_NAMESPACE=default
    networks:
      - postiz-network
    healthcheck:
      test: ["CMD", "temporal", "operator", "cluster", "health", "--address", "temporal:7233"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core

  temporal-ui:
    image: temporalio/ui:2.34.0
    hostname: temporal-ui
    restart: always
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    networks:
      - postiz-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
    depends_on:
      - temporal
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core

  temporal-admin-tools:
    image: temporalio/admin-tools:1.28.1-tctl-1.18.4-cli-1.4.1
    hostname: temporal-admin-tools
    restart: on-failure
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CLI_ADDRESS=temporal:7233
    networks:
      - postiz-network
    stdin_open: true
    depends_on:
      - temporal
    tty: true
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == pelagus-core

volumes:
  postiz-uploads:
  temporal-postgres-data:
  temporal-elasticsearch-data:

networks:
  postiz-network:
    driver: overlay
    attachable: true
  network_swarm_public:
    external: true
```

## Observações

- **Rede pública**: `network_swarm_public` é a rede externa compartilhada com o Traefik
- **Temporal**: workflow engine essencial para o agendamento dos posts
- **Storage**: mídias no Cloudflare R2 (bucket `postiz-media`)
- **Registro desabilitado**: `DISABLE_REGISTRATION=true`
- **Porta**: Postiz expõe na **5000** (Next.js)
