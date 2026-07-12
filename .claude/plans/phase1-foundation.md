# Phase 1 — 기반 정리 상세 구현 계획

## 배경

이전 코드 리뷰(polished-cuddling-boole.md)에서 도출된 Phase 1 실행 계획.
목표: 타입 안전성 확보 + 공유 인프라 구축. 기능 동작 변화 없음.
진행 방식: 각 Step 완료 후 사용자 승인을 받고 다음 Step 진행.

---

## 우려 사항 (사전 결정)

### ① `verbatimModuleSyntax: true` 유지
타입만 가져올 때는 반드시 `import type { ... }` 구문 사용. 모든 새 import에 적용.

### ② `STATUS_LABEL` 불일치 수정
AdminPage: `pending: "대기"` → 통합 상수는 **"대기 중"** 으로 통일 (이전 계획 방침).

### ③ 상수 선언 방식: `satisfies` 사용
```ts
// Record 타입 명시 대신
const STATUS_LABEL: Record<ExportStatus, string> = { ... }  // ❌

// satisfies 사용 (키 누락 감지 + 리터럴 타입 유지 + TS 5.9 완전 지원)
const STATUS_LABEL = {
  pending: "대기 중",
  ...
} satisfies Record<ExportStatus, string>                     // ✅
```

### ④ `api.ts` 제네릭 전환
`.then((p: any) => ...)` 패턴은 `apiFetch<T = unknown>` 전환 후에도 TypeScript가 허용함 (기존 코드 break 없음).  
타입은 현재 코드에서 실제 사용 중인 필드만 선언해 안전하게 가져감.

### ⑤ `CANVAS_THEMES` / `EMPTY` 위치
EditorPage 전용 구현 세부 사항 → EditorPage 내 유지 (Phase 5에서 재검토).

### ⑥ 테스트 전략
Vitest 미설치. Step 9에서 설치 + 설정 + 상수 스모크 테스트 1개 파일 작성.  
Phase 1의 주 검증은 `npm run build` (tsc strict + vite).

---

## 작업 목록 (승인 단위)

### Step 1 — Path alias 설정

**`frontend/vite.config.ts`** 수정:
```ts
import path from 'path'
// resolve.alias 추가 (현재 @types/node 이미 설치됨)
alias: { "@": path.resolve(__dirname, "src") }
```

**`frontend/tsconfig.app.json`** 수정:
```json
"paths": { "@/*": ["./src/*"] }
```

---

### Step 1a — 기존 상대 경로 import를 `@/`로 일괄 변환

Path alias 추가 직후 실행. 새 타입/상수는 아직 없으므로, 기존 파일들의 상대 경로만 변환.

대상 파일 및 변환 패턴:
- `App.tsx`: `"./pages/..."` → `"@/pages/..."`, `"./components/..."` → `"@/components/..."`
- 각 page 파일들: `"../api"` → `"@/api"`, `"../components/..."` → `"@/components/..."`
- `components/AppLayout.tsx`: `"../api"` → `"@/api"`

검증: `npm run build` 통과

---

### Step 2 — `src/types/export.ts` 생성 + 소비 파일 업데이트

**신규 파일** `frontend/src/types/export.ts`:
```ts
export type ExportStatus = "pending" | "processing" | "done" | "error"

export type ExportItem = {
  id: number
  project_id: number        // ExportHistoryPage 기준 완전 버전
  project_title: string
  status: ExportStatus
  youtube_url: string | null
  error_msg: string | null
  created_at: string | null
}

export type AdminExport = {
  id: number
  status: ExportStatus
  youtube_url: string | null
  error_msg: string | null
  created_at: string | null
  project_title: string
  user_email: string
}
```

**소비 파일 업데이트** (이 Step에서 함께 처리):
- `MyPage.tsx`: 로컬 `ExportItem` 정의 제거 → `import type { ExportItem } from "@/types/export"`
- `ExportHistoryPage.tsx`: 로컬 `ExportItem` 정의 제거 → 동일
- `AdminPage.tsx`: 로컬 `AdminExport` 정의 제거 → `import type { AdminExport } from "@/types/export"`

