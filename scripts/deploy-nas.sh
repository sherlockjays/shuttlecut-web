#!/usr/bin/env bash
#
# ShuttleCut NAS 배포 스크립트
#
# README "배포" 절의 절차를 그대로 옮긴 것이다. 문서가 여전히 정본이고,
# 여기에는 사람이 기억해야만 작동하던 순서와 검증만 담는다.
#
# 사용법은 --help로 본다 (아래 usage 함수).
#
# -E: ERR 트랩이 함수 안에서도 걸리게 한다
set -Eeuo pipefail

# ── 배포 디렉터리 ──────────────────────────────────────────────────────────
# /tmp 사본으로 옮겨 타면 $0가 /tmp가 되므로, 원래 위치를 먼저 잡아 환경변수로 넘긴다.
DEPLOY_DIR="${SHUTTLECUT_DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export SHUTTLECUT_DEPLOY_DIR="$DEPLOY_DIR"

# ── 실행 중 자기 교체 회피 ────────────────────────────────────────────────
# 4단계의 git checkout이 지금 실행 중인 이 파일을 갈아치운다. bash는 스크립트를
# 스트리밍으로 읽기 때문에 파일이 바뀌면 오프셋이 어긋나 중간부터 엉뚱한 바이트를
# 실행할 수 있다. 시작하자마자 /tmp 사본으로 옮겨 탄다.
# Synology /tmp는 noexec이라 chmod +x가 아니라 bash로 불러야 한다.
if [[ -z "${_SHUTTLECUT_REEXEC:-}" ]]; then
  _copy="$(mktemp /tmp/deploy-nas.XXXXXX)"
  cat "${BASH_SOURCE[0]}" >"$_copy"
  _SHUTTLECUT_REEXEC=1 exec bash "$_copy" "$@"
fi
# 사본은 지워도 열린 fd로 계속 읽힌다. 남겨두면 /tmp에 쌓인다.
if [[ "$0" == /tmp/deploy-nas.* ]]; then rm -f "$0"; fi

# ── 상수 ───────────────────────────────────────────────────────────────────
# Synology에서 docker는 PATH에 없고 소켓 권한도 거부되므로 전체 경로 + sudo로 부른다.
# DSM 버전에 따라 경로가 다르면 환경변수로 덮어쓴다.
DOCKER_BIN="${DOCKER_BIN:-/var/packages/ContainerManager/target/usr/bin/docker}"
COMPOSE_BIN="${COMPOSE_BIN:-/var/packages/ContainerManager/target/usr/bin/docker-compose}"
BACKUP_DIR="${SHUTTLECUT_BACKUP_DIR:-/volume1/docker/shuttlecut-backups}"
BACKEND_CONTAINER=shuttlecut-web-backend-1
POSTGRES_CONTAINER=shuttlecut-web-postgres-1
HEALTH_URL=http://127.0.0.1:8000/api/health
FRONTEND_URL=http://127.0.0.1:3000/
APP_BASE_URL_EXPECTED=https://shuttlecut.kr
KEEP_IMAGES=3

# :? 를 붙일 수 없어 compose가 못 막는 키들. 로컬에서는 비워두는 것이 정상이라
# 중단이 아니라 경고로 둔다.
OPTIONAL_KEYS=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD)

d() { sudo "$DOCKER_BIN" "$@"; }
dc() { sudo "$COMPOSE_BIN" "$@"; }

