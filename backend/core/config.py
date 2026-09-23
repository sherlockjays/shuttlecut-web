"""필수 환경변수. 비어 있으면 기동 단계에서 바로 실패한다."""
import os


class ConfigError(RuntimeError):
    """필수 환경변수가 비어 있어 기동할 수 없을 때."""


def require_env(name: str) -> str:
    """필수 환경변수를 읽는다. 각 키의 용도는 .env.example이 설명한다."""
    # docker compose가 ${VAR}를 맨몸으로 넘기면 빈 문자열로 "설정됨"이 되어
    # os.getenv의 기본값이 적용되지 않는다. 그래서 빈 값도 미설정으로 본다.
    value = os.getenv(name, "").strip()
    if not value:
        raise ConfigError(f"환경변수 {name}가 비어 있습니다. .env.example을 참고해 채워주세요.")
    return value
