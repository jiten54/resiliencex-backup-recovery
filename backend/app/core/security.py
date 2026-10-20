import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
from jose import jwt
from backend.app.core.config import settings

def _hash_pbkdf2(password: str, salt: str = "resiliencex_salt_2026") -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt", "argon2"], deprecated="auto")
    _has_passlib = True
except Exception:
    _has_passlib = False

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject), "iat": datetime.now(timezone.utc)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if _has_passlib:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            pass
    # Fallback / PBKDF2 check
    return hmac.compare_digest(_hash_pbkdf2(plain_password), hashed_password)

def get_password_hash(password: str) -> str:
    if _has_passlib:
        try:
            return pwd_context.hash(password)
        except Exception:
            pass
    return _hash_pbkdf2(password)