---

### Step 3 — `src/types/user.ts` 생성 + 소비 파일 업데이트

**신규 파일** `frontend/src/types/user.ts`:
```ts
export type UserInfo = {
  email: string
  plan: string
  export_count: number
}

export type AdminUser = {
  id: number
  email: string
  plan: string
  export_count: number
  is_verified: boolean
  youtube_connected: boolean
  google_login: boolean
  project_count: number
  created_at: string | null
}

export type Stats = {
  total_users: number
  users_by_plan: Record<string, number>
  total_exports: number
  exports_by_status: Record<string, number>
  total_projects: number
}
```

**소비 파일 업데이트** (이 Step에서 함께 처리):
- `MyPage.tsx`: 로컬 `UserInfo` 제거 → `import type { UserInfo } from "@/types/user"`
- `AdminPage.tsx`: 로컬 `AdminUser`, `Stats` 제거 → `import type { AdminUser, Stats } from "@/types/user"`

---

### Step 4 — `src/types/project.ts` 생성 + 소비 파일 업데이트

**신규 파일** `frontend/src/types/project.ts`:
```ts
export type Rally = [number, number, number, number, number]  // [start, end, p1, p2, winner]

export interface ProjectData {
  title: string
  video_path: string
  fps: number
  total_frames: number
  match_date: string
  tournament_name: string
  level: string
  match_name: string
  player1_name: string
  player2_name: string
  player1_score: number
  player2_score: number
  rallies: Rally[]
  scoreboard_scale: number
  scoreboard_theme: string
}

export const THEMES = [
  { id: "dark",  label: "다크",  bg: "#1e1e1e", accent: "#ffdc00" },
  { id: "light", label: "라이트", bg: "#f0f0f0", accent: "#1e50c8" },
  { id: "blue",  label: "블루",  bg: "#002878", accent: "#ffdc00" },
  { id: "red",   label: "레드",  bg: "#780000", accent: "#ffdc00" },
  { id: "green", label: "그린",  bg: "#0a3c14", accent: "#b4ff64" },
] as const

export const SIZES = [
  { label: "소", value: 1.0 },
  { label: "중", value: 1.33 },
  { label: "대", value: 1.67 },
] as const
```

**소비 파일 업데이트** (이 Step에서 함께 처리):
- `EditorPage.tsx`: 로컬 `Rally`, `ProjectData`, `THEMES`, `SIZES` 정의 제거 → 공유 파일 import

---

### Step 5 — `src/constants/export.ts` 생성 + 소비 파일 업데이트

**신규 파일** `frontend/src/constants/export.ts`:
```ts
import type { ExportStatus } from "@/types/export"

export const STATUS_LABEL = {
  pending: "대기 중",
  processing: "처리 중",
  done: "완료",
  error: "오류",
} satisfies Record<ExportStatus, string>

export const STATUS_CLASS = {
  pending: "bg-gray-600 text-gray-200",
  processing: "bg-blue-600 text-white",
  done: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
} satisfies Record<ExportStatus, string>
```

**소비 파일 업데이트** (이 Step에서 함께 처리):
- `MyPage.tsx`: 로컬 `STATUS_LABEL`, `STATUS_CLASS` 제거 → `import { STATUS_LABEL, STATUS_CLASS } from "@/constants/export"`
- `ExportHistoryPage.tsx`: 동일
- `AdminPage.tsx`: 로컬 `STATUS_LABEL`(`"대기"`) + `STATUS_CLASS` 제거 → 공유 상수 import ("대기 중"으로 통일됨)

---

### Step 6 — `src/constants/user.ts` 생성 + 소비 파일 업데이트

**신규 파일** `frontend/src/constants/user.ts`:
```ts
export const PLAN_LIMITS = {
  free: "월 2회",
  basic: "월 5회",
  standard: "월 10회",
  premium: "월 30회",
  unlimited: "무제한",
  club: "무제한",
  admin: "무제한",
} satisfies Record<string, string>

export const PLANS = ["free", "basic", "standard", "premium", "unlimited", "club", "admin"] as const
export type Plan = typeof PLANS[number]
```

