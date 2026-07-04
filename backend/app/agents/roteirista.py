from typing import Any
from app.config import settings

_TRANSICOES = {
    "casamento": {"style": "fade_slow", "duration": 1.5, "pace": "slow"},
    "bodas": {"style": "fade_slow", "duration": 2.0, "pace": "slow"},
    "viagem": {"style": "slide", "duration": 1.0, "pace": "medium"},
    "churrasco": {"style": "cut", "duration": 0.8, "pace": "medium"},
    "futebol": {"style": "zoom", "duration": 0.5, "pace": "fast"},
}


def _normalizar_evento(tipo_evento: str) -> str:
    return tipo_evento.lower().strip()


def gerar_timeline_programatica(fotos: list[dict], tipo_evento: str) -> dict:
    evento = _normalizar_evento(tipo_evento)
    trans = _TRANSICOES.get(evento, {"style": "fade", "duration": 1.0, "pace": "medium"})
    total = len(fotos)
    duracao_base = 4 if evento in ("casamento", "bodas") else 3
    timeline = []
    for i, foto in enumerate(fotos):
        duracao = duracao_base + (1 if i == 0 or i == total - 1 else 0)
        timeline.append({"filename": str(i), "ordem": i + 1, "transicao": trans["style"], "duracao_segundos": min(max(duracao, 2), 5), "destaque": i == 0 or i == total - 1})
    return {"timeline": timeline, "total_fotos": total, "duracao_total_segundos": sum(t["duracao_segundos"] for t in timeline), "evento": evento}


async def gerar_timeline(fotos: list[dict], tipo_evento: str, usar_llm: bool = True) -> dict:
    return gerar_timeline_programatica(fotos, tipo_evento)


def transicoes_disponiveis() -> dict:
    return dict(_TRANSICOES)
