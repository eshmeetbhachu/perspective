import { Navigate, Outlet, useLocation } from "react-router";
import { useCurrentUser } from "../auth";

// Pages inside this route are only shown to logged-in users. The API still
// checks the session on every request; this only decides what to render.
export function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <p className="muted">Loading…</p>;
  if (isError) return <p className="form-error">Can't reach the server.</p>;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