# ── 출력 ───────────────────────────────────────────────────────────────────
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m[경고]\033[0m %s\n' "$*"; }

STAGE=0
PREV_TAG=""
NEW_SHA=""
WARNINGS=0

# 지금까지 진행된 단계에 따라 되돌리는 방법이 다르다.
rollback_hint() {
  if ((STAGE <= 4)); then
    info "이미지는 바뀌지 않았습니다. 돌고 있는 컨테이너는 소스 디렉터리를 참조하지 않으므로"
    info "되돌릴 것이 없습니다. 체크아웃만 원하는 커밋으로 맞추면 됩니다."
  else
    info "되돌리려면:"
    info "  bash $DEPLOY_DIR/scripts/rollback-nas.sh $PREV_TAG"
  fi
}

die() {
  printf '\n\033[1;31m[중단]\033[0m %s\n' "$*" >&2
  rollback_hint >&2
  exit 1
}

on_error() {
  local code=$?
  printf '\n\033[1;31m[실패]\033[0m %s단계에서 중단되었습니다 (종료코드 %s)\n' "$STAGE" "$code" >&2
  rollback_hint >&2
  exit "$code"
}
trap on_error ERR

# .env에서 키 하나를 읽는다. 없으면 빈 문자열(grep과 달리 종료코드가 0이다).
env_value() { sed -n "s/^$1=//p" "$DEPLOY_DIR/.env" | head -1; }

# /tmp 사본은 시작하자마자 지우므로 $0를 다시 읽을 수 없다. 사용법은 여기에 둔다.
usage() {
  cat <<'EOF'
ShuttleCut NAS 배포 스크립트

  bash scripts/deploy-nas.sh [ref]

    ref                   배포할 커밋/브랜치. 생략하면 origin/main
    --yes                 나갈 내용 확인 프롬프트 생략
    --skip-worker-pause   워커 일시정지 단계 생략
    --prune               배포 후 오래된 이미지 삭제 (직전 3개는 보존)

배포 디렉터리 밖에서 처음 실행할 때는 위치를 넘겨준다:
  SHUTTLECUT_DEPLOY_DIR=/volume1/docker/shuttlecut-web bash /tmp/deploy-nas.sh
EOF
}

# 200이 될 때까지 기다린다. 재시작 정책 때문에 기동 직후에는 200이 아니다.
# 기다리는 동안 아무 출력이 없으면 멈춘 것처럼 보이므로 점을 찍는다.
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
  local prompt="$1"
  [[ -t 0 ]] || die "입력을 받을 수 없습니다. 터미널에서 실행하거나 --yes를 붙여주세요."
  local answer=""
  # Ctrl-D로 끊으면 read가 1을 내는데, 그건 오류가 아니라 '아니오'다.
  read -r -p "$prompt [y/N] " answer || true
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ── 인자 ───────────────────────────────────────────────────────────────────
REF=origin/main
ASSUME_YES=0
SKIP_WORKER_PAUSE=0
DO_PRUNE=0

while (($#)); do
  case "$1" in
    --yes | -y) ASSUME_YES=1 ;;
    --skip-worker-pause) SKIP_WORKER_PAUSE=1 ;;
    --prune) DO_PRUNE=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "알 수 없는 옵션: $1" ;;
    *) REF="$1" ;;
  esac
  shift
done

# ── 0. 사전 조건 ───────────────────────────────────────────────────────────
STAGE=0
log "0. 사전 조건"

[[ -d "$DEPLOY_DIR/.git" ]] || die "$DEPLOY_DIR 가 git 체크아웃이 아닙니다."
[[ -f "$DEPLOY_DIR/docker-compose.yml" ]] || die "$DEPLOY_DIR 에 docker-compose.yml이 없습니다."
[[ -f "$DEPLOY_DIR/.env" ]] || die "$DEPLOY_DIR 에 루트 .env가 없습니다."
cd "$DEPLOY_DIR"

# 체크아웃이 깨끗한지가 배포 상태를 확인하는 유일한 수단이다.
dirty="$(git status --porcelain)"
if [[ -n "$dirty" ]]; then
  printf '%s\n' "$dirty"
  git diff --stat || true
  die "체크아웃에 변경이 있습니다.
    위 git diff --stat이 '0 insertions, 0 deletions'이면 내용이 아니라 파일 모드 차이입니다.
    Synology ACL이 붙은 디렉터리는 그 아래 파일을 755로 만드는데 git blob은 644입니다.
    대응 절차는 README의 배포 절에 있습니다."
fi
info "체크아웃 깨끗함"

# 이 값이 이 스크립트의 핵심 산출물이다. 이후 모든 롤백 안내에 박아서 출력한다.
PREV_TAG="$(env_value IMAGE_TAG)"
[[ -n "$PREV_TAG" ]] || die "루트 .env에서 IMAGE_TAG를 읽지 못했습니다."
info "현재 IMAGE_TAG: $PREV_TAG"
info "현재 커밋: $(git rev-parse --short=12 HEAD) $(git describe --tags --always 2>/dev/null || true)"

# sudo -S 는 쓰지 않는다. 프롬프트가 stdout 첫 줄을 먹는다.
sudo -v || die "sudo 자격을 얻지 못했습니다."
# 백엔드 빌드가 캐시 미스면 10분을 넘긴다. 그동안 sudo 타임아웃이 나지 않게 갱신한다.
while true; do
  sudo -n true 2>/dev/null || exit 0
  sleep 50
  kill -0 "$$" 2>/dev/null || exit 0
done &
SUDO_KEEPALIVE=$!
trap 'kill "$SUDO_KEEPALIVE" 2>/dev/null || true' EXIT

