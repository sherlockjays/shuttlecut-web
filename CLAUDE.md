# CLAUDE.md

배드민턴 경기 영상에서 랠리만 잘라내 점수판 오버레이를 입히고 유튜브에 올리는 서비스(https://shuttlecut.kr).

- 코드 주석, UI 문구, 커밋 메시지는 모두 한국어로 쓴다
- 셸은 PowerShell이다
- 프론트엔드 경로 별칭은 `@/` → `frontend/src/`

## 명령어

```powershell
# 프론트엔드 (frontend/)
npm run dev                 # http://localhost:5173
npm run build               # tsc -b && vite build
npm run lint
npm run format              # prettier --write .
npm run test                # vitest run
npx vitest run src/pages/EditorPage/rally.test.ts    # 파일 하나만
npx vitest run -t "이미 저장된 값"                    # 케이스 이름으로

# 백엔드 (backend/). worker-venv는 백엔드/워커 공용이다
..\worker-venv\Scripts\uvicorn main:app --reload --port 8000

# 내보내기 워커 (리포지토리 루트, .env.native-worker 필요)
.\start-native-worker.ps1

# 전체 스택
docker compose up -d        # frontend:3000, backend:8000, postgres:15432, redis:6379
```

## 검증

PR과 main push에서 [ci.yml](.github/workflows/ci.yml)이 자동으로 돈다. `frontend`/`backend` 체크는 필수라 통과하지 못하면 머지가 막힌다.

- 프론트 job: `npm ci` → `npm run build` → `npm run lint` → `npm run format:check` → `npm run test`
- 백엔드 job: `python -m compileall backend` → `docker build ./backend`
- 바뀐 쪽만 돈다. 프론트만 고친 PR에서 백엔드 job은 스킵되고, 스킵은 통과로 보고된다

**CI에 맡기지 말고 로컬에서 먼저 돌린다.**

- 백엔드에는 테스트가 없다. CI는 문법 오류와 이미지 빌드 가능 여부까지만 본다. 동작 확인은 띄워서 한다
- vitest가 `environment: "node"`라 DOM이 없다. 테스트는 순수 로직 모듈에만 있고, 컴포넌트 테스트를 쓰려면 jsdom 설정부터 추가해야 한다
- 테스트 파일은 소스 옆에 둔다. `__tests__` 디렉터리를 만들지 않는다

## 코드 규칙

- 새 API 코드는 `apis/`(타입 있는 fetcher, 와이어 변환)와 `queries/`(queryOptions만)에 쓴다. `api.ts`는 레거시이고 옮겨가는 중이다
- 백엔드에는 `pyproject.toml`도 `ruff.toml`도 `pytest.ini`도 없다. ruff나 pytest가 깔려 있다고 가정하지 않는다

## 두 곳을 같이 고쳐야 하는 것

- **DB 컬럼 추가**: `models/database.py`의 Column과 [main.py](backend/main.py) startup의 `ALTER TABLE ... ADD COLUMN`. alembic은 설치만 되어 있고 안 쓴다. `init_db()`가 `create_all`을 돌리고 기존 테이블은 ALTER 문으로 때운다(실패하면 조용히 rollback)
- **점수판 색**: 에디터 미리보기는 [theme.ts](frontend/src/models/theme.ts)의 `CANVAS_THEMES`(hex), 실제 렌더링은 [exporter.py](backend/core/exporter.py)의 `THEMES`(RGB 튜플). 한쪽만 고치면 미리보기와 결과물이 갈라진다
- **의존성**: [requirements.txt](backend/requirements.txt)를 고치면 NAS 백엔드 재빌드와 워커 PC `worker-venv` 재설치를 **둘 다** 해야 한다. 아래 참고

### 의존성을 올릴 때

`requirements.txt`는 `==`로 고정되어 있다. 같은 커밋을 언제 빌드해도 같은 결과물이 나와야 배포 태그로 롤백할 수 있기 때문이다.

버전을 올릴 때는 한 기계에서만 올리면 안 된다. 워커는 백엔드와 같은 ORM 모델·같은 `core.exporter`를 쓰는데, NAS는 도커 빌드로 설치하고 워커는 `worker-venv`에 pip로 직접 설치해서 갱신 경로가 갈라져 있다.

```powershell
# 1. requirements.txt 수정 후, 워커를 멈추고 (진행 중 작업 없는지 먼저 확인)
worker-venv\Scripts\celery.exe -A workers.tasks.celery inspect active
worker-venv\Scripts\celery.exe -A workers.tasks.celery control shutdown

# 2. 워커 venv 재설치
worker-venv\Scripts\pip.exe install -r backend\requirements.txt

# 3. NAS 백엔드 재빌드 (배포 절차대로)
# 4. 양쪽 pip freeze를 대조해서 같은지 확인
```

전이 의존성(`starlette` 등)은 고정 대상이 아니라 여전히 뜰 수 있다. 완전한 lock이 필요해지면 별도 도구를 검토한다.

## 깨지기 쉬운 계약

### 랠리 와이어 포맷

- DB `projects.rallies`는 JSON 배열 `[[start, end, p1, p2, winner], ...]`이고 백엔드는 그대로 주고받는다
- 프론트는 API 경계([apis/projects.ts](frontend/src/apis/projects.ts))의 `rallyFromWire`/`rallyToWire`로만 변환한다. 컴포넌트와 훅은 객체 `Rally`만 다룬다
- `winner`의 0/1/2는 와이어 값이다. `RallyWinner` 상수와 어긋나면 안 된다
- 랠리에는 **득점 전** 점수를 남긴다. 내보내기가 이 값으로 점수판을 그리다가 랠리 끝에서 득점 후 점수로 바꾼다

### 자동저장

[debouncedSaver.ts](frontend/src/pages/EditorPage/debouncedSaver.ts)가 핵심이다. 아래 셋 중 하나라도 깨지면 편집 내용이 유실된다.

- `flush()`가 보낼 값은 **부르는 순간** 확정된다. 실행 시점에 읽으면 그 사이 끼어든 값이 나간다
- 저장은 한 번에 하나씩만 보낸다. 겹치면 늦게 도착한 옛 값이 서버를 되돌린다
- 저장에 성공하면 `["project", id]` 캐시를 갱신한다. `projectOptions`가 `staleTime: Infinity`라, 갱신하지 않으면 재진입 시 낡은 값으로 돌아가고 그 상태에서 편집하면 서버 데이터가 유실된다

### EditorPage 훅

- **draft는 `useProjectDraft`만 소유한다.** undo/redo 스택과 현재값이 한 state에 있어 어긋날 수 없다. 다른 훅은 draft를 갖지 않고 `update(patch)`로 바꿀 것만 넘긴다. 이전 값에서 파생되는 변경은 함수형 patch로 준다
- 한 번에 일어나야 하는 변경은 한 번의 `update`로 묶는다. 되돌릴 때도 함께 돌아와야 하기 때문이다(랠리 추가 + 점수 증가)
- 콜백은 `optionsRef`에 담아 렌더마다 갱신한다(`useAutoSave`, `useRallyEditor`). 이벤트 핸들러와 타이머에서만 불리므로 안전하고, 호출부가 `useCallback`으로 감쌀 필요가 없다

## 내보내기는 다른 기계에서 돈다

- NAS(Synology)에 프론트/백엔드/Postgres/Redis가 떠 있고, mp4 인코딩만 GPU가 달린 별도 Windows PC의 네이티브 Celery 워커가 처리한다
- 내보내기가 큐에서 안 빠지면 코드를 의심하기 전에 워커 PC가 켜져 있는지부터 확인한다. 꺼져 있으면 작업은 Redis 큐에 쌓인 채 대기한다
- **워커와 NAS는 파일시스템을 공유하지 않는다.** 워커는 원본을 `GET /api/internal/video`로 받고 결과물을 `POST /api/internal/export/{id}`로 올린다
- 이 두 엔드포인트는 JWT가 아니라 `X-Worker-Secret`으로 인증하고, 경로가 `STORAGE_PATH` 아래인지 검사한다([internal.py](backend/api/routes/internal.py))
- 진행률은 워커가 Redis 채널 `export_progress:{export_id}`에 publish하고 백엔드가 `/api/export/ws/{export_id}`로 중계한다. WS 핸들러가 연결 시점에 DB status를 먼저 확인하는 이유는, 연결 전에 끝난 작업의 pub/sub 메시지를 놓치기 때문이다
- 내보내기 동작을 고칠 땐 `workers/tasks.py`를 고친다. `core/exporter.py`에도 ffmpeg 처리가 따로 있지만 실제 내보내기는 그쪽을 타지 않는다

## 배포

사람이 읽을 절차는 [README](README.md)의 "배포" 절에 있다. 여기엔 어기면 안 되는 것만 적는다.

- **운영에 뭐가 떠 있는지 추측하지 않는다.** NAS 배포 디렉터리 `/volume1/docker/shuttlecut-web/`는 이 저장소의 git 체크아웃이다. `git -C /volume1/docker/shuttlecut-web rev-parse HEAD`로 답이 나온다
- **배포 대상은 셋이고(NAS 백엔드, NAS 프론트엔드, 워커 PC) 셋이 같은 커밋이어야 한다.** 워커가 `backend/` 패키지를 직접 import하기 때문이다. 순서는 **백엔드 → 워커 → 프론트엔드**
- **체크아웃 디렉터리에 추적되지 않는 파일을 만들지 않는다.** 루트 `.env` 하나만 예외다. `git status`가 비어 있는 것이 배포 상태의 유일한 확인 수단이라, 덤프나 로그를 여기 두면 그 수단이 죽는다. DB 덤프는 `/volume1/docker/shuttlecut-backups/`
- **재빌드 전에 현재 이미지에 `rollback-YYYYMMDD` 태그를 붙인다.** 이미지가 전부 `latest` 단일 태그라 재빌드하면 옛 이미지가 dangling으로 밀린다
- **롤백은 소스가 아니라 이미지를 되돌리는 것이다.** compose가 `build:`를 쓰므로 돌고 있는 컨테이너는 소스 디렉터리를 참조하지 않는다. 체크아웃을 옛 커밋으로 돌려봐야 아무 일도 안 일어난다
- 배포한 커밋에 `deploy-YYYYMMDD` annotated 태그를 찍고 push한다. 운영에 올라간 적 없는 커밋에는 찍지 않는다. release 브랜치와 GitHub Releases는 쓰지 않는다

## 개발 환경 함정

- **별도 dev DB가 없다.** `backend/.env`의 `DATABASE_URL`/`REDIS_URL`을 NAS로 두고 로컬 백엔드를 띄우는 방식을 자주 쓰는데, 이러면 로컬에서 만든 데이터가 운영 DB에 그대로 들어간다. 스키마를 바꾸거나 데이터를 지우기 전에 지금 어느 DB를 보고 있는지 확인한다
- `backend/fonts/NanumGothicBold.ttf`는 gitignore 대상이라 직접 넣어야 한다. 이게 필요한 건 **워커 PC**다. NAS 백엔드 이미지는 Dockerfile이 apt로 `fonts-nanum`을 깔아 [exporter.py](backend/core/exporter.py)의 폰트 후보 2순위가 잡히지만, 윈도우에는 그 경로가 없어 3순위인 이 파일로 떨어진다. 없으면 기본 폰트로 대체되어 오버레이 한글이 깨진다

## 알려진 문제

- JWT는 `localStorage`에 두고 `Authorization` 헤더로 보낸다. 다만 `<video src>`와 다운로드 링크는 헤더를 못 실어서 토큰이 쿼리스트링으로 간다(`videoStreamUrl`, `exports.downloadUrl`, `youtube.authUrl`). 이슈 #36에서 다룬다
- `autoedit`은 백엔드 라우터가 모델 부재로 main.py에서 주석 처리되어 있는데 `api.ts`에는 클라이언트 스텁이 남아 있다. 아직 동작하지 않는다

## 작업 흐름

- 이슈 → 브랜치 → PR. 브랜치 이름은 `refactor/issue-NN`, `fix/issue-NN`
- `.github/`의 이슈/PR 템플릿을 쓴다
- 커밋: `type: 한글 내용`. 본문은 복잡한 수정이거나 배경 설명이 필요할 때만 적는다
- 커밋은 하나 만들 때마다 멈추고 확인을 받은 뒤 다음으로 넘어간다
- PR: `type(scope): 한글 내용`. scope는 fix/refactor/feat처럼 어디를 고쳤는지가 의미 있을 때만 붙이고, style/docs 같은 작업에는 생략한다
- 코드를 고치다 이 문서의 내용이 사실과 달라지면 같은 PR에서 함께 고친다
