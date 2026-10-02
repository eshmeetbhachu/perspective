import { Link, useSearchParams } from "react-router";
import { useCurrentUser, useVerifyEmail } from "../auth";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const verify = useVerifyEmail(searchParams.get("token") ?? "");
  const { data: user } = useCurrentUser();

  if (verify.isPending && verify.fetchStatus !== "idle") {
    return <p className="muted">Confirming your email…</p>;
  }

  return (
    <section className="card">
      {verify.isSuccess ? (
        <>
          <h1>Email confirmed</h1>
          <p className="muted">Thanks, your email address is verified.</p>
          <Link to={user ? "/account" : "/login"} className="button">
            {user ? "Go to your account" : "Log in"}
          </Link>
        </>
      ) : (
        <>
          <h1>Link not valid</h1>
          <p className="muted">
            This link has expired or was already used. You can send a new one
            from your <Link to="/account">account page</Link>.
          </p>
        </>
      )}
    </section>
  );
}
