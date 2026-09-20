# ShuttleCut

배드민턴 경기 영상에서 랠리만 잘라내고, 점수판 오버레이를 입히고, 유튜브에 업로드까지 해주는 웹 서비스입니다.

- 서비스: https://shuttlecut.kr

## 아키텍처

```
사용자 브라우저
    │
    ▼
NAS (Synology, 24시간 구동)
  nginx :3000 ─ React SPA
  FastAPI :8000 ─ 로그인/업로드/프로젝트/랠리 편집 API
  PostgreSQL :15432, Redis :6379
  /data/videos ─ 원본 영상 · 내보내기 결과물 저장
    │  (내보내기 요청 시 Redis에 작업만 큐잉)
    ▼
로컬 PC (RTX 2060) ─ Celery 네이티브 워커
  Redis 큐를 소비해서 ffmpeg로 실제 인코딩 수행
  결과물을 NAS에 HTTP로 업로드
```

> **⚠️ 운영 참고사항**
> 로그인·영상 업로드·랠리 구간 편집·점수판 오버레이 설정은 NAS만으로 동작합니다 (24시간 구동).
> 하지만 **"내보내기"(최종 mp4 인코딩)는 NAS에 GPU/워커가 없어서 처리되지 않습니다** — 관리자 로컬 PC에서 네이티브 워커(`start-native-worker.ps1`)가 떠 있어야만 실제로 처리됩니다. 이 PC가 꺼져 있거나 워커 프로세스가 안 떠 있으면 내보내기 작업은 Redis 큐에 쌓인 채 계속 대기 상태로 남습니다. 현재는 워커 자동 시작 장치(서비스 등록 등)가 없어서 매번 수동으로 스크립트를 실행해야 합니다. (자세한 실행 방법은 아래 ["실제 서비스 운영 — 내보내기 워커 실행"](#실제-서비스-운영--내보내기-워커-실행) 참고)
>
> 배포 환경은 **local(개발자 PC) / prod(NAS)** 두 단계뿐이고 별도 dev·staging 서버는 없습니다. 프론트 개발 시엔 로컬 백엔드를 띄워야 하는데(개발서버가 `/api`를 `localhost:8000`으로 프록시합니다), 이 로컬 백엔드는 보통 NAS의 운영 DB/Redis에 그대로 연결해서 쓰므로 로컬 개발 중 만든 데이터가 운영 DB에 그대로 들어갑니다.

## 기술 스택

| 레이어     | 기술                                                              |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19 + TypeScript + Vite + Tailwind CSS                       |
| Backend    | FastAPI + Celery + Redis + PostgreSQL + SQLAlchemy                |
| 영상처리   | ffmpeg (moviepy 기반, 병렬 클립 추출 + 오버레이 합성)             |
| GPU 인코딩 | h264_nvenc (CUDA, RTX 2060) — GPU 없으면 libx264(CPU)로 자동 폴백 |
| 인증       | JWT + Google OAuth2                                               |
| 스토리지   | 로컬 디스크 (`/data/videos`, NAS 기준)                            |
| YouTube    | google-api-python-client                                          |

## 폴더 구조

```
backend/
  main.py                     FastAPI 앱, 스키마 초기화
  Dockerfile                  백엔드 서버 이미지
  requirements.txt
  api/routes/                 auth, videos, projects, export, youtube, admin
  core/                       exporter.py, rally_manager.py 등
  workers/tasks.py            Celery 태스크 (run_export)
frontend/
  src/                        React SPA
docker-compose.yml             프론트/백/DB/Redis 전체 스택
start-native-worker.ps1        Windows 네이티브 GPU 워커 실행 스크립트
.github/workflows/ci.yml       PR 검증 (프론트 빌드·린트·포맷·테스트, 백엔드 이미지 빌드)
```

## 로컬에서 개발하기

### 사전 준비물

- Docker Desktop
- Node.js 24 (프론트 개발 시) — `frontend/package.json`의 `engines`가 `^24.0.0`으로 고정되어 있고 `engine-strict`가 켜져 있어, 다른 메이저 버전에서는 `npm install`이 거부됩니다
- Python 3.11 (백엔드/워커 개발 시)
- ffmpeg — PATH에 등록되어 있어야 함
- `backend/fonts/NanumGothicBold.ttf` — 오버레이 텍스트 렌더링용 폰트. gitignore 대상이라 직접 받아서 넣어야 함 (없으면 기본 폰트로 대체되어 한글이 깨질 수 있음)
- GPU는 선택사항입니다. NVIDIA GPU가 없다면 워커 실행 시 `ENABLE_GPU=0`으로 두면 `libx264` CPU 인코딩으로 동작합니다 (느릴 뿐, 기능은 동일). GPU로 돌리려면 NVIDIA 드라이버 + CUDA 12.6이 필요합니다.

백엔드 서버 또는 워커를 로컬에서 돌리려면 가상환경이 필요합니다. `worker-venv/`는 gitignore 대상이라 새 환경에서는 직접 만들어야 합니다 (백엔드와 워커가 같은 `requirements.txt`를 쓰므로 하나만 만들어서 공용으로 씁니다):

```powershell
python -m venv worker-venv
worker-venv\Scripts\pip install -r backend\requirements.txt
```

### 환경변수 설정

예시 파일을 복사해서 환경변수들을 채웁니다.

```
copy .env.example .env
copy backend\.env.example backend\.env
```

파일마다 읽는 주체와 시점이 다릅니다. 키 이름이 겹치더라도 한 프로세스가 두 파일을 함께 읽는 일은 없습니다.

| 파일 | 읽는 주체 | 언제 쓰이나 |
| --- | --- | --- |
| 루트 `.env` | docker compose (`${VAR}` 치환) | 컨테이너를 띄울 때. 방식 A, B-2 |
| `backend/.env` | 백엔드 프로세스 (`main.py`의 `load_dotenv`) | 백엔드를 네이티브로 띄울 때. 방식 B |

`GOOGLE_CLIENT_ID`/`SECRET`, `SMTP_*`는 비워둬도 로컬 개발이 깨지지는 않습니다 (SMTP는 미설정 시 발송 없이 콘솔 로그만 남기고 넘어가고, Google 로그인은 버튼을 눌렀을 때 Google 쪽에서 에러 발생)
다만 **Google 로그인과 이메일 인증/재설정 메일 발송은 로컬에서 테스트할 수 없습니다.**
이 두 기능까지 로컬에서 테스트하려면:

- NAS와 동일한 `GOOGLE_CLIENT_ID`/`SECRET`, SMTP 값을 그대로 채우고
- `APP_BASE_URL`을 브라우저가 실제로 SPA를 여는 주소로 맞춥니다. 방식 B는 `http://localhost:5173`, 방식 A는 `http://localhost:3000`입니다
- Google Cloud Console의 OAuth 클라이언트에 그 주소 기준으로 리다이렉트 URI 두 개를 등록합니다 (안 하면 `redirect_uri_mismatch` 에러).

  ```
  http://localhost:5173/api/auth/google/callback
  http://localhost:5173/api/youtube/callback
  ```

  콜백이 개발서버(5173)에 떨어져야 프록시를 타고 백엔드에 닿으면서 SPA와 같은 오리진으로 돌아옵니다.

마이그레이션 도구(alembic)는 설치만 되어 있고 실제로는 안 씁니다 — 백엔드 시작 시 `init_db()`가 스키마를 자동으로 생성/보정하므로 별도 마이그레이션 커맨드는 필요 없습니다.

### A. 전체 스택을 컨테이너로 (운영 형상 검증)

운영과 같은 모양(빌드된 이미지 + nginx)으로 한 번 돌려볼 때 씁니다.

```powershell
docker compose up -d          # frontend:3000, backend:8000, postgres:15432, redis:6379
```

**개발 중에는 권하지 않습니다.** 백엔드를 한 줄 고칠 때마다 `docker compose build backend`가 필요합니다. 이 방식으로만 드러나는 건 코드가 아니라 환경 차이(리눅스 vs 윈도우, 컨테이너의 Python 3.11 vs 로컬 `worker-venv` 버전, apt로 깔리는 ffmpeg·libgl 등 시스템 패키지)이므로, 배포 전 확인용으로 씁니다.

### B. 네이티브 백엔드 + 프론트 (일상 개발)

백엔드는 `--reload`, 프론트는 vite HMR로 돌리고 postgres/redis만 컨테이너를 씁니다. 개발서버가 `/api` 요청을 `localhost:8000`으로 프록시하므로 백엔드도 같이 떠 있어야 합니다. DB는 둘 중 하나를 고릅니다.

**B-1. NAS의 운영 DB/Redis 사용.** 실데이터를 봐야 할 때 씁니다. `backend/.env`를 NAS 주소로 둡니다.

```
DATABASE_URL=postgresql://<NAS_DB_USER>:<PW>@<NAS_IP>:15432/shuttlecut
REDIS_URL=redis://:<PW>@<NAS_IP>:6379/0
```

> ⚠️ 로컬에서 만든 프로젝트/유저 데이터가 실제 운영 DB에 그대로 들어갑니다. 스키마 변경과 데이터 삭제는 하지 마세요.
> ⚠️ `SECRET_KEY`를 NAS와 같은 값으로 맞춰야 합니다. 이 값에서 YouTube refresh_token 암호화 키가 파생되기 때문에, 다르면 저장된 토큰을 서로 읽지 못합니다.

**B-2. 로컬 DB/Redis 사용.** 격리된 빈 DB로 시작할 때 씁니다. 루트 `.env`가 필요합니다.

```powershell
docker compose up -d postgres redis
```

`backend/.env`의 주소를 로컬로 두고, 비밀번호는 루트 `.env`의 값과 맞춥니다.

```
DATABASE_URL=postgresql://shuttlecut:<PW>@localhost:15432/shuttlecut
REDIS_URL=redis://:<PW>@localhost:6379/0
```

실행은 B-1, B-2가 같습니다.

```powershell
cd backend
..\worker-venv\Scripts\uvicorn main:app --reload --port 8000
```

```powershell
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### 서비스별 실행 명령 요약

| 서비스            | 명령                                                                         | 기본 포트                  |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------- |
| frontend (dev)    | `cd frontend && npm run dev`                                                 | 5173                       |
| frontend (docker) | `docker compose up -d frontend`                                              | 3000                       |
| backend (docker)  | `docker compose up -d backend`                                               | 8000                       |
| backend (venv)    | `cd backend && ..\worker-venv\Scripts\uvicorn main:app --reload --port 8000` | 8000                       |
| postgres          | `docker compose up -d postgres`                                              | 15432 (컨테이너 내부 5432) |
| redis             | `docker compose up -d redis`                                                 | 6379                       |

### 검증

PR을 올리면 `.github/workflows/ci.yml`이 자동으로 돕니다. 프론트는 빌드·린트·포맷·테스트를, 백엔드는 파이썬 문법 검사와 도커 이미지 빌드를 확인합니다. 바뀐 쪽만 돌고, 통과하지 못하면 머지가 막힙니다.

러너 왕복은 2분쯤 걸리므로 올리기 전에 로컬에서 먼저 돌리는 편이 빠릅니다.

```powershell
cd frontend
npm run build; npm run lint; npm run format:check; npm run test
```

포맷이 어긋났다면 `npm run format`으로 고칩니다.

## 실제 서비스 운영 — 내보내기 워커 실행

현재 배포되어 있는 https://shuttlecut.kr 에서 실제로 내보내기를 처리할 수 있도록 하는 운영 작업입니다. NAS(프론트/백엔드/DB/Redis)는 이미 떠 있으므로 그대로 사용하고, GPU가 장착되어 있는 메인 PC에서는 **내보내기를 처리할 워커를** 띄웁니다.

> ⚠️ **워커는 NAS와 같은 네트워크(같은 공유기 아래)에 있는 PC에서만 돌릴 수 있습니다.** `DATABASE_URL`/`REDIS_URL`에 쓰이는 `192.168.0.2`는 사설 IP라 인터넷 전체에서 유일한 주소가 아니라서, 같은 로컬 네트워크 밖에서는 이 주소로 접속할 방법이 없습니다 (포트포워딩을 별도로 열지 않는 한). 즉 지금은 집 밖의 다른 PC나 클라우드에서는 이 방식으로 워커를 돌릴 수 없고, 워커를 옮기려면 같은 네트워크의 다른 GPU PC를 쓰거나 Tailscale 같은 VPN으로 그 PC를 가상으로 같은 네트워크에 넣어야 합니다.

1. `.env.native-worker` 파일을 직접 만듭니다 (gitignore 대상, `backend/.env.example` 참고해서 아래 키를 채움):

   ```
   DATABASE_URL=postgresql://<NAS_DB_USER>:<PW>@<NAS_IP>:15432/shuttlecut
   REDIS_URL=redis://:<PW>@<NAS_IP>:6379/0
   STORAGE_PATH=C:/tmp/shuttlecut
   NAS_BACKEND_URL=http://<NAS_IP>:8000
   WORKER_SECRET=<NAS와 공유하는 워커 인증 시크릿>
   ENABLE_GPU=1        # GPU 없으면 0
   ENABLE_OPENCL=1
   ENABLE_NVDEC=1
   ```

2. `worker-venv`가 없다면 위 "사전 준비물"의 venv 생성 커맨드를 먼저 실행합니다.
3. 워커 실행:

   ```powershell
   .\start-native-worker.ps1
   ```

이제 shuttlecut.kr에서 내보내기를 누르면 이 워커가 작업을 가져가 처리합니다.

## 배포

### 배포 대상은 셋입니다

| 대상       | 기계     | 방식                                 |
| ---------- | -------- | ------------------------------------ |
| 백엔드     | NAS      | `docker-compose build` + `up -d`     |
| 프론트엔드 | NAS      | `docker-compose build` + `up -d`     |
| 워커       | 워커 PC  | git 체크아웃 갱신 + celery 재시작    |

PostgreSQL과 Redis는 공식 이미지를 그대로 쓰기 때문에 배포 대상이 아닙니다. 우리 코드가 들어가지 않습니다.

**셋은 반드시 같은 커밋이어야 합니다.** 워커는 도커가 아니라 소스를 직접 실행하는데, `workers/tasks.py`가 `models.database`의 ORM 모델과 `core.exporter`를 그대로 import합니다. 백엔드만 올리고 워커를 두면 워커가 아직 없는 컬럼을 읽다가 죽습니다.

**순서는 백엔드 → 워커 → 프론트엔드입니다.** 요청을 받는 쪽이 보내는 쪽보다 먼저 올라가야 하기 때문입니다. DB 스키마 변경이 백엔드 startup의 `ALTER TABLE`로 적용되는 것도 백엔드가 맨 앞이어야 하는 이유입니다.

### NAS 배포 디렉터리는 git 체크아웃입니다

`/volume1/docker/shuttlecut-web/`가 이 저장소의 체크아웃입니다. 따라서 "지금 운영에 어떤 코드가 떠 있나"는 기억이 아니라 명령으로 답합니다.

```bash
git -C /volume1/docker/shuttlecut-web rev-parse HEAD
git -C /volume1/docker/shuttlecut-web describe --tags
git -C /volume1/docker/shuttlecut-web status --porcelain   # 비어 있어야 정상입니다
```

이 디렉터리에서 추적되지 않는 파일은 루트 `.env` 하나뿐입니다. 로그·덤프·테스트 데이터를 여기에 만들면 `git status`가 더러워져서 위 확인이 의미를 잃습니다. DB 덤프는 `/volume1/docker/shuttlecut-backups/`에 둡니다.

NAS의 `git`은 DSM 패키지 센터의 Synology 공식 **Git Server** 패키지에서 옵니다. 설치하면 `/usr/bin/git`이 `/var/packages/Git/target/bin/git`을 가리키는 심볼릭 링크로 생겨 PATH에서 바로 잡힙니다. 저장소가 public이라 클론에 인증 설정이 따로 필요 없습니다.

> ⚠️ **`git status`에 내용 차이 없는 변경이 잔뜩 뜬다면 파일 권한부터 의심합니다.**
> File Station이나 SMB로 복사한 디렉터리에는 Synology ACL이 상속 속성과 함께 붙는 경우가 있습니다. 그러면 그 아래 파일이 755로 만들어지는데 git blob은 644라, 내용이 같아도 전부 수정된 것으로 잡힙니다. `ls -l`에서 권한 끝의 `+`가 ACL이 붙어 있다는 표시입니다.
>
> 체크아웃 전환 때 `frontend/`에 실제로 이 상태였고 한 번 걷어냈습니다. 지금은 트리 전체에 ACL이 없고, 배포가 `git checkout`이라 다시 붙을 일도 없습니다. 아래는 그래도 증상이 재현될 때를 위한 기록입니다.
>
> ```bash
> git diff --stat                                    # 0 insertions, 0 deletions 면 모드 차이입니다
> chmod 755 <ACL이 붙은 디렉터리>                      # Synology에서 chmod는 ACL을 제거합니다
> git diff --summary | grep "mode change" | sed "s/.* //" | xargs chmod 644
> ```
>
> 디렉터리의 ACL부터 걷어내야 합니다. 파일 권한만 고치면 다음 배포에서 새로 생기는 파일이 다시 755가 됩니다.

### 배포 절차

아래 NAS 쪽 명령은 SSH로 접속해서 실행합니다. Synology에서는 `docker`·`docker-compose`가 PATH에 없고 도커 소켓 접근에 관리자 권한이 필요하므로, 실제로는 `sudo`와 함께 `/var/packages/ContainerManager/target/usr/bin/` 아래의 실행 파일을 직접 부릅니다. 아래에서는 읽기 편하도록 `docker`, `docker-compose`로 줄여 씁니다.

**1. 안전장치.** 재빌드하기 전에 합니다. 이미지가 전부 `latest` 단일 태그라, 재빌드하면 지금 돌고 있는 이미지가 이름 없는 dangling 상태로 밀려나고 `docker image prune` 한 번에 사라집니다. 되돌릴 대상에 미리 이름을 붙여둬야 합니다.

```bash
# DB 덤프 (redirect를 sudo bash -c 안쪽에 둬야 합니다)
sudo bash -c "docker exec shuttlecut-web-postgres-1 pg_dump -U shuttlecut -d shuttlecut \
  > /volume1/docker/shuttlecut-backups/db-$(date +%Y%m%d).sql"

# 지금 운영 이미지에 롤백 태그
docker tag shuttlecut-web-backend:latest  shuttlecut-web-backend:rollback-$(date +%Y%m%d)
docker tag shuttlecut-web-frontend:latest shuttlecut-web-frontend:rollback-$(date +%Y%m%d)
```

**2. 소스 갱신과 확인.** 무엇이 나가는지 먼저 보고 받습니다.

```bash
cd /volume1/docker/shuttlecut-web
git fetch origin main
git log --oneline HEAD..origin/main        # 이번에 나가는 커밋
git diff --stat HEAD..origin/main          # 바뀌는 파일
git checkout -f main && git reset --hard origin/main
docker-compose config --quiet              # .env에 빠진 키가 없는지 확인
```

마지막 줄이 중요합니다. `docker-compose.yml`이 `${VAR:?메시지}` 형태로 값을 요구하므로, 루트 `.env`에 키가 빠져 있으면 컨테이너를 만들기 전에 어느 키인지 알려주며 멈춥니다. `--quiet`를 붙이는 이유는 이 명령이 해석된 비밀값을 전부 화면에 찍기 때문입니다.

**3. 백엔드.** 빌드가 실패해도 기존 컨테이너는 계속 돌기 때문에 서비스 영향 없이 시도할 수 있습니다.

```bash
docker-compose build backend && docker-compose up -d backend
curl http://192.168.0.2:8000/api/health
docker logs shuttlecut-web-backend-1 --tail=50
```

**4. 워커.** 워커 PC에서 합니다. `--pool=solo`라 한 번에 한 작업만 처리하는데 그게 20분짜리 인코딩일 수 있으므로, 진행 중인 작업이 없는지 먼저 확인하고 정상 종료시킵니다.

```powershell
worker-venv\Scripts\celery.exe -A workers.tasks.celery inspect active
worker-venv\Scripts\celery.exe -A workers.tasks.celery control shutdown
git checkout <배포 커밋>
.\start-native-worker.ps1
```

`requirements.txt`가 바뀐 배포라면 재시작 전에 `worker-venv\Scripts\pip install -r backend\requirements.txt`를 돌려야 합니다. NAS는 도커 빌드가 알아서 해주지만 워커는 네이티브라 아무도 해주지 않습니다.

**5. 프론트엔드.**

```bash
docker-compose build frontend && docker-compose up -d frontend
```

**6. 태그.** 배포가 끝나면 그 커밋에 날짜 태그를 붙여 "언제 무엇이 운영에 올라갔는지"를 저장소에 남깁니다. release 브랜치나 GitHub Releases는 쓰지 않습니다. main 하나와 이 태그로 충분합니다.

```bash
git tag -a deploy-$(date +%Y%m%d) -m "배포 내용 한 줄"
git push origin deploy-$(date +%Y%m%d)
```

### 롤백

`docker-compose.yml`이 `image:`가 아니라 `build:`를 쓰기 때문에, **이미 돌고 있는 컨테이너는 소스 디렉터리를 전혀 참조하지 않습니다.** 소스는 이미 빌드된 이미지 안에 들어가 있습니다. 그래서 되돌릴 때 체크아웃을 옛 커밋으로 돌릴 필요가 없고, 태그를 붙여둔 이미지를 다시 `latest`로 가리키면 끝입니다. 재빌드가 없어 수십 초면 됩니다.

```bash
docker tag shuttlecut-web-backend:rollback-YYYYMMDD  shuttlecut-web-backend:latest
docker tag shuttlecut-web-frontend:rollback-YYYYMMDD shuttlecut-web-frontend:latest
docker-compose up -d --force-recreate backend frontend
```

DB는 되돌리지 않아도 보통 괜찮습니다. 스키마 변경이 `ADD COLUMN`뿐이라 구버전 코드가 새 컬럼을 무시하고 동작합니다. 데이터까지 되돌려야 하는 상황이면 안전장치에서 뜬 덤프를 씁니다.
