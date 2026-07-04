_TEMPLATES = {
    "casamento": "Neste dia tão especial, celebramos o amor e a união. Cada foto conta um pouco dessa história linda que vocês construíram juntos.",
    "bodas": "Anos de amor, cumplicidade e parceria. Cada imagem revela a beleza de uma jornada vivida a dois.",
    "viagem": "Que aventura incrível! Cada paisagem, cada sorriso registrado. As melhores lembranças estão guardadas aqui.",
    "churrasco": "Nada melhor que reunir os amigos, a boa comida e a música boa. Momentos como esse são os que ficam na memória.",
    "futebol": "A emoção do jogo, a torcida, a rivalidade amiga. Cada foto captura a energia desse esporte que amamos.",
}

_TOM = {
    "casamento": "emocional", "bodas": "emocional", "viagem": "descontraido",
    "churrasco": "alegre", "futebol": "epico",
}


async def gerar_roteiro(tipo_evento: str, nomes: list[str], descricao: str,
                        detalhes_fotos: list | None = None, usar_llm: bool = True) -> dict:
    evento = tipo_evento.lower().strip()
    template = _TEMPLATES.get(evento, "Que momentos especiais! Cada foto conta uma história única.")
    if nomes:
        template = f"{nomes[0]} — {template}"
    return {"script": template[:1000], "tom": _TOM.get(evento, "neutro"),
            "duracao_estimada_seg": max(15, len(template) // 15)}
