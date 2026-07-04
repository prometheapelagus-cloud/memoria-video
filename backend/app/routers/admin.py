from fastapi import APIRouter

router = APIRouter()


@router.get("/metricas")
async def metricas():
    return {"metricas": {}}
