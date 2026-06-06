"""Security utilities — JWT, password hashing, API key encryption."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException, status

from backend.config import settings

logger = logging.getLogger(__name__)

# ---------- Fernet key ----------
if not settings.FERNET_KEY:
    logger.warning(
        "FERNET_KEY is not set — generating a random key. "
        "Encrypted data will be lost on restart. "
        "Set FERNET_KEY in your .env file for persistence."
    )
_fernet_key = settings.FERNET_KEY or Fernet.generate_key().decode()
_fernet = Fernet(_fernet_key.encode() if isinstance(_fernet_key, str) else _fernet_key)


# ---------- Password hashing (bcrypt) ----------

def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against its bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ---------- JWT ----------

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT access token. Raises 401 on failure."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------- API key encryption (Fernet) ----------

def encrypt_api_key(key: str) -> str:
    """Encrypt an API key using Fernet symmetric encryption."""
    if not key:
        return ""
    return _fernet.encrypt(key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted: str) -> str:
    """Decrypt a Fernet-encrypted API key."""
    if not encrypted:
        return ""
    try:
        return _fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""
