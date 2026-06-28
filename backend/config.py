"""OpenBI configuration — reads all settings from environment variables."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # MongoDB
    MONGODB_URI: str = "mongodb://mongo:27017/openbi"
    MONGODB_DB_NAME: str = "openbi"

    # JWT
    JWT_SECRET_KEY: str = "change-me-to-random-64-char-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # MindsDB
    MINDSDB_URL: str = "http://mindsdb:47334"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""

    # File uploads
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # PDF
    PDF_FONT: str = "Inter"

    # Super Admin
    SUPER_ADMIN_EMAIL: Optional[str] = "admin@openbi.dev"
    SUPER_ADMIN_PASSWORD: Optional[str] = "changeme123"

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@openbi.dev"

    # App
    APP_URL: str = "http://localhost:3000"

    # CORS — comma-separated list of allowed origins (no wildcards in production)
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Fernet
    FERNET_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
