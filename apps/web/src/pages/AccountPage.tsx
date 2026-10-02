import { useCurrentUser } from "../auth";

export function AccountPage() {
  const { data: user } = useCurrentUser();
  if (!user) return null;

  return (
    <section className="card">
      <h1>Hi, {user.username}</h1>
      <p className="muted">This page is only visible when you're logged in.</p>
      <dl className="details">
        <dt>Email</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerified ? (
            <span className="badge badge-ok">verified</span>
          ) : (
            <span className="badge">not verified yet</span>
          )}
        </dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
      </dl>
    </section>
  );
}
