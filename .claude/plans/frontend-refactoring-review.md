# ShuttleCut Frontend 코드 퀄리티 리뷰 플랜

## Context

사용자 요청: 현재 프론트엔드 코드의 폴더 구조, 라우터, 기술 스택, 코드 퀄리티 4가지 항목을 기준으로 검토하고 개선 권고사항 작성.  
범위: 분석 보고서만 (코드 수정 없음). TanStack Query는 추가 가능한 패키지로 인정.

---

## 현재 스택 요약

| 항목 | 현재 |
|------|------|
| React | 19.2 |
| React Router DOM | 7.13.1 (library mode) |
| TypeScript | 5.9 strict |
| Vite | 7.3 |
| Tailwind CSS | 3.4 |
| 상태 관리 | 없음 (useState only) |
| 데이터 페칭 | 없음 (manual fetch) |
| 폼 관리 | 없음 (controlled inputs) |
| Custom Hooks | 0개 |
| 공유 타입/상수 | 없음 (각 파일에 중복 정의) |

---

## Q1. 폴더 구조 권고

### 현재 문제
- 12개 페이지가 `pages/` 아래 완전 평탄(flat) 구조
- `ExportItem` 타입이 `MyPage.tsx`와 `ExportHistoryPage.tsx`에 각각 다르게 정의됨
- `STATUS_LABEL/STATUS_CLASS`가 3개 파일에 중복 (AdminPage에서 "대기" vs 나머지 "대기 중" 불일치)
- `autoedit` API는 12개 endpoint가 api.ts에 있으나 페이지 없음 → 곧 파일 폭증 예정

### 권고 구조 (한 단계 feature grouping)

```
frontend/src/
├── api.ts                         (유지)
├── App.tsx                        (routing only)
├── main.tsx
│
├── types/                         ★ NEW
│   ├── export.ts                  (ExportItem, ExportStatus)
│   ├── user.ts                    (UserInfo, AdminUser, Plan)
│   └── project.ts                 (ProjectData, Rally)
│
├── constants/                     ★ NEW
│   └── export.ts                  (STATUS_LABEL, STATUS_CLASS — 단일 소스)
│
├── hooks/                         ★ NEW
│   ├── useYoutubeStatus.ts        (3곳 중복 fetch 교체)
│   └── useYoutubeUploadPoll.ts    (3곳 중복 setInterval 교체)
│
├── contexts/                      ★ NEW
│   └── YoutubeStatusContext.tsx   (전역 YouTube 연결 상태)
│
├── components/
│   ├── AppLayout.tsx              (유지, Context 소비로 변경)
│   ├── StatusBadge.tsx            ★ NEW (export 상태 배지)
│   └── ExportCard.tsx             ★ NEW (MyPage/ExportHistory 공통 카드)
│
└── pages/
    ├── auth/
    │   ├── LoginPage.tsx
    │   ├── ForgotPasswordPage.tsx
    │   └── ResetPasswordPage.tsx
    ├── editor/                    ★ EditorPage 분할
    │   ├── EditorPage.tsx         (orchestrator, ~200줄 목표)
    │   ├── VideoPlayer.tsx        (video + canvas overlay)
    │   ├── ScorePanel.tsx         (scoreboard + undo/redo)
    │   ├── RallyPanel.tsx         (marking + rally list)
    │   └── ExportPanel.tsx        (export progress + YouTube UI)
    ├── mypage/
    │   ├── MyPage.tsx
    │   ├── ExportsTab.tsx
    │   ├── UsageTab.tsx
    │   └── SettingsTab.tsx
    ├── admin/
    │   └── AdminPage.tsx
    ├── autoedit/                  ★ NEW (곧 올 기능 준비)
    └── (단순 페이지 flat 유지)
        ├── DashboardPage.tsx
        ├── PricingPage.tsx
        ├── GuidePage.tsx
        ├── TermsPage.tsx
        └── PrivacyPage.tsx
```

**즉시 삭제 권고:** `ExportHistoryPage.tsx` — App.tsx에 라우트 없음, MyPage ExportsTab이 동일 기능 수행. 사실상 dead code.

