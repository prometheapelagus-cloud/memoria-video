from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/{pedido_id}/stream")
async def status_stream(pedido_id: str):
    return StreamingResponse(status_generator(pedido_id), media_type="text/event-stream")


async def status_generator(pedido_id: str):
    yield f"event: connected\ndata: {pedido_id}\n\n"
