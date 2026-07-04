from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/chatwoot/message")
async def chatwoot_message(request: Request):
    payload = await request.json()
    return {"status": "received"}


@router.post("/chatwoot/conversation")
async def chatwoot_conversation(request: Request):
    payload = await request.json()
    return {"status": "received"}