**Path alias 추가:** `@/` → `src/`  
- `vite.config.ts`: `resolve: { alias: { "@": path.resolve(__dirname, "src") } }`  
- `tsconfig.app.json`: `"paths": { "@/*": ["./src/*"] }`

---

## Q2. 라우터 권고

### 후보 비교

| | React Router v7 (현재) | TanStack Router v1 |
|--|--|--|
| 타입 안전 | 부분적 | 완전 (route params, search params) |
| 번들 크기 | ~50kB gzip | 비슷 |
| 마이그레이션 비용 | - | App.tsx + 모든 route component 재작성 |
| 로더/액션 | 지원 (미사용) | 지원 |
| 성숙도 | 매우 높음 | 높음 (v1 안정) |

### 결론: **React Router v7 유지**

현재 v7.13.1은 최신 버전이고 library mode로 충분. 스위칭 ROI 없음.

**단, App.tsx 사용 방식 개선 필요:**
- `RootHandler` 내부의 `fetch('/api/auth/google/exchange...')` → `api.ts`로 이동 (`auth.exchangeGoogleCode(code)`)
- `EditorRoute`의 `localStorage.getItem("token")` 중복 체크 제거 → `ProtectedLayout`으로 통합
- `createBrowserRouter` 전환은 선택 사항 (loaders 필요 시 전환)

**TanStack Router 재검토 시점:** autoedit 다단계 위저드(업로드→코트설정→분석→검토→내보내기)에서 search params 타입 안전이 필요해질 때.

---

## Q3. 기술 스택 권고

### 상태 관리: Context 추가, Zustand/Jotai SKIP

YouTube 연결 상태가 3곳에서 독립적으로 fetch됨:
- `AppLayout.tsx:23`
- `EditorPage.tsx:81`  
- `MyPage.tsx ExportsTab:58-60`

→ SettingsTab에서 연결해도 AppLayout 아이콘 즉시 반영 안 됨.

**해결:** `YoutubeStatusContext` (신규 파일 1개, 의존성 0개)

```ts
// contexts/YoutubeStatusContext.tsx
const YoutubeStatusContext = createContext<{
  connected: boolean
  refresh: () => Promise<void>
}>({ connected: false, refresh: async () => {} })
```

Zustand, Jotai: 파생 상태 없음, 엔티티 정규화 없음 → 이 규모에서 over-engineering.

### 데이터 페칭: **TanStack Query v5 추가 권고**

아래 패턴이 6개 페이지에서 반복 중:
```ts
const [list, setList] = useState([])
const [loading, setLoading] = useState(true)
useEffect(() => {
  someApi.list().then(setList).finally(() => setLoading(false))
}, [])
```

TanStack Query로 교체 시:
```ts
const { data: list = [], isLoading } = useQuery({
  queryKey: ["exports"],
  queryFn: () => exportsApi.list()
})
```

추가 이득:
- stale-while-revalidate 캐싱 (탭 전환 시 빠른 응답)
- window focus 시 자동 백그라운드 refetch
- YouTube 업로드 폴링의 `setInterval` 메모리 누수 → `refetchInterval` 옵션으로 교체, 언마운트 시 자동 중단
- `invalidateQueries` 로 삭제 후 목록 자동 갱신

번들 비용: ~13kB gzipped. 메모리 누수 수정 + 6개 보일러플레이트 제거로 충분히 정당화.

### 폼 관리: React Hook Form SKIP

LoginPage(2필드), ForgotPasswordPage(1필드), ResetPasswordPage(2필드) — 현재 패턴으로 충분.  
재검토 시점: autoedit 프로젝트 생성 폼이 복잡해질 때.

---

## 추가 질문 A: pages/ 내부에 UI 코드 vs components/ 분리

### 두 가지 패턴 비교

**패턴 1 — Pages에 UI 코드 포함 (co-location 원칙)**
```
pages/editor/
├── EditorPage.tsx     (최상위, 상태 및 조율)
├── VideoPlayer.tsx    (editor 전용 서브컴포넌트)
├── ScorePanel.tsx
└── ExportPanel.tsx

components/
├── AppLayout.tsx      (여러 페이지에서 공유)
├── StatusBadge.tsx    (여러 페이지에서 공유)
└── ExportCard.tsx     (MyPage + 향후 admin에서 공유)
```

