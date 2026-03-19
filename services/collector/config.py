from pydantic_settings import BaseSettings, SettingsConfigDict


class CollectorSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://finflow:finflow_dev_2024@localhost:5432/finflow"
    redis_url: str = "redis://localhost:6379/0"
    api_base_url: str = "http://localhost:8000"

    # 홈택스 API
    hometax_api_key: str = ""
    hometax_base_url: str = "https://api.hometax.go.kr"

    # 오픈뱅킹
    openbanking_client_id: str = ""
    openbanking_client_secret: str = ""
    openbanking_base_url: str = "https://openapi.openbanking.or.kr"

    # OCR
    ocr_confidence_threshold: float = 0.85
    ocr_language: str = "korean"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"


settings = CollectorSettings()
