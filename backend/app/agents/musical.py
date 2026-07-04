_GENEROS = {
    "casamento": {"genero": "romantic_instrumental", "estilo": "romântico instrumental", "bpm_sugerido": 70, "descricao": "Piano e violino suave"},
    "bodas": {"genero": "classical_piano", "estilo": "clássico", "bpm_sugerido": 60, "descricao": "Piano clássico elegante"},
    "viagem": {"genero": "acoustic_folk", "estilo": "folk acústico", "bpm_sugerido": 90, "descricao": "Violão e voz suave"},
    "churrasco": {"genero": "sertanejo", "estilo": "sertanejo universitário", "bpm_sugerido": 110, "descricao": "Modão animado"},
    "futebol": {"genero": "rock_eletronico", "estilo": "rock eletrônico", "bpm_sugerido": 130, "descricao": "Rock energético com batida eletrônica"},
}


def selecionar_genero(tipo_evento: str) -> dict:
    return _GENEROS.get(tipo_evento.lower().strip(), {"genero": "pop", "estilo": "pop animado", "bpm_sugerido": 100, "descricao": "Música pop animada"})


async def sugerir_trilha(tipo_evento: str, preferencia: str | None = None) -> dict:
    return selecionar_genero(tipo_evento)
