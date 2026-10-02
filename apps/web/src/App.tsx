import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router";
import { useCurrentUser, useLogout } from "./auth";
import { RequireAuth } from "./components/RequireAuth";
import { AccountPage } from "./pages/AccountPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          Perspective
        </Link>
        <AccountMenu />
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}

function AccountMenu() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  if (isPending) return null;

  if (!user) {
    return (
      <nav className="nav">
        <Link to="/login">Log in</Link>
        <Link to="/signup" className="button button-small">
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav className="nav">
      <Link to="/account">{user.username}</Link>
      <button
        type="button"
        className="link-button"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate(undefined, {
            onSuccess: () => {
              void navigate("/");
            },
          });
        }}
      >
        Log out
      </button>
    </nav>
  );
}
