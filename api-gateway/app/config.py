from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql+asyncpg://finflow:finflow_dev_2024@localhost:5432/finflow"
    database_sync_url: str = "postgresql://finflow:finflow_dev_2024@localhost:5432/finflow"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Elasticsearch
    elasticsearch_url: str = "http://localhost:9200"

    # Security
    secret_key: str = "change-this-in-production-min-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # MLflow
    mlflow_tracking_uri: str = "http://localhost:5000"

    # Environment
    environment: str = "development"
    log_level: str = "INFO"

    # 첫 admin 부트스트랩 (.env.prod에서 주입)
    admin_email: str | None = None
    admin_password: str | None = None
    admin_name: str = "Admin"


settings = Settings()
