import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "ResilienceX Distributed Backup & Recovery"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    
    # Database
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "resiliencex")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    
    # Redis
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL")
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    
    # JWT & Auth
    SECRET_KEY: str = os.getenv("JWT_SECRET", "resiliencex-super-secure-production-jwt-token-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Storage (MinIO / S3)
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")  # 'local', 'minio', or 's3'
    S3_ENDPOINT_URL: Optional[str] = os.getenv("S3_ENDPOINT_URL")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "resiliencex-vault")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    
    # Distributed Worker Leases
    WORKER_LEASE_SECONDS: int = 15
    WORKER_HEARTBEAT_SECONDS: int = 3
    MAX_JOB_RETRIES: int = 3

    # CORS
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "https://resiliencex-backup-recovery.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
    )

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="allow"
    )

    def get_database_url(self) -> str:
        """Returns SQLAlchemy-compatible connection string, normalizing postgres:// to postgresql://"""
        raw_url = self.DATABASE_URL
        if not raw_url:
            raw_url = (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
                f"{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        # Fix Render/Heroku legacy dialect format
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql://", 1)
        return raw_url

    def get_redis_url(self) -> str:
        """Returns configured Redis URL"""
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    def get_cors_origins(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()