# ── 1. .env 값 검사 ────────────────────────────────────────────────────────
# 체크아웃보다 먼저 한다. 값이 틀렸으면 소스도 건드리지 않고 멈춘다.
STAGE=1
log "1. .env 값 검사"

# ① compose의 ${VAR:?}가 구조적으로 못 보는 키들
for key in "${OPTIONAL_KEYS[@]}"; do
  if [[ -z "$(env_value "$key")" ]]; then
    warn "$key 가 비어 있습니다."
    WARNINGS=$((WARNINGS + 1))
  fi
done
((WARNINGS == 0)) || info "GOOGLE_* 가 비면 구글 로그인이, SMTP_* 가 비면 인증 메일이 조용히 죽습니다."

# ② 자리표시자. :? 는 '값이 있다'로 판정해 통과시킨다.
if grep -q 'change-me' .env; then
  grep -n 'change-me' .env || true
  die ".env에 .env.example의 자리표시자(change-me)가 남아 있습니다."
fi

# ③ 값이 있되 운영 주소가 아닌 경우. 빠지면 auth.py가 옛 DDNS를 OAuth 콜백으로 보낸다(#66).
actual_base="$(env_value APP_BASE_URL)"
[[ "$actual_base" == "$APP_BASE_URL_EXPECTED" ]] ||
  die "APP_BASE_URL이 운영 주소가 아닙니다. (현재: '${actual_base:-비어 있음}', 기대: $APP_BASE_URL_EXPECTED)"

info "값 검사 통과 (경고 $WARNINGS건)"

# ── 2. DB 덤프 ─────────────────────────────────────────────────────────────
STAGE=2
log "2. DB 덤프"

pg_user="$(env_value POSTGRES_USER)"
pg_db="$(env_value POSTGRES_DB)"
[[ -n "$pg_user" && -n "$pg_db" ]] || die ".env에서 POSTGRES_USER/POSTGRES_DB를 읽지 못했습니다."

# 체크아웃 안에 만들지 않는다. git status가 더러워지면 0단계의 확인이 의미를 잃는다.
dump_path="$BACKUP_DIR/db-$(date +%Y%m%d).sql"
sudo mkdir -p "$BACKUP_DIR"
# redirect를 sudo bash -c 안쪽에 둬야 한다. 바깥에 두면 쓸 권한이 없다.
sudo bash -c "$DOCKER_BIN exec $POSTGRES_CONTAINER pg_dump -U '$pg_user' -d '$pg_db' > '$dump_path'"
dump_size="$(sudo stat -c %s "$dump_path")"
((dump_size > 0)) || die "덤프가 0바이트입니다: $dump_path"
info "$dump_path ($(numfmt --to=iec "$dump_size" 2>/dev/null || echo "${dump_size}B"))"

# ── 3. 나갈 내용 확인 ──────────────────────────────────────────────────────
STAGE=3
log "3. 나갈 내용"

git fetch origin main
git rev-parse --verify --quiet "${REF}^{commit}" >/dev/null || die "ref를 찾을 수 없습니다: $REF"
OLD_SHA="$(git rev-parse HEAD)"
NEW_SHA="$(git rev-parse "${REF}^{commit}")"

if [[ "$OLD_SHA" == "$NEW_SHA" ]]; then
  info "이미 $REF 와 같은 커밋입니다. 재빌드만 하게 됩니다."
else
  git log --oneline "$OLD_SHA..$NEW_SHA" || true
  echo
  git diff --stat "$OLD_SHA..$NEW_SHA" || true
fi

changed="$(git diff --name-only "$OLD_SHA..$NEW_SHA")"
BACKEND_CHANGED=0
REQS_CHANGED=0
grep -q '^backend/' <<<"$changed" && BACKEND_CHANGED=1 || true
grep -qx 'backend/requirements.txt' <<<"$changed" && REQS_CHANGED=1 || true

echo
if ((REQS_CHANGED)); then
  warn "backend/requirements.txt가 바뀝니다. 워커 PC에서 worker-venv를 재설치해야 합니다."
  info "NAS는 도커 빌드가 알아서 하지만 워커는 네이티브라 아무도 해주지 않습니다."
elif ((BACKEND_CHANGED)); then
  warn "backend/ 가 바뀝니다. 6단계에서 워커 갱신을 기다립니다."
else
  info "backend/ 변경 없음. 워커는 건드리지 않습니다."
fi

if ((!ASSUME_YES)); then
  confirm "이 내용으로 배포할까요?" || die "사용자가 중단했습니다."
