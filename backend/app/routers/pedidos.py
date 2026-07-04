from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_pedidos():
    return {"pedidos": []}


@router.get("/{pedido_id}")
async def get_pedido(pedido_id: str):
    return {"pedido_id": pedido_id}
