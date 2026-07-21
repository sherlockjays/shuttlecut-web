# Phase 4 — App.tsx 구조 정리 상세 구현 계획

## 배경

`frontend-refactoring-review.md`에서 도출된 Phase 4 실행 계획. Phase 1(`refactor/phase1-foundation`)과 Phase 3(`refactor/phase3-query`)가 머지된 `main` 기준으로 진행.
목표: `App.tsx`를 순수 라우팅 선언에 가깝게 정리 — 남아있는 두 가지 문제(인증 가드 중복, RootHandler 인라인 API 호출)를 해소.
진행 방식: 각 Step 완료 후 사용자 승인을 받고 다음 Step 진행.

**참고 — `refactor/phase2-bugfix` 브랜치:** Phase 3가 "Phase 2 산출물(`auth.exchangeGoogleCode`, `isAuthenticated()`)을 그대로 사용"한다는 전제로 계획됐었으나, 실제로는 `phase2-bugfix.md` 계획 문서만 작성되고 구현/머지는 되지 않은 채 남아있었음. 그래서 이 두 문제가 Phase 3 이후에도 `App.tsx`에 그대로 남아 Phase 4에서 다시 다루게 됨. 가드 중복 해결책은 그 문서의 `isAuthenticated()` 헬퍼 방식 대신, 아래 이유로 pathless route + `Outlet` 방식을 채택.

---

## 우려 사항 (사전 결정)

### ① 가드/레이아웃 분리 방식: pathless route + `Outlet`
기존 `ProtectedLayout`은 인증 체크와 `AppLayout` chrome을 한 컴포넌트에 묶어서, chrome이 필요 없는 `EditorRoute`가 가드 로직만 복붙해야 했음. `isAuthenticated()` 헬퍼로 중복 호출만 줄이는 대신, React Router v6.4+/v7 표준 관용구인 **path 없는 레이아웃 라우트 + `<Outlet/>`** 로 가드(`RequireAuth`)와 chrome(`AppLayout`)을 독립된 계층으로 분리 — `EditorRoute`는 가드만, 나머지는 가드+chrome을 조합해서 씀.

### ② `createBrowserRouter`(data router) 전환은 이번 범위 아님
data router의 실질적 이점(loader의 렌더 전 데이터 페칭/리다이렉트, action)은 지금 프로젝트에 해당 사항이 약함 — 데이터 페칭은 이미 TanStack Query가 담당하고, 인증 체크는 `localStorage` 동기 읽기라 loader의 "비동기 체크를 렌더 전에 끝낸다"는 이점이 발동 안 함. `RequireAuth`+`Outlet` 패턴 자체는 library mode(`<BrowserRouter>`)에서도 동일하게 동작하므로 전환 없이 그대로 적용. 전환은 나중에 실제로 loader가 필요해지는 시점(서버 측 토큰 재검증, autoedit 위저드의 search params 타입 안전 등)에 별도 phase로 재검토.

### ③ 가드 중복 정리 범위: `ProtectedLayout`/`EditorRoute` 2곳만
`localStorage.getItem("token")` 체크가 App.tsx에 4곳 있었으나, `LoginRoute`(이미 로그인했으면 `/login`을 안 보여줌)와 `RootHandler`(여러 리다이렉트 분기 중 하나)는 방향이 반대이거나 성격이 다른 로직이라 그대로 유지. `ProtectedLayout`/`EditorRoute`만 완전히 동일한 로직의 복붙이라 이 둘만 통합.

### ④ `ExportHistoryPage.tsx` 삭제 보류 유지
라우트 없는 dead code이지만 원 리뷰 문서에서 이미 "향후 autoedit 히스토리 페이지로 재활용 가능성" 때문에 삭제하지 않기로 확정됨 — 이번에도 유지.

---

## 작업 목록 (승인 단위)

### Step 1 — 인증 가드/레이아웃 분리 (완료 · 커밋 `88277d4`)

- **`frontend/src/components/AuthGuard.tsx`** 신규: `RequireAuth()` — 토큰 없으면 `<Navigate to="/login"/>`, 있으면 `<Outlet/>`.
- **`frontend/src/components/AppLayout.tsx`** 수정: `{ onLogout, children }` props 제거, 자체 `useNavigate`로 로그아웃 로직 소유, `{children}` → `<Outlet/>`.
- **`frontend/src/App.tsx`** 수정: `ProtectedLayout` 함수 삭제. `<Routes>`를 아래처럼 재구성:
  ```tsx
  <Route element={<RequireAuth />}>
    <Route path="/editor/:projectId" element={<EditorRoute />} />
    <Route element={<AppLayout />}>
      <Route path="/projects" element={<ProjectsRoute />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Route>
  </Route>
  ```

