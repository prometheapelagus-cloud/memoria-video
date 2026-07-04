from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_eventos():
    return {"eventos": []}
