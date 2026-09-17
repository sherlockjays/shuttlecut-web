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
> 로그인·영상 업로드·랠리 구간 편집·점수판 오버레이 설정·미리보기는 NAS만으로 동작합니다 (24시간 구동).
> 하지만 **"내보내기"(최종 mp4 인코딩)는 NAS에 GPU/워커가 없어서 처리되지 않습니다** — 관리자 로컬 PC에서 네이티브 워커(`start-native-worker.ps1`)가 떠 있어야만 실제로 처리됩니다. 이 PC가 꺼져 있거나 워커 프로세스가 안 떠 있으면 내보내기 작업은 Redis 큐에 쌓인 채 계속 대기 상태로 남습니다. 현재는 워커 자동 시작 장치(서비스 등록 등)가 없어서 매번 수동으로 스크립트를 실행해야 합니다. (자세한 실행 방법은 아래 ["실제 서비스 운영 — 내보내기 워커 실행"](#실제-서비스-운영--내보내기-워커-실행) 참고)
>
> 배포 환경은 **local(개발자 PC) / prod(NAS)** 두 단계뿐이고 별도 dev·staging 서버는 없습니다. NAS 백엔드는 `CORS_ORIGINS`가 `https://shuttlecut.kr`만 허용해서 로컬 프론트는 직접 붙을 수 없고, 프론트 개발 시엔 로컬 백엔드를 띄워야 합니다 — 이 로컬 백엔드는 보통 NAS의 운영 DB/Redis에 그대로 연결해서 쓰므로, 로컬 개발 중 만든 데이터가 운영 DB에 그대로 들어갑니다.

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
  Dockerfile.local-worker     Docker GPU 워커 이미지 (WSL2용, 레거시)
  requirements.txt
  api/routes/                 auth, videos, projects, export, youtube, admin
  core/                       exporter.py, rally_manager.py 등
  workers/tasks.py            Celery 태스크 (run_export)
frontend/
  src/                        React SPA
docker-compose.yml             프론트/백/DB/Redis 전체 스택
docker-compose.local-worker.yml  Docker 기반 GPU 워커 (레거시)
start-native-worker.ps1        Windows 네이티브 GPU 워커 실행 스크립트 (현재 실사용)
```

## 로컬에서 개발하기

### 사전 준비물

- Docker Desktop
- Node.js (프론트 개발 시)
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
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

`docker-compose.yml`로 전체 스택을 띄우려면 루트에 `.env`도 필요합니다 (`${VAR}` 형태로 참조됨):

```
DATABASE_URL=postgresql://shuttlecut:password@postgres:5432/shuttlecut
REDIS_URL=redis://:yourpassword@redis:6379/0
SECRET_KEY=change-me
STORAGE_PATH=/data/videos
CORS_ORIGINS=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APP_BASE_URL=http://localhost:3000
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
POSTGRES_DB=shuttlecut
POSTGRES_USER=shuttlecut
POSTGRES_PASSWORD=change-me
REDIS_PASSWORD=change-me
```

`GOOGLE_CLIENT_ID`/`SECRET`, `SMTP_*`는 비워둬도 로컬 개발이 깨지지는 않습니다 (SMTP는 미설정 시 발송 없이 콘솔 로그만 남기고 넘어가고, Google 로그인은 버튼을 눌렀을 때 Google 쪽에서 에러 발생)
다만 **Google 로그인과 이메일 인증/재설정 메일 발송은 로컬에서 테스트할 수 없습니다.**
이 두 기능까지 로컬에서 테스트하려면:

- NAS와 동일한 `GOOGLE_CLIENT_ID`/`SECRET`, SMTP 값을 그대로 채우고
- Google Cloud Console의 OAuth 클라이언트에 `http://localhost:3000/api/auth/google/callback`(로컬 `APP_BASE_URL` 기준) 리다이렉트 URI를 추가로 등록해야 합니다 (안 하면 `redirect_uri_mismatch` 에러).

마이그레이션 도구(alembic)는 설치만 되어 있고 실제로는 안 씁니다 — 백엔드 시작 시 `init_db()`가 스키마를 자동으로 생성/보정하므로 별도 마이그레이션 커맨드는 필요 없습니다.

### A. 완전 로컬 (DB/Redis도 새로 띄우기)

전체 스택을 처음부터 로컬에 새로 띄워서 코드를 자유롭게 테스트할 때 사용합니다.

```powershell
docker compose up -d          # frontend, backend, postgres, redis
```

프론트는 핫리로드를 위해 개발 중엔 따로 띄우는 걸 권장합니다 (`frontend/.env`의 `VITE_API_URL=http://localhost:8000`):

```powershell
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### B. 로컬 백엔드/프론트 + NAS의 운영 DB/Redis 사용 (실제로 자주 쓰는 방식)

별도 dev DB가 없기 때문에, 지금 실제로 프론트/백엔드 개발할 때 주로 쓰는 방식입니다. Postgres/Redis는 새로 띄우지 않고 NAS에 이미 떠 있는 것을 그대로 사용합니다.

1. `backend/.env`에 NAS 주소로 `DATABASE_URL`/`REDIS_URL`을 지정하고, `CORS_ORIGINS=http://localhost:5173`으로 맞춥니다:

   ```
   DATABASE_URL=postgresql://<NAS_DB_USER>:<PW>@<NAS_IP>:15432/shuttlecut
   REDIS_URL=redis://:<PW>@<NAS_IP>:6379/0
   CORS_ORIGINS=http://localhost:5173
   ```

2. 백엔드 서버 실행:

   ```powershell
   cd backend
   ..\worker-venv\Scripts\uvicorn main:app --reload --port 8000
   ```

3. 프론트엔드 개발 서버 실행 (새 터미널):

   ```powershell
   cd frontend
   npm install
   npm run dev                   # http://localhost:5173, VITE_API_URL=http://localhost:8000
   ```

⚠️ 이 방식은 운영 DB를 그대로 활용하므로, 로컬에서 만든 프로젝트/유저 데이터가 실제 운영 DB에 그대로 들어갑니다.

### 서비스별 실행 명령 요약

| 서비스            | 명령                                                                         | 기본 포트                  |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------- |
| frontend (dev)    | `cd frontend && npm run dev`                                                 | 5173                       |
| frontend (docker) | `docker compose up -d frontend`                                              | 3000                       |
| backend (docker)  | `docker compose up -d backend`                                               | 8000                       |
| backend (venv)    | `cd backend && ..\worker-venv\Scripts\uvicorn main:app --reload --port 8000` | 8000                       |
| postgres          | `docker compose up -d postgres`                                              | 15432 (컨테이너 내부 5432) |
| redis             | `docker compose up -d redis`                                                 | 6379                       |

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

Docker 기반 워커(WSL2 GPU passthrough, 레거시)를 쓰려면:

```powershell
docker compose -f docker-compose.local-worker.yml up -d
```
