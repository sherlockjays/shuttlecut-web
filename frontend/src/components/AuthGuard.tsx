import { Navigate, Outlet } from "react-router-dom"

export function RequireAuth() {
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />
  return <Outlet />
}
