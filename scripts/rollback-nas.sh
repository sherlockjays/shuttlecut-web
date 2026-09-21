#!/usr/bin/env bash
#
# ShuttleCut NAS 롤백 스크립트
#
# 롤백은 소스가 아니라 이미지를 되돌리는 것이다. docker-compose.yml이 build:를 쓰므로
# 돌고 있는 컨테이너는 소스 디렉터리를 참조하지 않는다. 체크아웃을 옛 커밋으로
# 돌려봐야 아무 일도 일어나지 않는다. .env의 IMAGE_TAG를 바꾸고 --no-build로 띄우면 끝이다.
#
# 사용법은 --help로 본다 (아래 usage 함수).
#
set -Eeuo pipefail

DEPLOY_DIR="${SHUTTLECUT_DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Synology에서 docker는 PATH에 없고 소켓 권한도 거부되므로 전체 경로 + sudo로 부른다.
DOCKER_BIN="${DOCKER_BIN:-/var/packages/ContainerManager/target/usr/bin/docker}"
COMPOSE_BIN="${COMPOSE_BIN:-/var/packages/ContainerManager/target/usr/bin/docker-compose}"
BACKEND_CONTAINER=shuttlecut-web-backend-1
FRONTEND_CONTAINER=shuttlecut-web-frontend-1

# 배포 로그는 페이저를 타면 안 된다. NAS에는 less가 아예 없다.
export GIT_PAGER=cat
HEALTH_URL=http://127.0.0.1:8000/api/health
FRONTEND_URL=http://127.0.0.1:3000/

