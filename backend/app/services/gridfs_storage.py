from app.database.mongodb import get_db, get_gridfs
from datetime import datetime, timezone
import hashlib


async def download_attachment(url: str) -> bytes:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def save_to_gridfs(data: bytes, filename: str, pedido_id: str, tipo: str, mime_type: str | None = None):
    if not mime_type:
        mime_type = _guess_mime_type(filename, data)
    gridfs = await get_gridfs()
    file_id = await gridfs.upload_from_stream(
        filename,
        data,
        metadata={"pedido_id": pedido_id, "tipo": tipo, "mime_type": mime_type},
    )
    db = await get_db()
    await db.fotos_metadados.insert_one({
        "pedido_id": pedido_id,
        "gridfs_file_id": file_id,
        "filename": filename,
        "file_size_bytes": len(data),
        "mime_type": mime_type,
        "file_hash": hashlib.sha256(data).hexdigest()[:16],
        "created_at": datetime.now(timezone.utc),
    })
    return str(file_id)


async def get_from_gridfs(file_id: str) -> bytes:
    from bson import ObjectId
    gridfs = await get_gridfs()
    stream = await gridfs.open_download_stream(ObjectId(file_id))
    return await stream.read()


async def delete_from_gridfs(file_id: str):
    from bson import ObjectId
    gridfs = await get_gridfs()
    await gridfs.delete(ObjectId(file_id))
    db = await get_db()
    await db.fotos_metadados.delete_one({"gridfs_file_id": ObjectId(file_id)})


async def list_by_pedido(pedido_id: str):
    db = await get_db()
    cursor = db.fotos_metadados.find({"pedido_id": pedido_id}).sort("created_at", 1)
    return await cursor.to_list(length=100)


async def get_metadados(file_id: str):
    from bson import ObjectId
    db = await get_db()
    return await db.fotos_metadados.find_one({"gridfs_file_id": ObjectId(file_id)})


def _guess_mime_type(filename: str, data: bytes) -> str:
    if data[:4] == b"\xff\xd8\xff\xe0":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF":
        return "image/webp"
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    return {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "mp4": "video/mp4"}.get(ext, "application/octet-stream")