fi

# ── 4. 체크아웃 + IMAGE_TAG ────────────────────────────────────────────────
STAGE=4
log "4. 체크아웃과 IMAGE_TAG"

# 두 명령 사이에 compose를 끼우면 새 compose 파일이 옛 IMAGE_TAG를 본다.
git checkout -f main
git reset --hard "$NEW_SHA"
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$(git rev-parse --short=12 HEAD)|" .env

NEW_TAG="$(env_value IMAGE_TAG)"
[[ "$NEW_TAG" == "$(git rev-parse --short=12 HEAD)" ]] || die "IMAGE_TAG 갱신에 실패했습니다."
info "IMAGE_TAG: $PREV_TAG -> $NEW_TAG"

# --quiet가 없으면 해석된 비밀값이 전부 stdout에 찍힌다.
# 새 compose 파일로 봐야 이번에 추가된 ${VAR:?} 키까지 검사된다.
dc config --quiet
info "compose 보간 통과"

# ── 5. 백엔드 ──────────────────────────────────────────────────────────────
# 요청을 받는 쪽이 먼저 올라가야 한다. 빌드가 실패해도 기존 컨테이너는 계속 돈다.
STAGE=5
log "5. 백엔드"

dc build backend
dc up -d backend

if ! wait_http "$HEALTH_URL" 30; then
  d logs "$BACKEND_CONTAINER" --tail=50 || true
  die "백엔드 health가 200이 아닙니다."
fi

# ── 6. 워커 ────────────────────────────────────────────────────────────────
# 백엔드보다 늦고 프론트보다 빨라야 하는 자리다.
STAGE=6
if ((BACKEND_CHANGED)) && ((!SKIP_WORKER_PAUSE)); then
  log "6. 워커"
  reqs_line=""
  if ((REQS_CHANGED)); then
    reqs_line="      worker-venv\\Scripts\\pip.exe install -r backend\\requirements.txt"
  fi
  cat <<EOF
    워커는 도커가 아니라 자기 PC의 소스를 직접 실행합니다. celery는 시작할 때
    import한 모듈을 메모리에 들고 있으므로, 재시작해야 새 코드가 반영됩니다.

    맞춰야 할 커밋: $NEW_SHA

    워커 PC에서:
      worker-venv\\Scripts\\celery.exe -A workers.tasks.celery inspect active
      worker-venv\\Scripts\\celery.exe -A workers.tasks.celery control shutdown
$reqs_line
      (체크아웃을 위 커밋으로 맞춘 뒤)
      .\\start-native-worker.ps1

    진행 중인 작업이 있으면 inspect active에 뜹니다. --pool=solo라 한 번에 하나씩
    처리하는데 그것이 20분짜리 인코딩일 수 있습니다. 강제로 죽이면 그 작업은 날아갑니다.

    주의: 워커는 지금 개발 체크아웃에서 돌고 있습니다. start-native-worker.ps1이
    자기 파일 위치를 \$ROOT로 잡아 \$ROOT\\backend를 PYTHONPATH에 넣기 때문입니다.
    git checkout을 그대로 실행하면 작업 중인 브랜치에서 튕겨 나옵니다.
    작업 브랜치를 먼저 확인하세요. 전용 체크아웃 분리는 이슈 #79입니다.
EOF
  [[ -t 0 ]] || die "워커 단계에서 입력을 받을 수 없습니다. --skip-worker-pause를 쓰거나 터미널에서 실행해주세요."
  read -r -p "    워커를 갱신했으면 Enter를 눌러주세요. " || true
elif ((BACKEND_CHANGED)); then
  log "6. 워커 (--skip-worker-pause로 건너뜀)"
  warn "워커가 아직 옛 커밋을 실행 중일 수 있습니다. $NEW_SHA 로 맞춰주세요."
  WARNINGS=$((WARNINGS + 1))
fi

# ── 7. 프론트엔드 ──────────────────────────────────────────────────────────
STAGE=7
log "7. 프론트엔드"

dc build frontend

# 빌드한 뒤 서빙하기 전에 검사한다. VITE_ 변수는 빌드 타임에 번들로 박히므로,
# 로컬 주소를 담은 .env가 빌드 컨텍스트에 섞이면 모든 사용자 브라우저가 자기 PC를 호출한다.
# react-router가 SSR 폴백으로 "http://localhost"를 갖고 있어 localhost가 아니라
# localhost:8000으로 검색해야 한다.
if d run --rm --entrypoint grep "shuttlecut-web-frontend:$NEW_TAG" \
  -rl "localhost:8000" /usr/share/nginx/html/assets/; then
  die "프론트 번들에 localhost:8000이 박혀 있습니다. 이 이미지를 띄우면 안 됩니다.
    frontend/.env가 빌드 컨텍스트에 섞였는지 확인해주세요(.dockerignore가 막아야 합니다)."
