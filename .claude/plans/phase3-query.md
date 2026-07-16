# Phase 3 — TanStack Query 도입 상세 구현 계획

## 배경

`frontend-refactoring-review.md`에서 도출된 Phase 3 실행 계획. Phase 2(`refactor/phase2-bugfix`)가 머지된 `main` 기준으로 진행.
목표: 6개 페이지의 반복되는 `useState`+`useEffect`+`.then(setX)` 보일러플레이트를 `useQuery`로 교체하고, YouTube 연결 상태 3중 독립 fetch와 업로드 폴링 `setInterval` 메모리 누수를 근본 해결.
진행 방식: 각 Step 완료 후 사용자 승인을 받고 다음 Step 진행.

**전제:** `api.ts`의 `auth.exchangeGoogleCode`, `src/lib/auth.ts`의 `isAuthenticated()` (Phase 2 산출물)를 그대로 사용.

---

## 우려 사항 (사전 결정)

### ① staleTime 기본값
기본 `staleTime: 0`이면 컴포넌트 마운트마다 refetch 발생. 이번 Phase에서는 전역 기본값을 `staleTime: 30_000`으로 설정(`QueryClient` 생성 시 `defaultOptions.queries.staleTime`). 개별 쿼리는 "이 데이터가 바뀌는 유일한 경로를 우리가 항상 invalidate하는가?"를 기준으로 override 여부를 판단 — 그렇다면(`youtube-status`) `staleTime: Infinity` + invalidate만으로 충분하고, 앱 밖(다른 유저의 액션, 백그라운드 워커 등)에서도 바뀔 수 있는 데이터(`projects`, `admin-users`, `admin-stats`, `admin-exports`, `me`)는 전역 기본값 유지.

### ② mutation vs 수동 상태 업데이트
삭제·업로드처럼 서버 상태를 변경하는 액션은 `useMutation` + `invalidateQueries`로 전환. `onSuccess` 콜백 안에서 로컬 UI 전용 상태(예: `uploadingIds`)는 계속 `useState`로 관리 — 서버 상태와 클라이언트 UI 상태를 혼용하지 않음.

### ③ EditorPage는 부분 적용만
`EditorPage.tsx`의 `marking`, `player1_score` 등 클라이언트-로컬 상태는 Query로 옮기지 않음. YouTube 관련 fetch/폴링만 Query로 교체 (Phase 5 EditorPage 분해의 사전 정지 작업이기도 함).

### ④ ExportHistoryPage 유지
현재 라우트는 없지만(dead code 아님, 삭제 보류 방침 유지) 동일 `queryKey`를 사용해 캐시 일관성만 맞춤.

### ⑤ 쿼리 정의는 `queryOptions()`로, 커스텀 훅으로 감싸지 않음
`src/queries/*.ts`에 도메인별(`api.ts`/`models/`와 이름 맞춤)로 `queryOptions({ queryKey, queryFn, ... })`를 정의하고, 컴포넌트에서 `useQuery(xxxOptions)`로 바로 사용. `invalidateQueries`도 `{ queryKey: xxxOptions.queryKey }`로 참조해 문자열 리터럴 중복을 없앰. `useYoutubeStatus()` 같은 래퍼 훅은 만들지 않기로 결정 — `useQuery`/`useSuspenseQuery`/`queryClient.prefetchQuery` 등 여러 컨텍스트에서 동일 옵션 객체를 재사용할 수 있어야 하고(Phase 4 `createBrowserRouter` loader 도입 시 특히), 향후 필요 시 파생 상태만 얇은 훅으로 추가.

### ⑥ export_count → `me` invalidate는 Phase 5로 이연
`user.export_count`는 `backend/workers/tasks.py:357`의 백그라운드 워커에서 증가하므로, 프론트에서 내보내기 완료를 감지하는 시점(EditorPage의 진행률 WebSocket 콜백)에서 `invalidateQueries({ queryKey: meOptions.queryKey })`를 호출하는 게 정확함. 다만 이 콜백은 EditorPage의 내보내기 진행 상태 로직(우려사항 ③에서 이번 Phase 범위 밖으로 정한 부분) 안에 있어서, Phase 5(EditorPage 분해) 작업 시 같이 처리하기로 함. 그 전까지는 `me` 쿼리의 30초 staleTime이 최종적으로 값을 맞춰줌.

---

## 작업 목록 (승인 단위)