**패턴 2 — Pages는 라우팅만, 모든 UI는 components/**
```
pages/
└── EditorPage.tsx     (컴포넌트 조합 + 라우팅만)

components/
├── editor/
│   ├── VideoPlayer.tsx
│   └── ScorePanel.tsx
├── mypage/
│   └── ExportsTab.tsx
└── shared/
    └── StatusBadge.tsx
```

### 현업 트렌드 (2025-2026)

- **Next.js App Router** 에코시스템: `app/`(라우팅) + `components/`(공유) 분리 구조가 많이 쓰이지만, 이는 서버/클라이언트 컴포넌트 경계 때문이지 코드 정리 목적이 아님
- **일반 React SPA (이 프로젝트 해당)**: Co-location이 표준. "해당 페이지에서만 쓰이는 컴포넌트는 페이지 근처에 두어라"가 널리 인정된 원칙
- React 공식 문서도 co-location 권장, Bulletproof React(인기 아키텍처 가이드)도 feature 폴더 내부에 components 포함

### 결론: **패턴 1 (co-location) 권고**

**핵심 판단 기준:**
- `VideoPlayer`, `ScorePanel`, `RallyPanel`, `ExportPanel` → EditorPage에서만 사용 → `pages/editor/` 아래 위치
- `StatusBadge`, `ExportCard`, `AppLayout` → 여러 페이지에서 공유 → `components/` 아래 위치

패턴 2의 문제: `components/`가 "모든 것의 쓰레기통"이 됨. EditorPage 전용 컴포넌트가 `components/editor/`에 있으면, 삭제·수정 시 "이게 다른 데서도 쓰이나?" 매번 검색 필요. Co-location은 "이 파일 옆에 있으면 이 기능 전용"이라는 명확한 신호.

**규칙 정리:**
> "이 컴포넌트가 두 페이지 이상에서 쓰이면 `components/`로, 아니면 해당 페이지 폴더 안에"

---

## 추가 질문 B: React Context vs localStorage — YouTube 연결 상태

### localStorage 사용 가능성 검토

```
localStorage.setItem("yt_connected", "true")
```

**장점:**
- 페이지 리로드 후에도 유지 (새로고침 시 flicker 없음)
- 구현 단순 (Context 설정 불필요)

**치명적 단점:**
- **서버 상태와 동기화 문제**: YouTube 토큰은 서버에서 관리됨. 사용자가 SettingsTab에서 연결 해제해도, localStorage의 `yt_connected=true`는 그대로 남아 AppLayout이 "▶ YouTube 연결됨"을 계속 표시
- **만료 감지 불가**: YouTube OAuth 토큰이 서버에서 만료·취소되어도 localStorage는 stale 값 유지
- **진실의 원천(source of truth)이 분산**: 실제 연결 상태는 서버 DB에, UI 상태는 localStorage에 → 불일치 버그의 근원

**결론: localStorage는 적합하지 않음.** YouTube 연결 여부는 클라이언트-로컬 UI 상태가 아닌 **서버 상태**이기 때문.

### React Context를 선택하는 이유

**Zustand/Jotai 대비 Context가 나은 이유 (이 특정 케이스):**

| | Context | Zustand | Jotai |
|--|--|--|--|
| 추가 의존성 | 0 | 필요 | 필요 |
| 번들 크기 추가 | 0 | ~3kB | ~3kB |
| 적합한 데이터 | 앱 전역 공유 UI 상태 | 복잡한 클라이언트 상태 | 원자적 상태 분해 |
| YouTube 연결 상태 적합성 | ✅ | 과도함 | 과도함 |

YouTube 연결 상태 하나를 위해 Zustand를 추가하는 것은 배보다 배꼽이 큼. Context는 React 내장이고 이 정도 단순 공유 상태에 정확히 맞는 도구.

### 단, TanStack Query 도입 시 Context도 불필요

TanStack Query가 있다면:
```ts
// 어느 컴포넌트에서나 호출 → TanStack Query가 캐시 공유
const { data } = useQuery({
  queryKey: ["youtube-status"],
  queryFn: () => youtube.status(),
  staleTime: 60_000  // 1분간 캐시 유지
})
```

동일한 `queryKey`를 쓰는 모든 컴포넌트가 하나의 캐시를 공유하므로 API 중복 호출 없음. SettingsTab에서 연결 해제 후 `invalidateQueries(["youtube-status"])` 호출 시 AppLayout 포함 모든 컴포넌트가 자동 갱신.

**요약:**
- TanStack Query 없이: `YoutubeStatusContext` 추가
- TanStack Query 있으면: Context 불필요, Query 캐시가 전역 상태 역할

---

## 추가 질문 C: TanStack Query 도입 장단점

### 장점

**① 보일러플레이트 완전 제거 (6개 페이지 적용)**
```ts
// 이전: 모든 페이지에서 반복
const [list, setList] = useState([])
const [loading, setLoading] = useState(true)
useEffect(() => {
  exportsApi.list().then(setList).finally(() => setLoading(false))
}, [])

// 이후: 한 줄
const { data: list = [], isLoading } = useQuery({ queryKey: ["exports"], queryFn: exportsApi.list })
```

**② 메모리 누수 수정 (현재 버그 fix)**
```ts
// 이전: clearInterval 없는 YouTube 폴링 → 언마운트 후에도 계속 실행
const poll = setInterval(() => exportsApi.status(id), 3000)  // 🐛 누수

// 이후: 언마운트 시 자동 중단
useQuery({
  queryKey: ["export-status", id],
  queryFn: () => exportsApi.status(id),
  refetchInterval: 3000,
  enabled: isUploading  // false가 되면 자동 중단
})
```

**③ 자동 캐시 공유**
`MyPage ExportsTab`과 `ExportHistoryPage`가 동일 `queryKey: ["exports"]` → 하나의 캐시 공유, API 중복 호출 없음. YouTube 상태도 동일.

**④ 자동 동기화**
- 브라우저 탭 복귀 시 stale 데이터 자동 백그라운드 refetch
- 삭제 후 `invalidateQueries(["exports"])` 한 줄로 전체 목록 갱신 (현재 `setList(prev => prev.filter(...))` 수동 처리 대체)

**⑤ 낙관적 업데이트 (선택 사항)**
삭제 버튼 클릭 → 즉시 UI에서 제거 → 백그라운드에서 API 호출 → 실패 시 롤백

### 단점

**① 학습 곡선**
queryKey 설계, staleTime vs gcTime 차이, mutation vs query 구분, invalidation 전략 — 새로운 멘탈 모델이 필요. 팀원이 처음 접하면 1-2일 학습 시간 필요.

**② staleTime 기본값이 0**
기본 설정에서 컴포넌트가 마운트될 때마다 refetch 발생. 의도하지 않은 API 과호출 가능. → `staleTime: 30_000` 등 명시적 설정 필요.

**③ 번들 크기 +13kB (gzipped)**
현재 의존성이 React + React Router 뿐이어서 체감 증가율이 있음. 그러나 기능 대비 합리적.

**④ 정적 페이지에는 불필요**
TermsPage, PrivacyPage, PricingPage, GuidePage는 API 호출 없음 → 도입 이점 없음. 이 페이지들에서는 그냥 `useState`가 낫거나 정적 데이터 그대로 사용.

**⑤ 서버 상태 vs 클라이언트 상태 혼동 위험**
EditorPage의 `marking`, `markStart`, `player1_score` 같은 클라이언트-로컬 상태는 TanStack Query가 관리하면 안 됨. 서버 상태(API 응답)와 클라이언트 상태(UI 인터랙션)를 명확히 구분해야 함.

### 이 프로젝트에서의 최종 평가

| 판단 기준 | 평가 |
|---|---|
| 기존 버그 해결 | ✅ setInterval 메모리 누수 완전 제거 |
| 코드 축소량 | ✅ 6개 페이지 × 5줄 보일러플레이트 = ~30줄 제거 |
| 번들 비용 | 🟡 +13kB (감수할 만함) |
| 팀 학습 비용 | 🟡 혼자 개발 시 1-2일 |
| 도입 타이밍 | ✅ 지금이 적기 (autoedit 기능 추가 전에 기반 마련) |

**권고: 도입.** 특히 메모리 누수 수정과 YouTube 폴링 개선 단독으로도 도입 가치 있음.

---

## Q4. 코드 퀄리티 세부 검토

### 잘 된 점 (유지)

- `api.ts` 네임스페이스 구조 (`auth`, `projects`, `videos`, `exports`, `youtube`, `autoedit`) — 깔끔
- 단순 페이지들 (DashboardPage 73줄, GuidePage 56줄) — 적정 사이즈
- TypeScript strict mode + `noUnusedLocals`, `erasableSyntaxOnly` — 좋은 제약
- Tailwind 다이나믹 값 처리 (캔버스 테마 색상만 인라인 스타일, 나머지 Tailwind 클래스) — 올바른 사용
- React 19, Vite 7 등 최신 스택 선택

---

### P1 — 즉시 수정 필요 (버그/누수)

**① setInterval 메모리 누수**  
`MyPage.tsx:73-95`, `ExportHistoryPage.tsx:49-63`  
YouTube 업로드 폴링이 컴포넌트 언마운트 시 clearInterval 없이 계속 실행됨.  
→ TanStack Query `refetchInterval` 옵션으로 교체 (언마운트 시 자동 중단)  
→ 또는 최소 수정: `useEffect` cleanup에서 `clearInterval(poll)` 등록

**② STATUS_LABEL/STATUS_CLASS 중복 및 불일치**  
`MyPage.tsx:21-33` → `pending: "대기 중"`  
`AdminPage.tsx:53-58` → `pending: "대기"` (불일치!)  
`ExportHistoryPage.tsx:14-26` — 3번째 복사본  
→ `src/constants/export.ts` 단일 파일로 통합, 한국어 라벨 통일

**③ ExportItem 타입 발산**  
`MyPage.tsx:6-13` — `project_id` 없음  
`ExportHistoryPage.tsx:4-12` — `project_id` 있음  
→ `src/types/export.ts`로 통합, 완전한 타입 정의

---

### P2 — 구조 개선 (아키텍처)

**④ YouTube status 3중 독립 fetch**  
`AppLayout.tsx:23`, `EditorPage.tsx:81`, `MyPage.tsx ExportsTab:58-60`  
→ `YoutubeStatusContext` + `useYoutubeStatus()` 훅으로 통합

**⑤ EditorPage.tsx 586줄 — 모노리틱**  
15개 이상 useState, 4개 useEffect, 80줄 canvas drawing 코드가 한 파일에.  
독립적인 관심사:
- canvas 드로잉 useEffect ↔ export 로직 사이 결합 없음
- YouTube 업로드 setInterval ↔ 키보드 단축키 사이 결합 없음
→ `pages/editor/` 디렉토리로 분할 (VideoPlayer, ScorePanel, RallyPanel, ExportPanel)

**⑥ API 응답 타입 없음**  
`api.ts`의 모든 함수가 `Promise<any>` 반환  
`EditorPage.tsx:71`의 `(p: any)`, `AdminPage.tsx:78`의 `e: any` 등  
→ `apiFetch<T>` 제네릭 추가, 각 namespace 함수에 반환 타입 선언

**⑦ 키보드 핸들러 stale closure (EditorPage.tsx:238-252)**  
`addScore`, `toggleMark`가 메모이제이션 없이 useEffect deps에 포함 → 매 렌더마다 리스너 재등록  
→ `useCallback` 으로 래핑 또는 ref를 통한 안정적 클로저 패턴

---

### P3 — 마이너 정리 (낮은 우선순위)

**⑧ App.tsx 인증 가드 중복**  
`EditorRoute:113` — `localStorage.getItem("token")` 독자적 체크  
`ProtectedLayout:96` — 동일 체크 (중복)  
→ `ProtectedLayout` / `AuthGuard`로 통합, EditorRoute 래핑

**⑨ RootHandler 인라인 API 호출**  
`App.tsx:29-35` — `fetch('/api/auth/google/exchange...')` 직접 호출  
→ `api.ts`의 `auth.exchangeGoogleCode(code)` 함수로 이동

**⑩ `window.confirm()` 남용**  
DashboardPage, MyPage, ExportHistoryPage, AdminPage 4곳에서 사용  
→ 향후 `ConfirmDialog` 컴포넌트로 교체 (현재는 낮은 우선순위)

**⑪ `(data as any)[key]` (EditorPage.tsx:421)**  
경기 정보 필드 map에서 타입 안전성 포기  
→ 명시적 필드 컴포넌트 또는 타입 discriminated union으로 교체

---

## 우선순위 요약

| 우선순위 | 항목 | 영향 파일 |
|---|---|---|
| P1 🔴 | setInterval 메모리 누수 fix | MyPage.tsx, ExportHistoryPage.tsx |
| P1 🔴 | STATUS_LABEL/CLASS 통합 + 불일치 수정 | → 신규 constants/export.ts |
| P1 🔴 | ExportItem 타입 통합 | → 신규 types/export.ts |
| P2 🟡 | YoutubeStatusContext 추가 | AppLayout, EditorPage, MyPage |
| P2 🟡 | TanStack Query v5 도입 | 6개 페이지 + MyPage polling |
| P2 🟡 | Path alias `@/` 추가 | vite.config.ts, tsconfig.app.json |
| P2 🟡 | api.ts 반환 타입 선언 | api.ts + types/ |
| P2 🟡 | EditorPage 분할 | pages/editor/ 신규 디렉토리 |
| P3 🔵 | RootHandler OAuth fetch → api.ts | App.tsx, api.ts |
| P3 🔵 | EditorRoute 인증 가드 중복 제거 | App.tsx |
| 🗑️ 삭제 | ExportHistoryPage.tsx (dead code) | ExportHistoryPage.tsx |
| 보류 | 폴더 구조 feature-based 마이그레이션 | pages/ 전체 |
| 보류 | TanStack Router | autoedit 다단계 위저드 시점에 재검토 |

---

## 추가 검토: ExportHistoryPage.tsx 처리 방향

파일을 직접 재확인함. App.tsx에 라우트 없음 확인. MyPage ExportsTab과 기능은 동일하나 차이점 있음:
- ExportHistoryPage: 자체 헤더 + 뒤로가기 버튼, `ytPostComment` 체크박스 없음
- MyPage ExportsTab: AppLayout 네비 사용, `ytPostComment` 체크박스 있음

사용자 지시에 따라 삭제하지 않고 유지. 향후 autoedit 결과물 히스토리 페이지로 재활용 가능성도 있음.

---

## 리팩토링 순서 (단계별 권고)

각 페이즈는 독립적으로 완료 가능하며, 마무리 후 항상 동작하는 상태를 유지함.

### Phase 1 — 기반 정리 (행동 변화 없음, 매우 안전) ✦ 시작점

**목표:** 타입 안전성 확보 + 공유 인프라 구축. 기능 변경 없음.

1. **Path alias 추가** (`vite.config.ts`, `tsconfig.app.json`)
   - `@/` → `src/`
   - 이후 모든 import가 `@/types/...`, `@/constants/...` 형태로 작성됨

2. **공유 타입 파일 생성** (신규 파일 3개)
   - `src/types/export.ts`: `ExportStatus`, `ExportItem` (project_id 포함 완전 버전)
   - `src/types/user.ts`: `UserInfo`, `AdminUser`, `Plan`
   - `src/types/project.ts`: `ProjectData`, `Rally`, `THEMES`, `SIZES`

3. **공유 상수 파일 생성** (신규 파일 1개)
   - `src/constants/export.ts`: `STATUS_LABEL` (통일: "대기 중"), `STATUS_CLASS`

4. **api.ts 반환 타입 추가** (api.ts 수정)
   - `apiFetch<T = unknown>` 제네릭 추가
   - 각 namespace 함수에 반환 타입 선언

5. **import 업데이트** (MyPage, AdminPage, ExportHistoryPage)
   - 로컬 타입/상수 정의 제거 → 공유 파일에서 import

**체크리스트:**
- [ ] `npm run build` 통과
- [ ] AdminPage에서 "대기 중"으로 통일됐는지 확인

---

### Phase 2 — 버그 수정 (타겟 수정, 중간 위험도)

**목표:** 현재 코드의 실제 버그/누수 수정.

6. **setInterval 메모리 누수 fix** (`MyPage.tsx`, `ExportHistoryPage.tsx`)
   - `handleYoutubeUpload` 내부 `setInterval` → `pollRef = useRef(null)` + `useEffect cleanup`
   - 또는 Phase 3에서 TanStack Query로 대체하면서 동시 해결 (둘 중 선택)

7. **OAuth exchange를 api.ts로 이동** (`App.tsx`, `api.ts`)
   - `App.tsx:29-35`의 `fetch('/api/auth/google/exchange...')` 인라인 호출
   - → `api.ts`에 `auth.exchangeGoogleCode(code)` 함수로 추출

8. **EditorRoute 인증 가드 중복 제거** (`App.tsx`)
   - `EditorRoute:113`의 `localStorage.getItem("token")` 체크 제거
   - `ProtectedLayout`으로 래핑하여 통일

---

### Phase 3 — TanStack Query 도입 (의존성 추가, 핵심 변경)

**목표:** 데이터 페칭 표준화 + Phase 2의 메모리 누수 근본 해결.

9. **패키지 설치 + 초기 설정**
   ```
   npm install @tanstack/react-query @tanstack/react-query-devtools
   ```
   - `main.tsx`에 `QueryClient` + `QueryClientProvider` + DevTools 추가

10. **단순 fetch 마이그레이션** (위험도 낮음, 독립적)
    - `DashboardPage`: `projects.list()` → `useQuery`
    - `AdminPage`: stats + users fetch → `useQuery`

11. **YouTube 상태 공유** (핵심)
    - `AppLayout`, `EditorPage`, `MyPage SettingsTab`, `MyPage ExportsTab` 모두 동일 `queryKey: ["youtube-status"]` 사용
    - → API 중복 호출 제거, 연결 해제 시 `invalidateQueries` 로 전체 동기화

12. **YouTube 업로드 폴링 마이그레이션** (메모리 누수 완전 해결)
    - `MyPage ExportsTab`의 `setInterval` → `useQuery({ refetchInterval: 3000, enabled: isUploading })`
    - `ExportHistoryPage`도 동일하게 적용
    - 언마운트 시 자동 중단 보장

13. **MyPage 나머지 fetch 마이그레이션**
    - UsageTab: `auth.me()` → `useQuery`
    - ExportsTab 삭제 후 목록 갱신: `invalidateQueries(["exports"])`

**체크리스트:**
- [ ] DevTools에서 query 캐시 공유 확인 (youtube-status 1개만 있어야 함)
- [ ] 페이지 전환 후 재방문 시 stale-while-revalidate 동작 확인
- [ ] 내보내기 삭제 후 목록 자동 갱신 확인

---

### Phase 4 — App.tsx 구조 정리 (소규모, 독립적)

**목표:** App.tsx를 순수 라우팅 선언으로 단순화.

14. **AuthGuard 컴포넌트 추출** (`src/components/AuthGuard.tsx`)
    - `App.tsx`의 `ProtectedLayout` → 별도 파일
    - EditorRoute를 포함한 모든 보호된 라우트에 일관적으로 적용

15. **App.tsx 최종 정리**
    - Route wrapper functions 제거 → `createBrowserRouter` 전환은 선택 사항

---

### Phase 5 — EditorPage 분해 (영향도 최대, 리스크 최대)

**목표:** 586줄 모노리스를 관심사별로 분리. 상위 Phase 완료 후 진행 권고.

분해 순서 (역의존 순서 — 가장 독립적인 것부터):

16. **`ExportPanel.tsx` 추출** (가장 독립적)
    - export progress bar, YouTube 업로드 버튼/상태 UI
    - props: `exportPct`, `exportMsg`, `exportEta`, `exportDoneId`, `ytConnected`, `ytUploading`, `ytUrl`, `ytPostComment`, 콜백들
    - TanStack Query 마이그레이션 후에는 내부 상태도 줄어든 상태로 추출

17. **`ScorePanel.tsx` 추출**
    - 크기/테마 선택, 점수판 UI, 득점 버튼, undo/redo, 점수 리셋
    - props: 선수명, 점수, scale, theme, marking 상태, 각 콜백

18. **`RallyPanel.tsx` 추출**
    - 랠리 시작 버튼, 랠리 목록 (클릭 이동 + 삭제)
    - props: `marking`, `data.rallies`, `fps`, `videoRef`, 콜백들

19. **`VideoPlayer.tsx` 추출** (가장 복잡 — canvas useEffect 포함)
    - video 태그 + canvas overlay
    - canvas drawing useEffect (현재 줄 255-337): scoreboard_theme, player 데이터, match 데이터 받아서 렌더
    - `onLoadedMetadata` → `setVideoDuration` 콜백

20. **키보드 핸들러 안정화** (`EditorPage.tsx`)
    - `addScore`, `toggleMark`에 `useCallback` 적용
    - useEffect deps array 최소화

21. **EditorPage.tsx 최종 모습** (목표 ~150-200줄)
    - 상태 선언 + ref 선언
    - `save()`, `update()`, `undo()`, `redo()` 로직
    - 4개 서브컴포넌트 조합
    - 단축키 useEffect

**체크리스트:**
- [ ] 랠리 마킹 → 득점 → undo/redo 전체 플로우 동작 확인
- [ ] 점수판 canvas 미리보기 정상 렌더링 확인
- [ ] 내보내기 시작 → WebSocket 진행률 → 완료 → YouTube 업로드 전체 플로우 확인

---

### Phase 6 — 폴더 구조 마이그레이션 (선택적, 대규모)

**목표:** autoedit 기능 착수 직전에 진행. 현재 시점에서는 선택 사항.

22. `pages/auth/` 생성 + 인증 3개 파일 이동
23. `pages/mypage/` 생성 + ExportsTab, UsageTab, SettingsTab 추출 (Phase 5 분해 패턴과 동일)
24. `pages/autoedit/` 생성 (빈 디렉토리, 향후 준비)
25. 전체 import 경로 업데이트 (path alias 덕분에 `@/pages/...`로 간단)

---

## 우선순위 매트릭스 (한 눈에 보기)

| Phase | 작업 | 위험도 | 소요 시간 | 즉각 가치 |
|-------|------|--------|-----------|-----------|
| 1 | 타입/상수/alias 기반 | 낮음 | 2-3h | 타입 안전성, 불일치 수정 |
| 2 | 버그 수정 3개 | 낮음 | 1-2h | 메모리 누수 임시 fix |
| 3 | TanStack Query | 중간 | 3-5h | 누수 근본 해결, 보일러플레이트 제거 |
| 4 | App.tsx 정리 | 낮음 | 0.5h | 코드 명확성 |
| 5 | EditorPage 분해 | 높음 | 4-6h | 유지보수성 대폭 향상 |
| 6 | 폴더 구조 | 중간 | 2-3h | autoedit 확장 준비 |

**권고 시작 순서: Phase 1 → Phase 3 → Phase 5** (Phase 2는 Phase 3에서 자연스럽게 해결됨)

---

## 검증 (분석 보고서이므로 확인 항목)

- [ ] `ExportHistoryPage.tsx`가 실제로 App.tsx 라우트에 없는지 재확인 → dead code 삭제 가능
- [ ] AdminPage의 `STATUS_LABEL`과 MyPage의 불일치 ("대기" vs "대기 중") 어느 쪽으로 통일할지 확인
- [ ] `autoedit` 기능 개발 일정이 확정되면 폴더 구조 마이그레이션 시점 결정
