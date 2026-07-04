def montar_script_mpt(fotos: list[dict], roteiro: dict, trilha: dict, narracao: dict, *, formatos: list[str] | None = None) -> dict:
    if formatos is None:
        formatos = ["9:16", "16:9"]
    image_list = []
    for i, foto in enumerate(fotos[:20]):
        image_list.append({"url": foto if isinstance(foto, str) else foto.get("path", ""), "duration": roteiro.get("timeline", [{}])[i].get("duracao_segundos", 3) if i < len(roteiro.get("timeline", [])) else 3})
    return {
        "video_subject": f"Vídeo personalizado ({trilha.get('genero', 'geral')})",
        "video_script": narracao.get("script", ""),
        "image_list": image_list,
        "audio_url": trilha.get("arquivo", ""),
        "subtitle_enabled": True,
        "subtitle_position": "bottom",
        "transition_style": roteiro.get("transitions", {}).get("style", "fade"),
        "video_aspect_ratio": "9:16",
        "video_concat_mode": "sequential",
    }


def validar_script(script: dict) -> list[str]:
    erros = []
    if not script.get("image_list"):
        erros.append("Nenhuma imagem na lista")
    if not script.get("video_script"):
        erros.append("Nenhum roteiro de vídeo")
    return erros
