from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://memoria:memoria_dev@localhost:5432/memoria_video"
    mongodb_url: str = "mongodb://localhost:27017/memoria_video"
    secret_key: str = "change-me"
    debug: bool = True

    # Integration
    chatwoot_api_url: str = "http://localhost:3000"
    chatwoot_account_id: int = 1
    chatwoot_api_token: str = ""
    anthropic_api_key: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": False}


settings = Settings()
