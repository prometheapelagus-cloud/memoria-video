import httpx
from app.config import settings


class ChatwootClient:
    def __init__(self):
        self.base_url = settings.chatwoot_api_url.rstrip("/")
        self.account_id = settings.chatwoot_account_id
        self.token = settings.chatwoot_api_token
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"api_access_token": self.token, "Content-Type": "application/json"},
            timeout=30,
        )

    async def send_message(self, conversation_id: int, content: str, private: bool = False):
        resp = await self.client.post(
            f"/api/v1/accounts/{self.account_id}/conversations/{conversation_id}/messages",
            json={"content": content, "message_type": "outgoing", "private": private},
        )
        resp.raise_for_status()
        return resp.json()

    async def send_attachment(self, conversation_id: int, file_path: str, private: bool = False):
        with open(file_path, "rb") as f:
            resp = await self.client.post(
                f"/api/v1/accounts/{self.account_id}/conversations/{conversation_id}/messages",
                files={"attachments": (file_path, f, "application/octet-stream")},
                data={"content": "", "private": str(private).lower()},
            )
        resp.raise_for_status()
        return resp.json()

    async def add_tag(self, conversation_id: int, tags: list[str]):
        resp = await self.client.post(
            f"/api/v1/accounts/{self.account_id}/conversations/{conversation_id}/labels",
            json={"labels": tags},
        )
        resp.raise_for_status()
        return resp.json()

    async def resolve_conversation(self, conversation_id: int):
        resp = await self.client.post(
            f"/api/v1/accounts/{self.account_id}/conversations/{conversation_id}/toggle_status",
            json={"status": "resolved"},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_conversation(self, conversation_id: int):
        resp = await self.client.get(
            f"/api/v1/accounts/{self.account_id}/conversations/{conversation_id}"
        )
        resp.raise_for_status()
        return resp.json()


chatwoot_client = ChatwootClient()
