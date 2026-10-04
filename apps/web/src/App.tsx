import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useCurrentUser, useLogout } from "./auth";
import { useUnreadCount } from "./challenges";
import { RequireAuth } from "./components/RequireAuth";
import { AccountPage } from "./pages/AccountPage";
import { AskPage } from "./pages/AskPage";
import { ChallengePage } from "./pages/ChallengePage";
import { EditPostPage } from "./pages/EditPostPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GoogleSignupPage } from "./pages/GoogleSignupPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ModerationPage } from "./pages/ModerationPage";
import { NewChallengePage } from "./pages/NewChallengePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PostPage } from "./pages/PostPage";
import { QuestionPage } from "./pages/QuestionPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { WritePostPage } from "./pages/WritePostPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="q/:slug" element={<QuestionPage />} />
        <Route path="posts/:id" element={<PostPage />} />
        <Route path="c/:id" element={<ChallengePage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="signup/google" element={<GoogleSignupPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
          <Route path="ask" element={<AskPage />} />
          <Route path="q/:slug/write" element={<WritePostPage />} />
          <Route path="posts/:id/edit" element={<EditPostPage />} />
          <Route path="posts/:id/challenge" element={<NewChallengePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="moderation" element={<ModerationPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  // The front page's artwork runs edge to edge, with the header laid over it.
  const isHome = useLocation().pathname === "/";
  return (
    <>
      <header
        className={isHome ? "site-header site-header-overlay" : "site-header"}
      >
        <Link to="/" className="brand">
          Perspective
        </Link>
        <AccountMenu />
      </header>
      <main className={isHome ? undefined : "page"}>
        <Outlet />
      </main>
    </>
  );
}

function NotificationsLink() {
  const { data } = useUnreadCount(true);
  const unread = data?.unreadCount ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={
        unread ? `Notifications, ${String(unread)} unread` : "Notifications"
      }
    >
      Notifications
      {unread > 0 && <span className="unread-badge">{unread}</span>}
    </Link>
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
        <Link to="/login">Login</Link>
        <Link to="/signup">Sign up</Link>
      </nav>
    );
  }

  return (
    <nav className="nav">
      {(user.role === "moderator" || user.role === "admin") && (
        <Link to="/moderation">Moderation</Link>
      )}
      <NotificationsLink />
      <Link to="/account" className="nav-user">
        {user.username}
      </Link>
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
