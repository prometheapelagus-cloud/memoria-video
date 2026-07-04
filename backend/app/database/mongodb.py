from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from app.config import settings

_client: AsyncIOMotorClient | None = None


async def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_url)
    return _client


async def get_db() -> AsyncIOMotorDatabase:
    client = await get_mongo_client()
    return client.memoria_video


async def get_gridfs() -> AsyncIOMotorGridFSBucket:
    db = await get_db()
    return AsyncIOMotorGridFSBucket(db)


async def close_mongo():
    global _client
    if _client:
        _client.close()
        _client = None
