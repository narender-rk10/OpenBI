"""Unit tests for security utilities — no HTTP, no DB."""

import pytest
import time
from unittest.mock import patch
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    encrypt_api_key,
    decrypt_api_key,
)
from fastapi import HTTPException


class TestPasswordHashing:
    def test_hash_returns_string(self):
        h = hash_password("secret")
        assert isinstance(h, str)
        assert h != "secret"

    def test_verify_correct_password(self):
        h = hash_password("mypassword")
        assert verify_password("mypassword", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("mypassword")
        assert verify_password("wrongpassword", h) is False

    def test_same_password_different_hashes(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt uses random salt

    def test_empty_password(self):
        h = hash_password("")
        assert verify_password("", h) is True
        assert verify_password("notempty", h) is False


class TestJWT:
    def test_create_and_decode(self):
        token = create_access_token({"user_id": "abc", "role": "admin"})
        payload = decode_access_token(token)
        assert payload["user_id"] == "abc"
        assert payload["role"] == "admin"

    def test_decode_invalid_token_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            decode_access_token("not.a.valid.token")
        assert exc.value.status_code == 401

    def test_decode_tampered_token_raises_401(self):
        token = create_access_token({"user_id": "abc"})
        tampered = token[:-5] + "xxxxx"
        with pytest.raises(HTTPException) as exc:
            decode_access_token(tampered)
        assert exc.value.status_code == 401

    def test_expired_token_raises_401(self):
        from datetime import timedelta
        token = create_access_token({"user_id": "abc"}, expires_delta=timedelta(seconds=-1))
        with pytest.raises(HTTPException) as exc:
            decode_access_token(token)
        assert exc.value.status_code == 401

    def test_token_contains_exp(self):
        token = create_access_token({"user_id": "abc"})
        payload = decode_access_token(token)
        assert "exp" in payload
        assert payload["exp"] > time.time()


class TestApiKeyEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        key = "sk-test-1234567890abcdef"
        encrypted = encrypt_api_key(key)
        assert encrypted != key
        assert decrypt_api_key(encrypted) == key

    def test_empty_string_returns_empty(self):
        assert encrypt_api_key("") == ""
        assert decrypt_api_key("") == ""

    def test_decrypt_invalid_returns_empty(self):
        assert decrypt_api_key("not-valid-fernet-data") == ""

    def test_different_encryptions_for_same_key(self):
        key = "same-api-key"
        e1 = encrypt_api_key(key)
        e2 = encrypt_api_key(key)
        # Fernet uses random IV so ciphertexts differ but both decrypt correctly
        assert decrypt_api_key(e1) == key
        assert decrypt_api_key(e2) == key
