"""내보내기 진행률 스냅샷. 워커가 쓰고 백엔드 status 엔드포인트가 읽는다.

양쪽이 이 모듈만 거치므로 키 형식과 값 모양이 어긋날 수 없다.
"""
import json

import redis as _redis

from core.config import require_env

_r = _redis.from_url(require_env("REDIS_URL"))

# 저장할 때마다 TTL이 갱신되므로 내보내기 전체 길이가 아니라 가장 긴 무응답 구간
# (Step2 인코딩 + NAS 업로드)보다 길면 된다. 만료돼도 화면이 "시작 중"으로 내려앉을 뿐이다.
PROGRESS_TTL_SEC = 60 * 60 * 24


def _key(export_id: int) -> str:
    return f"export_progress:{export_id}"


def save_progress(export_id: int, percent: int, message: str, remaining_seconds: int | None) -> None:
    payload = {"percent": percent, "message": message, "remaining_seconds": remaining_seconds}
    _r.set(_key(export_id), json.dumps(payload), ex=PROGRESS_TTL_SEC)


def load_progress(export_id: int) -> dict | None:
    raw = _r.get(_key(export_id))
    return json.loads(raw) if raw else None
