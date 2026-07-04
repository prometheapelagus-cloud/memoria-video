from typing import Any
from agno.agent import Agent
from app.config import settings


async def _analisar_foto_ia(foto: dict) -> dict:
    return {"score": 0.5, "justificativa": "score neutro (modo fallback)"}


def _calcular_blur(data: bytes) -> float:
    try:
        from PIL import Image
        import io
        import numpy as np
        img = Image.open(io.BytesIO(data)).convert("L")
        arr = np.array(img, dtype=np.float32)
        laplacian = np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], dtype=np.float32)
        from scipy import signal
        edges = signal.convolve2d(arr, laplacian, mode="valid", boundary="fill")
        return float(np.var(edges))
    except Exception:
        return 500.0


def _calcular_hash(data: bytes) -> int:
    try:
        from PIL import Image
        import io
        import imagehash
        img = Image.open(io.BytesIO(data))
        return int(str(imagehash.dhash(img)), 16)
    except Exception:
        return 0


def _hamming_distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


async def executar_curadoria(pedido_id: str) -> dict:
    return {"selected": [], "rejected": [], "stats": {"total": 0, "selected": 0, "rejected": 0}}


class CuradorFotos(Agent):
    description = "Analisa e seleciona as melhores fotos para o vídeo"
    
    async def run(self, pedido_id: str) -> dict:
        return await executar_curadoria(pedido_id)
