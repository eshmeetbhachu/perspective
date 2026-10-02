import { useSearchParams } from "react-router";
import { useCurrentUser, useProviders, useResendVerification } from "../auth";
import { GoogleButton } from "../components/GoogleButton";

export function AccountPage() {
  const { data: user } = useCurrentUser();
  const { data: providers } = useProviders();
  const resend = useResendVerification();
  const [searchParams] = useSearchParams();
  if (!user) return null;

  const justConnected = searchParams.get("google") === "connected";
  const conflict = searchParams.get("error") === "google_conflict";

  return (
    <section className="card">
      <h1>Hi, {user.username}</h1>
      <p className="muted">This page is only visible when you're logged in.</p>
      {justConnected && <p className="notice">Google is now connected.</p>}
      {conflict && (
        <p className="form-error">
          That Google account is already connected to another Perspective
          account.
        </p>
      )}
      <dl className="details">
        <dt>Email</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerified ? (
            <span className="badge badge-ok">verified</span>
          ) : (
            <span className="badge">not verified yet</span>
          )}
          {!user.emailVerified && (
            <p className="field-hint">
              {resend.isSuccess ? (
                "Sent. Check your inbox for the link."
              ) : (
                <button
                  type="button"
                  className="link-button"
                  disabled={resend.isPending}
                  onClick={() => {
                    resend.mutate();
                  }}
                >
                  Send the verification link again
                </button>
              )}
              {resend.isError &&
                " Couldn't send it, try again in a few minutes."}
            </p>
          )}
        </dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
        {(user.googleConnected || providers?.google) && (
          <>
            <dt>Google</dt>
            <dd>
              {user.googleConnected ? (
                <span className="badge badge-ok">connected</span>
              ) : (
                <GoogleButton intent="link" />
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
