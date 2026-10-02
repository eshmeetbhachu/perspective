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
import { AskPage } from "./pages/AskPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GoogleSignupPage } from "./pages/GoogleSignupPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { QuestionPage } from "./pages/QuestionPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="q/:slug" element={<QuestionPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="signup/google" element={<GoogleSignupPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
          <Route path="ask" element={<AskPage />} />
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
