import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

const destinations = { student: "/student/dashboard", lecturer: "/lecturer/dashboard", admin: "/admin/dashboard" };

export default function ProtectedRoute({ role, children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <main role="status" aria-live="polite">Restoring your session…</main>;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={destinations[user.role] || "/signin"} replace />;
  return children;
}
