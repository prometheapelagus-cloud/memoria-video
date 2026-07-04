#!/bin/bash
set -e
echo "Memórias em Vídeo — Deploy Swarm"
echo "Build backend image..."
docker build -t pelagus/memoria-video:latest ./backend
echo "Creating secrets..."
echo "sua-senha-postgres-aqui" | docker secret create memoria_pg_password - 2>/dev/null || echo "secret já existe"
echo "Deploy stack..."
docker stack deploy -c stack-memoria.yml memoria-video
echo "Deploy concluído!"
docker stack services memoria-video
