from app.agents.curador import executar_curadoria
from app.agents.roteirista import gerar_timeline
from app.agents.musical import selecionar_genero
from app.agents.narrador import gerar_roteiro


class OrquestradorMemorias:
    """Orquestra o pipeline completo de criação de vídeo."""

    async def processar_pedido(self, pedido_id: str) -> dict:
        await self._publicar_status(pedido_id, "analyzing", 5)
        curadoria = await executar_curadoria(pedido_id)
        await self._publicar_status(pedido_id, "curating", 30)
        timeline = await gerar_timeline(curadoria.get("selected", []), "casamento")
        await self._publicar_status(pedido_id, "curating", 60)
        trilha = selecionar_genero("casamento")
        await self._publicar_status(pedido_id, "generating", 40)
        roteiro = await gerar_roteiro("casamento", [], "", usar_llm=False)
        await self._publicar_status(pedido_id, "generating", 60)
        await self._publicar_status(pedido_id, "done", 100)
        return {"pedido_id": pedido_id, "status": "queued"}

    async def _publicar_status(self, pedido_id: str, stage: str, progress: int, video_id: str | None = None):
        try:
            from app.database.redis import get_redis
            redis = await get_redis()
            msg = {"pedido_id": pedido_id, "stage": stage, "progress": progress}
            if video_id:
                msg["video_id"] = video_id
            import json
            await redis.publish("processamento:status", json.dumps(msg))
        except Exception:
            pass


orquestrador = OrquestradorMemorias()
