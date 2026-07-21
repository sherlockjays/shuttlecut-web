import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { RequireAuth } from "@/components/AuthGuard"
import AppLayout from "@/components/AppLayout"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import PricingPage from "@/pages/PricingPage"
import GuidePage from "@/pages/GuidePage"
import MyPage from "@/pages/MyPage"
import AdminPage from "@/pages/AdminPage"
import TermsPage from "@/pages/TermsPage"
import PrivacyPage from "@/pages/PrivacyPage"
import { RootHandler, LoginRoute, ResetPasswordRoute, ProjectsRoute, EditorRoute } from "@/routes"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootHandler />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordRoute />} />
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
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