검증: `npm run build` 통과 완료.

---

### Step 1b — 라우트 wrapper 컴포넌트를 `src/routes.tsx`로 추출 (완료)

App.tsx에 `RootHandler`/`LoginRoute`/`ForgotPasswordRoute`/`ResetPasswordRoute`/`ProjectsRoute`/`EditorRoute` 6개가 전부 인라인으로 있어 파일이 비대해짐. bulletproof-react, Remix/RR7 framework mode 등이 공통적으로 쓰는 관습(라우트 wrapper는 페이지/feature 폴더가 아니라 별도 `routes` 관심사로 분리)을 따라 `src/routes.tsx` 신규 파일로 6개 전부 이동. `App.tsx`는 `QueryClientProvider`/`BrowserRouter`/`<Routes>` 트리 조립만 남아 141줄 → 41줄로 축소.

페이지별 폴더(`pages/login/route.tsx` 등) 방식은 채택하지 않음 — `RootHandler`는 대응하는 페이지가 없고, `TermsPage`/`PrivacyPage`/`GuidePage`/`PricingPage`는애초 wrapper가 없어 일부만 폴더화하면 `pages/` 내 파일/폴더가 섞여 일관성이 깨짐. 전체 `pages/` 폴더화는 Phase 6(autoedit 착수 시점)으로 유지.

검증: `npm run build` 통과 완료.

---

### Step 2 — RootHandler의 Google OAuth exchange를 api.ts로 이동 (완료)

**`frontend/src/api.ts`** `auth` 네임스페이스에 추가:
```ts
exchangeGoogleCode: (code: string): Promise<{ access_token?: string }> =>
  apiFetch<{ access_token?: string }>(`/api/auth/google/exchange?code=${code}`),
```

**`frontend/src/routes.tsx`** `RootHandler`의 `google_code` 분기 교체:
```ts
// 기존
fetch(`/api/auth/google/exchange?code=${googleCode}`)
  .then(r => r.json())
  .then(data => { ... })

// 변경
auth.exchangeGoogleCode(googleCode)
  .then(data => {
    if (data.access_token) localStorage.setItem("token", data.access_token)
    navigate("/projects", { replace: true })
  })
  .catch(() => navigate("/login?google_error=1", { replace: true }))
```
최상단에 `import { auth } from "@/api"` 추가.

검증: `npm run build` 통과, `google_code` 콜백 플로우가 기존과 동일한지 코드 리뷰로 확인 (실 OAuth 없이).

---

## 커밋 / PR 전략

브랜치: `refactor/phase4-app`

각 Step 완료 시 개별 커밋:
1. ✅ `refactor: 인증 가드와 AppLayout chrome을 별도 라우트 계층으로 분리` (`88277d4`)
2. ✅ `refactor: App.tsx의 라우트 wrapper 컴포넌트를 routes.tsx로 분리` (`87c9d2c`)
3. `refactor: Google OAuth 코드 교환을 api.ts로 이동` (예정)

모든 커밋 완료 후 단일 PR.

---

## 최종 검증

```bash
npm run build
```

체크리스트:
- [x] `npm run build` 에러 없음 (Step 1)
- [x] 로그아웃 상태에서 보호된 라우트 접근 시 `/login` 리다이렉트 (Step 1)
- [x] 로그인 후 `/projects`/`/pricing`/`/guide`/`/mypage`/`/admin`에서 AppLayout chrome 정상 렌더 (Step 1)
- [x] `/editor/:id`가 chrome 없이 풀스크린 렌더 (Step 1)
- [x] Google 로그인 콜백(`/?google_code=...`) 플로우 — 토큰 저장 후 `/projects` 이동, 실패 시 `/login?google_error=1` 이동 (Step 2, `npm run build` 통과로 검증. 실 OAuth 왕복은 미검증)

---

## 이번 범위 아님
- **`createBrowserRouter` 전환**: loader가 실제로 필요해지는 시점(서버 측 인증 재검증, autoedit 위저드 search params)에 별도 phase로 재검토.
- **`LoginRoute`/`RootHandler`의 나머지 인증 체크 통합**: 방향이 다른 로직이라 제외.
- **`ExportHistoryPage.tsx` 삭제**: 보류 방침 유지.
- **로그인 토큰 저장 방식(localStorage → httpOnly 쿠키) 재검토**: 사용자가 별도로 다루기로 함.
