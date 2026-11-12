import type { ReactNode } from "react";
import { Link } from "react-router";
import { usePageTitle } from "../title";

// Log in and sign up: the artwork on one side, the form on the other.
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  usePageTitle(title);
  return (
    <div className="auth">
      <div className="auth-art">
        <Link to="/" className="brand">
          Perspective
        </Link>
        <p className="auth-tagline">Before you take a side, see every side.</p>
      </div>
      <main className="auth-main">
        <div className="auth-panel">
          <h1>{title}</h1>
          <p className="auth-intro">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
