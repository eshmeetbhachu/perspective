import { Outlet, Route, Routes, useLocation } from "react-router";
import { RequireAuth } from "./components/RequireAuth";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
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
import { NotFoundPage } from "./pages/NotFoundPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PostPage } from "./pages/PostPage";
import { QuestionPage } from "./pages/QuestionPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { WritePostPage } from "./pages/WritePostPage";

export function App() {
  return (
    <Routes>
      {/* Log in and sign up have their own full-screen layout. */}
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="q/:slug" element={<QuestionPage />} />
        <Route path="posts/:id" element={<PostPage />} />
        <Route path="c/:id" element={<ChallengePage />} />
        <Route path="signup/google" element={<GoogleSignupPage />} />
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  // The front page's artwork runs edge to edge, with the header laid over it.
  const isHome = useLocation().pathname === "/";
  return (
    <div className="site">
      <SiteHeader overlay={isHome} />
      <main className={isHome ? "site-main" : "site-main page"}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
