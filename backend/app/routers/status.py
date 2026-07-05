from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

router = APIRouter()


@router.get("/health")
async def health():
    """Health check do status."""
    return {"status": "ok"}


@router.get("/{pedido_id}/stream")
async def status_stream(pedido_id: str):
    """SSE stream para acompanhar processamento do pedido em tempo real."""
    return StreamingResponse(status_generator(pedido_id), media_type="text/event-stream")


async def status_generator(pedido_id: str):
    yield f"event: connected\ndata: {pedido_id}\n\n"
