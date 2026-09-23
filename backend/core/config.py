"""설정. 환경변수를 읽는 방법과, 환경과 무관한 고정값을 둔다.

필수 환경변수가 비어 있으면 기동 단계에서 바로 실패한다.
"""
import os


class ConfigError(RuntimeError):
    """필수 환경변수가 비어 있어 기동할 수 없을 때."""


def optional_env(name: str) -> str:
    """선택 환경변수를 읽는다. 없으면 빈 문자열이고, 그 기능만 꺼진다."""
    # docker compose가 ${VAR}를 맨몸으로 넘기면 값이 없어도 "설정됨"이 되므로,
    # 미설정과 빈 값과 공백만 있는 값을 모두 "비었다"로 본다.
    return os.getenv(name, "").strip()


def require_env(name: str) -> str:
    """필수 환경변수를 읽는다. 비어 있으면 기동을 멈춘다.

    각 키의 용도는 .env.example이 설명한다.
    """
    value = optional_env(name)
    if not value:
        raise ConfigError(f"환경변수 {name}가 비어 있습니다. .env.example을 참고해 채워주세요.")
    return value


# ── 환경과 무관한 고정값 ──
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
