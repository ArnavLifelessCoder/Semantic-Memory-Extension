from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/semantic_memory"
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 72

    # Google OAuth2 (optional — leave empty to disable)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Encryption
    ENCRYPTION_KEY_SALT: str = "semantic-memory-salt-v1"

    class Config:
        env_file = ".env"


settings = Settings()