fi
info "번들 검사 통과"

dc up -d frontend

wait_http "$FRONTEND_URL" 15 || die "프론트엔드가 200이 아닙니다."

# ── 8. 컨테이너 환경변수 대조 ──────────────────────────────────────────────
# .env가 아니라 실제로 뜬 컨테이너를 본다. 기대 목록은 compose에서 읽으므로
# 별도 매니페스트가 필요 없다. 값은 찍지 않고 키 존재만 본다.
STAGE=8
log "8. 컨테이너 환경변수"

expected="$(awk '
  /^  [a-z]/                  { in_backend = ($0 ~ /^  backend:/); in_env = 0 }
  in_backend && /^    [a-z]/  { in_env = ($0 ~ /^    environment:/); next }
  in_backend && in_env && /^      [A-Z_]+:/ { sub(/:.*/, ""); gsub(/ /, ""); print }
' docker-compose.yml)"
[[ -n "$expected" ]] || die "docker-compose.yml에서 backend.environment를 읽지 못했습니다."

actual="$(d exec "$BACKEND_CONTAINER" printenv | cut -d= -f1)"
missing=()
while read -r key; do
  [[ -n "$key" ]] || continue
  grep -qx "$key" <<<"$actual" || missing+=("$key")
done <<<"$expected"

if ((${#missing[@]})); then
  warn "컨테이너가 받지 못한 키: ${missing[*]}"
  info "compose의 backend.environment에는 줄이 있는데 컨테이너에 없습니다. 확인이 필요합니다."
  WARNINGS=$((WARNINGS + ${#missing[@]}))
else
  info "$(wc -l <<<"$expected")개 키 모두 전달됨"
fi

# ── 9. 마무리 ──────────────────────────────────────────────────────────────
STAGE=9
log "9. 배포 완료"

short_sha="$(git rev-parse --short=12 HEAD)"
info "이미지 태그: $PREV_TAG -> $NEW_TAG"
info "커밋: $(git log -1 --oneline HEAD)"
if ((WARNINGS == 0)); then
  info "경고 없음"
else
  warn "경고 ${WARNINGS}건이 있었습니다. 위로 올려서 확인해주세요."
fi

cat <<EOF

    ── 되돌리기 ───────────────────────────────────────────────────────────
    문제가 보이면:
      bash $DEPLOY_DIR/scripts/rollback-nas.sh $PREV_TAG

    ── 배포 태그 ──────────────────────────────────────────────────────────
    NAS git에는 자격증명도 커밋 아이덴티티도 없어 태그를 만들지 못합니다.
    검증이 끝나면 로컬에서:
      git tag -a deploy-$(date +%Y%m%d) -m "배포 내용 한 줄" $short_sha
      git push origin deploy-$(date +%Y%m%d)
EOF

# ── 이미지 정리 ────────────────────────────────────────────────────────────
# docker image prune을 쓰지 않는다. 이 NAS의 dangling에는 다른 스택 이미지가 섞여 있다.
# 이름으로 고른 SHA 태그만 지운다.
stale="$(d images --format '{{.Tag}}' shuttlecut-web-backend |
  grep -v '^<none>$' | tail -n "+$((KEEP_IMAGES + 1))" || true)"
stale="$(grep -vx -e "$NEW_TAG" -e "$PREV_TAG" <<<"$stale" || true)"

if [[ -n "$stale" ]]; then
  echo
  info "── 오래된 이미지 (직전 ${KEEP_IMAGES}개 제외) ──"
  while read -r tag; do
    if [[ -n "$tag" ]]; then info "  $tag"; fi
  done <<<"$stale"

  if ((DO_PRUNE)) && { ((ASSUME_YES)) || confirm "    위 이미지를 삭제할까요?"; }; then
    while read -r tag; do
      [[ -n "$tag" ]] || continue
      d image rm "shuttlecut-web-backend:$tag" "shuttlecut-web-frontend:$tag" || true
    done <<<"$stale"
    info "삭제했습니다."
  elif ((!DO_PRUNE)); then
    info "  삭제하려면 --prune을 붙여 다시 실행하거나 docker image rm을 직접 쓰세요."
  fi
fi

echo
