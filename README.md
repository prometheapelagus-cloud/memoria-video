# 🎬 Memórias em Vídeo

App que recebe fotos via WhatsApp e monta vídeos emocionais personalizados.

## Stack

- **Backend:** Python FastAPI + Agno + Claude Haiku
- **Storage:** MongoDB (GridFS) + PostgreSQL
- **Queue:** Redis + Arq
- **Video:** MoneyPrinterTurbo + FFmpeg fallback
- **Dashboard:** HTML + CSS + JS (Vanilla)
- **WhatsApp:** Chatwoot (self-hosted)
- **Infra:** Docker Swarm + Traefik

## Dev

```bash
docker compose up -d
cd backend && uvicorn app.main:app --reload
```

## Deploy

```bash
docker stack deploy -c stack-memoria.yml memoria-video
```

## Docs

[Google Docs — Documentação Técnica](https://docs.google.com/document/d/1Z2IOpavDzDxfw1-RtItgTP56BxR7tOmph0Qfa3T-y9o/edit)
