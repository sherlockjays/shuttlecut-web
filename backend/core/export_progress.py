"""내보내기 진행률 스냅샷. 워커가 쓰고 백엔드 status 엔드포인트가 읽는다.

양쪽이 이 모듈만 거치므로 키 형식과 값 모양이 어긋날 수 없다.
"""
import json
import logging

import redis as _redis

from core.config import require_env

log = logging.getLogger(__name__)

# status 엔드포인트가 processing 동안 2초마다 읽는다. Redis가 응답 없이 매달리면 그 요청들이
# 스레드풀을 하나씩 잡으므로 OS TCP 타임아웃까지 기다리지 않는다.
_r = _redis.from_url(require_env("REDIS_URL"), socket_connect_timeout=2, socket_timeout=2)

# 저장할 때마다 갱신되므로 하한은 가장 긴 무응답 구간(Step2 인코딩 + NAS 업로드)이다.
# 만료돼도 화면이 "시작 중"으로 내려앉을 뿐이고, 키 하나라 비용이 없어 넉넉히 둔다.
PROGRESS_TTL_SEC = 60 * 60 * 24


def _key(export_id: int) -> str:
    return f"export_progress:{export_id}"


def save_progress(export_id: int, percent: int, message: str, remaining_seconds: int | None) -> None:
    """진행률은 보조 정보라 Redis 오류로 내보내기를 중단하지 않는다. 로그만 남기고 계속 간다."""
    payload = {"percent": percent, "message": message, "remaining_seconds": remaining_seconds}
    try:
        _r.set(_key(export_id), json.dumps(payload), ex=PROGRESS_TTL_SEC)
    except _redis.RedisError as e:
        log.warning(f"진행률 저장 실패 (export {export_id}, {percent}%): {e}")


def load_progress(export_id: int) -> dict | None:
    raw = _r.get(_key(export_id))
    return json.loads(raw) if raw else None
