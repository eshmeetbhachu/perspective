import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useCurrentUser, useLogout } from "../auth";
import { useUnreadCount } from "../challenges";

// On the front page the header sits on top of the artwork (`overlay`).
// Below 760px wide the links fold into a menu opened by a button.
export function SiteHeader({ overlay }: { overlay: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <header
      className={overlay ? "site-header site-header-overlay" : "site-header"}
    >
      <div className="site-header-inner">
        <Link to="/" className="brand" onClick={close}>
          Perspective
        </Link>
        <button
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M6 6l12 12M18 6 6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
        <div id="site-menu" className={open ? "site-menu open" : "site-menu"}>
          <nav className="nav-main" aria-label="Main">
            <NavLink to="/questions" onClick={close}>
              Questions
            </NavLink>
            <Link to="/#how" onClick={close}>
              How it works
            </Link>
            <NavLink to="/ask" onClick={close}>
              Ask a question
            </NavLink>
          </nav>
          <AccountMenu onNavigate={close} />
        </div>
      </div>
    </header>
  );
}

function NotificationsLink({ onNavigate }: { onNavigate: () => void }) {
  const { data } = useUnreadCount(true);
  const unread = data?.unreadCount ?? 0;
  return (
    <NavLink
      to="/notifications"
      onClick={onNavigate}
      aria-label={
        unread ? `Notifications, ${String(unread)} unread` : "Notifications"
      }
    >
      Notifications
      {unread > 0 && <span className="unread-badge">{unread}</span>}
    </NavLink>
  );
}

function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  if (isPending) return <div className="nav-account" />;

  if (!user) {
    return (
      <div className="nav-account">
        <Link to="/login" onClick={onNavigate}>
          Log in
        </Link>
        <Link to="/signup" className="button button-dark" onClick={onNavigate}>
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="nav-account">
      {(user.role === "moderator" || user.role === "admin") && (
        <NavLink to="/moderation" onClick={onNavigate}>
          Moderation
        </NavLink>
      )}
      <NotificationsLink onNavigate={onNavigate} />
      <NavLink to="/account" className="nav-user" onClick={onNavigate}>
        {user.username}
      </NavLink>
      <button
        type="button"
        className="link-button nav-logout"
        disabled={logout.isPending}
        onClick={() => {
          onNavigate();
          // Leave first: on a members-only page, clearing the user would
          // otherwise send them to the login page instead.
          void navigate("/");
          logout.mutate();
        }}
      >
        Log out
      </button>
    </div>
  );
}
