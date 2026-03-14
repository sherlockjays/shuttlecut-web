"""토큰 암호화/복호화 유틸 (YouTube refresh_token 등 민감 데이터 보호)"""
import os
import hashlib
import base64

from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    secret = os.getenv("SECRET_KEY", "changeme")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_token(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """복호화 실패 시 평문 그대로 반환 (기존 평문 토큰 마이그레이션 호환)"""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        return ciphertext