### Step 1 — 패키지 설치 + QueryClientProvider 설정

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**`frontend/src/main.tsx`** 수정:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
```

검증: `npm run build` 통과, 브라우저에 React Query DevTools 아이콘 표시 확인

---

### Step 2 — 단순 목록 fetch 마이그레이션

동일 패턴(`useState`+`useEffect`+`.then(setX).finally(...)` → `useQuery`)을 아래 3곳에 적용:

- `DashboardPage.tsx` — `projects.list()`
  ```ts
  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["projects"],
    queryFn: projects.list,
  })
  ```
- `AdminPage.tsx` — `users`, `stats`, `taskExports` 3개 fetch 각각 동일하게 `useQuery({ queryKey: ["admin-users"] })` / `["admin-stats"]` / `["admin-exports"]`
- `MyPage.tsx UsageTab` — `auth.me()` → `useQuery({ queryKey: ["me"], queryFn: auth.me })`

기존 `loading` 상태는 `isLoading`으로 대체, 기존 `useState`/`useEffect` 제거.

검증: 각 페이지 진입 시 기존과 동일하게 목록/통계 표시되는지 확인, DevTools에서 해당 `queryKey` 캐시 생성 확인

---

### Step 3 — YouTube 연결 상태 공유

현재 `AppLayout.tsx:23`, `MyPage.tsx ExportsTab:21-24`, `ExportHistoryPage.tsx:12`, `EditorPage.tsx`가 각자 `youtube.status()`를 독립 호출 중. `src/queries/youtube.ts`에 `queryOptions`로 정의해 통일:

```ts
// src/queries/youtube.ts
export const youtubeStatusOptions = queryOptions({
  queryKey: ["youtube-status"],
  queryFn: youtube.status,
  staleTime: Infinity,
})
```
```ts
// 각 컴포넌트
const { data: yt } = useQuery(youtubeStatusOptions)
const ytConnected = yt?.connected ?? false
```

`staleTime: Infinity`인 이유: 이 값이 바뀌는 유일한 경로는 SettingsTab의 연결/해제 액션이고, 그 액션이 항상 `invalidateQueries`를 호출하므로 시간 기반 재검증이 불필요함 (자세한 논의는 대화 기록 참고). 캐시는 `QueryClient`가 살아있는 동안(새로고침 전까지)만 유지되므로 Google 쪽에서 직접 연동을 끊는 예외 상황도 새로고침 시 자동 해결됨.

위 훅을 4개 파일에 동일하게 적용 (기존 `ytConnected` state + 개별 `useEffect` fetch 제거).

**`MyPage.tsx SettingsTab`**의 연결/해제 핸들러에 무효화 추가:
```ts
const queryClient = useQueryClient()
// 연결 성공 / disconnect 성공 콜백 안에서
queryClient.invalidateQueries({ queryKey: youtubeStatusOptions.queryKey })
```

검증: DevTools에서 `["youtube-status"]` 캐시가 1개만 존재(4개 컴포넌트가 공유), SettingsTab에서 연결/해제 후 AppLayout 아이콘이 새로고침 없이 즉시 반영되는지 확인 — 원 리뷰 문서 "추가 질문 B"에서 지적된 상태 불일치 버그가 해결됨

---

### Step 4 — YouTube 업로드 폴링 마이그레이션 (메모리 누수 근본 해결) + Step 5 — exports 목록 갱신 (병합)

당초 Step 4(폴링)와 Step 5(목록 useQuery화)를 분리해서 계획했고, 구현 중 **리스트 폴링 → 개별(행별) 폴링 → 다시 리스트 폴링**으로 두 번 방향을 바꾼 끝에 최종적으로 **리스트 전체 폴링**으로 확정 (`EditorPage.tsx`는 원래부터 리스트가 아니라 프로젝트 하나만 다루므로 개별 id 폴링 유지, 이 부분은 처음부터 변경 없음). 전체 트레이드오프/왕복 논의는 `phase3-query-retrospective.md`의 3.4~3.4-3에 상세히 기록.

**최종 설계**:
- `["exports"]` 리스트 쿼리가 `refetchInterval`로 "업로드 중인 항목이 하나라도 있으면 3초마다 전체 재조회, 없으면 중단".
- `ExportRow`(`src/pages/ExportRow.tsx`, `MyPage.tsx ExportsTab`/`ExportHistoryPage.tsx` 공유)는 **순수 presentational** — `item`/`ytConnected`/`isUploading`/`onUpload`/`onDelete`만 props로 받고 자체 쿼리·mutation·`queryClient` 접근이 없음.
- `uploadMutation`/`deleteMutation` 둘 다 부모(`ExportsTab`/`ExportHistoryPage`)에 위치, 성공 시 `invalidateQueries({queryKey: exportsOptions.queryKey})`.
- 업로드 버튼 클릭 직후 ~ 서버가 "uploading"을 커밋하기 전까지의 짧은 공백은 `uploadMutation.isPending && uploadMutation.variables?.id === item.id`(MyPage, `postComment` 포함 객체) / `... === item.id`(ExportHistoryPage, id만)로 커버.

한 차례 시도했던 "행별 개별 폴링 + 캐시 기반 enabled 파생" 설계는 코드는 더 정밀했지만(`getQueryData`/`setQueryData`로 두 캐시 동기화 필요), 이 앱 규모(개인 소유 내보내기 히스토리, 1인 개발, 좁은 재사용 범위)에서는 그 정밀함이 주는 실익보다 "캐시 두 개를 동기화해야 하는 복잡성"의 비용이 크다고 판단해 최종적으로 기각. `exportStatusOptions(id)` 팩토리 자체는 `EditorPage.tsx`가 계속 사용하므로 `queries/exports.ts`에 유지.

**`src/queries/exports.ts`**:
```ts
export const exportsOptions = queryOptions({
  queryKey: ["exports"],
  queryFn: exportsApi.list,
})