**소비 파일 업데이트** (이 Step에서 함께 처리):
- `MyPage.tsx`: 로컬 `PLAN_LIMITS` 제거 → `import { PLAN_LIMITS } from "@/constants/user"`
- `AdminPage.tsx`: 로컬 `PLANS` 배열 제거 → `import { PLANS } from "@/constants/user"`
- Note: `AdminPage`의 `PLAN_BADGE`는 AdminPage 전용 스타일이므로 유지

---

### Step 7 — `api.ts` 제네릭화 + 반환 타입 추가

`apiFetch` 제네릭화:
```ts
export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  ...
  return res.json() as T
}
```

타입이 확립된 namespace 함수에 반환 타입 선언:
```ts
// auth
me: (): Promise<UserInfo> => apiFetch<UserInfo>("/api/auth/me"),

// exports
list: (): Promise<ExportItem[]> => apiFetch<ExportItem[]>("/api/export/"),
status: (exportId: number): Promise<{ status: ExportStatus; progress?: number }> => ...,

// admin
users: (): Promise<AdminUser[]> => apiFetch<AdminUser[]>("/api/admin/users"),
stats: (): Promise<Stats> => apiFetch<Stats>("/api/admin/stats"),
exports: (limit?: number): Promise<AdminExport[]> => ...,

// youtube
status: (): Promise<{ connected: boolean }> => apiFetch<{ connected: boolean }>("/api/youtube/status"),
```

나머지 함수(projects.*, videos.*, autoedit.*)는 타입 불명확 → `apiFetch(...)` 유지.  
기존 `.then((p: any) => ...)` callsite는 break 없음.

---

### Step 8 — Vitest 설치 + 기본 설정 + 스모크 테스트

```bash
npm install -D vitest @vitest/ui
```

`frontend/vite.config.ts`에 test 블록 추가:
```ts
test: { environment: "jsdom" }
```

`frontend/src/constants/export.test.ts` (신규):
```ts
import { describe, it, expect } from "vitest"
import { STATUS_LABEL, STATUS_CLASS } from "./export"

describe("STATUS_LABEL", () => {
  it("모든 ExportStatus 키를 포함한다", () => {
    expect(Object.keys(STATUS_LABEL)).toEqual(["pending", "processing", "done", "error"])
  })
  it("pending은 '대기 중'", () => expect(STATUS_LABEL.pending).toBe("대기 중"))
  it("done은 '완료'",       () => expect(STATUS_LABEL.done).toBe("완료"))
})

describe("STATUS_CLASS", () => {
  it("STATUS_LABEL과 동일한 키를 가진다", () => {
    expect(Object.keys(STATUS_CLASS)).toEqual(Object.keys(STATUS_LABEL))
  })
})
```

`package.json` scripts 추가:
```json
"test": "vitest run",
"test:ui": "vitest --ui"
```

---

## 커밋 / PR 전략

브랜치: `refactor/phase1-foundation` (현재 `refactor/shared`에서 분기)

각 Step 완료 시 개별 커밋:
1. `chore: add @/ path alias`
2. `refactor: convert relative imports to @/ alias`
3. `refactor: add shared types - export`
4. `refactor: add shared types - user`
5. `refactor: add shared types - project`
6. `refactor: add shared constants - export (unify STATUS_LABEL)`
7. `refactor: add shared constants - user`
8. `refactor: add generics to apiFetch and return types`
9. `test: add Vitest and STATUS constants smoke tests`

모든 커밋 완료 후 단일 PR.

---

## 최종 검증

```bash
npm run build   # TypeScript strict + Vite 빌드 (주 검증)
npm test        # 상수 스모크 테스트
```

체크리스트:
- [ ] `npm run build` 에러 없음
- [ ] `npm test` 통과
- [ ] AdminPage에서 "대기 중" 표시 확인 (브라우저)
