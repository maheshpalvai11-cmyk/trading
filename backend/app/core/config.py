from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SignalForge API"
    api_prefix: str = "/api"
    data_path: str = "backend/data/demo_ohlcv.csv"
    database_path: str = "backend/data/signalforge.db"
    database_url: str | None = None
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