export const exportStatusOptions = (exportId: number) =>
  queryOptions({
    queryKey: ["export-status", exportId],
    queryFn: () => exportsApi.status(exportId),
  })
```

**`MyPage.tsx ExportsTab` / `ExportHistoryPage.tsx`** 공통 패턴:
```ts
const { data: list = [], isLoading: loading } = useQuery({
  ...exportsOptions,
  refetchInterval: (query) => {
    const anyUploading = query.state.data?.some(item => item.youtube_url === "uploading")
    return anyUploading ? 3000 : false
  },
})

const deleteMutation = useMutation({
  mutationFn: (id: number) => exportsApi.delete(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey }),
})

const uploadMutation = useMutation({
  mutationFn: (id: number) => exportsApi.uploadToYoutube(id, ytPostComment),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: exportsOptions.queryKey }),
  onError: (e) => alert(e instanceof Error ? e.message : "YouTube 업로드 실패"),
})
```

**`src/pages/ExportRow.tsx`**(순수 presentational, 사용처와 같은 `pages/` 폴더 — `components/`는 `AppLayout`처럼 앱 전역에서 쓰는 것만):
```tsx
export default function ExportRow({ item, ytConnected, isUploading, disabledHint, onUpload, onDelete }: {...}) {
  // useQuery/useMutation 없음 — item.youtube_url과 isUploading prop만으로 렌더링
}
```

**`EditorPage.tsx`**(단일 프로젝트, 리스트 아님)는 처음부터 변경 없이 `exportStatusOptions` 팩토리로 개별 id 폴링:
```ts
const { data: exportStatus } = useQuery({
  ...exportStatusOptions(exportDoneId!),
  refetchInterval: (query) => {
    const url = query.state.data?.youtube_url
    return url && url !== "uploading" ? false : 3000
  },
  enabled: ytUploading && exportDoneId != null,
})
```
`youtube_url`이 확정되면 `refetchInterval`이 `false`를 반환해 자동 정지되고, 컴포넌트 언마운트 시에도 React Query가 자동으로 폴링을 중단함 — `clearInterval` 누락으로 인한 누수가 근본적으로 사라짐.

검증: 업로드 시작 → 3초 간격 폴링 → 완료 시 자동 정지 확인. 업로드 중 페이지 이동 후 Network 탭에서 요청이 계속 발생하지 않는지 확인 (누수 fix 검증의 핵심). 내보내기 삭제 후 목록에서 즉시 사라짐 확인. `npm run test` (`models/export.test.ts`) 통과

---

## 커밋 / PR 전략

브랜치: `refactor/phase3-query` (`refactor/phase2-bugfix` 머지된 `main`에서 분기)

각 Step 완료 시 개별 커밋:
1. `chore: install TanStack Query and set up QueryClientProvider`
2. `refactor: migrate simple list fetches to useQuery (Dashboard, Admin, UsageTab)`
3. `refactor: share youtube-status via useQuery across AppLayout/MyPage/EditorPage`
4. `fix: replace setInterval youtube upload polling with useQuery (list polling for ExportsTab/ExportHistoryPage, per-id for EditorPage) + migrate exports list to useQuery/useMutation` (Step 4+5 병합)
5. `refactor: extract shared ExportRow presentational component for ExportsTab/ExportHistoryPage` (행별 개별 폴링 설계를 검토했다가 리스트 폴링으로 최종 확정 — 회고 문서 3.4-3 참고)

모든 커밋 완료 후 단일 PR.

---

## 최종 검증

```bash
npm run build
npm run test
```

체크리스트:
- [ ] `npm run build`, `npm run test` 통과
- [ ] DevTools에서 `["youtube-status"]` 캐시가 1개만 존재 (중복 호출 없음)
- [ ] SettingsTab에서 YouTube 연결/해제 → AppLayout 아이콘이 새로고침 없이 즉시 반영
- [ ] YouTube 업로드 시작 → 3초 간격 폴링 → 완료 시 자동 정지, 업로드 중 페이지 이동 후 Network 탭에서 요청이 계속 발생하지 않음
- [ ] 내보내기 삭제 후 목록에서 즉시 사라짐

---

## 이번 범위 아님
- **Phase 5 — EditorPage 분해**: 이 Phase에서 YouTube 상태/폴링을 Query로 옮기면 EditorPage의 상태 개수가 줄어들어 이후 분해가 더 쉬워짐. 위험도 최대이므로 별도 세션 권장. 내보내기 완료 콜백에서 `invalidateQueries({ queryKey: meOptions.queryKey })` 호출하는 것도 이때 같이 처리 (우려사항 ⑥ 참고)
- **Phase 4 — App.tsx `createBrowserRouter` 전환**: 선택 사항
- **Phase 6 — 폴더 구조 마이그레이션**: autoedit 착수 시점까지 보류