d() { sudo "$DOCKER_BIN" "$@"; }
dc() { sudo "$COMPOSE_BIN" "$@"; }

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m[경고]\033[0m %s\n' "$*"; }
die() {
  printf '\n\033[1;31m[중단]\033[0m %s\n' "$*" >&2
  exit 1
}

on_error() {
  local code=$?
  printf '\n\033[1;31m[실패]\033[0m 롤백이 중단되었습니다 (종료코드 %s)\n' "$code" >&2
  exit "$code"
}
trap on_error ERR

usage() {
  cat <<'EOF'
ShuttleCut NAS 롤백 스크립트

  bash scripts/rollback-nas.sh <되돌릴 SHA>

    <되돌릴 SHA>   되돌릴 이미지 태그. 기본값은 없다
    --yes          확인 프롬프트 생략

남아 있는 이미지 목록은 인자 없이 실행하면 볼 수 있다.
EOF
}

env_value() { sed -n "s/^$1=//p" "$DEPLOY_DIR/.env" | head -1; }

wait_http() {
  local url="$1" tries="$2" code="" i
  printf '    대기'
  for ((i = 1; i <= tries; i++)); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
    if [[ "$code" == 200 ]]; then
      printf ' 200\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf ' 실패 (마지막 응답: %s)\n' "${code:-없음}"
  return 1
}

confirm() {
  [[ -t 0 ]] || die "입력을 받을 수 없습니다. 터미널에서 실행하거나 --yes를 붙여주세요."
  local answer=""
  read -r -p "$1 [y/N] " answer || true
  [[ "$answer" =~ ^[Yy]$ ]]
}

available_tags() {
  d images --format '{{.Tag}}' shuttlecut-web-backend | grep -v '^<none>$' || true
}

# ── 인자 ───────────────────────────────────────────────────────────────────
TARGET=""
ASSUME_YES=0

while (($#)); do
  case "$1" in
    --yes | -y) ASSUME_YES=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "알 수 없는 옵션: $1" ;;
    *) TARGET="$1" ;;
  esac
  shift
done

[[ -d "$DEPLOY_DIR/.git" ]] || die "$DEPLOY_DIR 가 git 체크아웃이 아닙니다."
[[ -f "$DEPLOY_DIR/.env" ]] || die "$DEPLOY_DIR 에 루트 .env가 없습니다."
cd "$DEPLOY_DIR"

sudo -v || die "sudo 자격을 얻지 못했습니다."

CURRENT_TAG="$(env_value IMAGE_TAG)"
[[ -n "$CURRENT_TAG" ]] || die "루트 .env에서 IMAGE_TAG를 읽지 못했습니다."

# 위험한 동작에 기본값을 두지 않는다. 인자가 없으면 고를 수 있는 것만 보여준다.
if [[ -z "$TARGET" ]]; then
  usage
  echo
  info "현재 IMAGE_TAG: $CURRENT_TAG"
  info "남아 있는 이미지:"
  while read -r tag; do
    if [[ -n "$tag" ]]; then
      if [[ "$tag" == "$CURRENT_TAG" ]]; then info "  $tag  (현재)"; else info "  $tag"; fi
    fi
  done <<<"$(available_tags)"
  exit 1
fi

[[ "$TARGET" != "$CURRENT_TAG" ]] || die "이미 $TARGET 로 떠 있습니다."

# ── 되돌릴 이미지가 실제로 남아 있는지 ─────────────────────────────────────
# --no-build가 결국 잡아주지만, 여기서 먼저 멈추면 .env를 건드리지도 않는다.
log "되돌릴 이미지 확인"
missing=()
for repo in shuttlecut-web-backend shuttlecut-web-frontend; do
  if d image inspect "$repo:$TARGET" >/dev/null 2>&1; then
    info "$repo:$TARGET 있음"
  else
    missing+=("$repo:$TARGET")
  fi
done

if ((${#missing[@]})); then
  warn "없는 이미지: ${missing[*]}"
  info "남아 있는 태그:"
  while read -r tag; do
    if [[ -n "$tag" ]]; then info "  $tag"; fi
  done <<<"$(available_tags)"
  die "되돌릴 대상이 없습니다. 돌고 있는 컨테이너는 건드리지 않았습니다."
fi

echo
info "$CURRENT_TAG -> $TARGET 로 되돌립니다. 재빌드가 없어 수 초면 끝납니다."
if ((!ASSUME_YES)); then
  confirm "진행할까요?" || die "사용자가 중단했습니다."
fi

# ── 되돌리기 ───────────────────────────────────────────────────────────────
log "IMAGE_TAG 교체"
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$TARGET|" .env
info "IMAGE_TAG: $CURRENT_TAG -> $(env_value IMAGE_TAG)"

log "컨테이너 교체"
# --no-build는 옵션이 아니다. 빼면 compose가 요청한 이미지가 없을 때 현재 소스를 빌드해
# 그 옛 SHA 이름을 붙인다. 롤백 상황에서는 체크아웃이 장애 난 커밋에 있으므로,
# 장애 코드가 그대로 다시 뜨는데 명령은 성공으로 끝나고 이미지 저장소에 거짓 이름이 남는다.
# IMAGE_TAG를 백엔드와 프론트가 공유하므로 둘을 함께 되돌린다.
if ! dc up -d --no-build backend frontend; then
  # .env만 바뀌고 컨테이너는 그대로인 어중간한 상태를 남기지 않는다.
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$CURRENT_TAG|" .env
  die "컨테이너 교체에 실패해 .env를 $CURRENT_TAG 로 되돌렸습니다."
fi

# ── 확인 ───────────────────────────────────────────────────────────────────
log "확인"
for container in "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER"; do
  running="$(d inspect --format '{{.Config.Image}}' "$container")"
  info "$container -> $running"
  [[ "$running" == *":$TARGET" ]] || die "$container 가 아직 $TARGET 이 아닙니다."
done

wait_http "$HEALTH_URL" 30 || die "백엔드 health가 200이 아닙니다."
wait_http "$FRONTEND_URL" 15 || die "프론트엔드가 200이 아닙니다."

# ── 마무리 ─────────────────────────────────────────────────────────────────
log "롤백 완료: $CURRENT_TAG -> $TARGET"

cat <<EOF

    체크아웃은 건드리지 않았습니다. 지금 소스는 여전히 아래 커밋입니다.
      $(git log -1 --oneline HEAD)

    ⚠️ 이 상태에서 docker-compose build를 돌리면 안 됩니다. 체크아웃이 장애 커밋에
       있으므로 $TARGET 이름에 장애 코드가 박혀 롤백 자산이 사라집니다.

    ⚠️ IMAGE_TAG는 백엔드와 프론트가 공유합니다. 누가 up -d를 치면 양쪽 다
       $TARGET 으로 갑니다. 창을 짧게 유지하세요.

    돌아가는 길은 고친 커밋을 다시 배포하는 것입니다:
      bash $DEPLOY_DIR/scripts/deploy-nas.sh
EOF
