import asyncio
from app.database.postgres import async_session_factory
from app.models.evento import Evento


EVENTOS = [
    {"slug": "casamento", "nome": "Casamento", "estilo_video": "romantico",
     "musica_sugerida": "romantic_instrumental", "cor_emocao": "#FF69B4", "transicao_padrao": "fade_slow"},
    {"slug": "bodas", "nome": "Bodas de Casamento", "estilo_video": "classico",
     "musica_sugerida": "classical_piano", "cor_emocao": "#D4AF37", "transicao_padrao": "fade_slow"},
    {"slug": "viagem", "nome": "Viagem", "estilo_video": "aventura",
     "musica_sugerida": "acoustic_folk", "cor_emocao": "#4CAF50", "transicao_padrao": "slide"},
    {"slug": "churrasco", "nome": "Churrasco com amigos", "estilo_video": "descontraido",
     "musica_sugerida": "sertanejo", "cor_emocao": "#FF9800", "transicao_padrao": "cut"},
    {"slug": "futebol", "nome": "Evento de Futebol", "estilo_video": "esportivo",
     "musica_sugerida": "rock_eletronico", "cor_emocao": "#2196F3", "transicao_padrao": "zoom"},
]


async def seed():
    async with async_session_factory() as session:
        for data in EVENTOS:
            exists = await session.get(Evento, data["slug"])
            if not exists:
                session.add(Evento(**data))
        await session.commit()
    print("Eventos seedados")


if __name__ == "__main__":
    asyncio.run(seed())
