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

CI가 없다. 검증은 전부 로컬에서 직접 돌린다.

- 프론트엔드를 고쳤으면 PR 전에 `npm run build`, `npm run lint`, `npm run test`
- `npm run build`는 `tsc -b`를 포함한다. 타입 에러가 빌드를 막는다
- 백엔드에는 테스트가 없다. 띄워서 확인한다
- vitest가 `environment: "node"`라 DOM이 없다. 테스트는 순수 로직 모듈에만 있고, 컴포넌트 테스트를 쓰려면 jsdom 설정부터 추가해야 한다
- 테스트 파일은 소스 옆에 둔다. `__tests__` 디렉터리를 만들지 않는다

## 코드 규칙

- `tsconfig.app.json`에 `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax`/`erasableSyntaxOnly`가 켜져 있다. 안 쓰는 변수 하나, `import type`을 빼먹은 타입 전용 import 하나가 빌드를 막는다
- 새 API 코드는 `apis/`(타입 있는 fetcher, 와이어 변환)와 `queries/`(queryOptions만)에 쓴다. `api.ts`는 레거시이고 옮겨가는 중이다
- 백엔드에는 `pyproject.toml`도 `ruff.toml`도 `pytest.ini`도 없다. ruff나 pytest가 깔려 있다고 가정하지 않는다

## 두 곳을 같이 고쳐야 하는 것

- **DB 컬럼 추가**: `models/database.py`의 Column과 [main.py](backend/main.py) startup의 `ALTER TABLE ... ADD COLUMN`. alembic은 설치만 되어 있고 안 쓴다. `init_db()`가 `create_all`을 돌리고 기존 테이블은 ALTER 문으로 때운다(실패하면 조용히 rollback)
- **점수판 색**: 에디터 미리보기는 [theme.ts](frontend/src/models/theme.ts)의 `CANVAS_THEMES`(hex), 실제 렌더링은 [exporter.py](backend/core/exporter.py)의 `THEMES`(RGB 튜플). 한쪽만 고치면 미리보기와 결과물이 갈라진다

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

## 개발 환경 함정

- **별도 dev DB가 없다.** `backend/.env`의 `DATABASE_URL`/`REDIS_URL`을 NAS로 두고 로컬 백엔드를 띄우는 방식을 자주 쓰는데, 이러면 로컬에서 만든 데이터가 운영 DB에 그대로 들어간다. 스키마를 바꾸거나 데이터를 지우기 전에 지금 어느 DB를 보고 있는지 확인한다
- 프론트를 로컬에서 띄울 때 NAS 백엔드에는 못 붙는다(`CORS_ORIGINS`가 `https://shuttlecut.kr`만 허용). 로컬 백엔드를 같이 띄우고 `CORS_ORIGINS=http://localhost:5173`으로 맞춘다
- `backend/fonts/NanumGothicBold.ttf`는 gitignore 대상이라 직접 넣어야 한다. 없으면 오버레이 한글이 깨진다

## 알려진 문제

- JWT는 `localStorage`에 두고 `Authorization` 헤더로 보낸다. 다만 `<video src>`와 다운로드 링크는 헤더를 못 실어서 토큰이 쿼리스트링으로 간다(`videoStreamUrl`, `exports.downloadUrl`, `youtube.authUrl`). 이슈 #36에서 다룬다
- `autoedit`은 백엔드 라우터가 모델 부재로 main.py에서 주석 처리되어 있는데 `api.ts`에는 클라이언트 스텁이 남아 있다. 아직 동작하지 않는다

## 작업 흐름

- 이슈 → 브랜치 → PR. 브랜치 이름은 `refactor/issue-NN`, `fix/issue-NN`
- `.github/`의 이슈/PR 템플릿을 쓴다
- 커밋: `type: 한글 내용`. 본문은 복잡한 수정이거나 배경 설명이 필요할 때만 적는다
- PR: `type(scope): 한글 내용`. scope는 fix/refactor/feat처럼 어디를 고쳤는지가 의미 있을 때만 붙이고, style/docs 같은 작업에는 생략한다
- 코드를 고치다 이 문서의 내용이 사실과 달라지면 같은 PR에서 함께 고친다
