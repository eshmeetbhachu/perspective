import { useEffect } from "react";
import { Link } from "react-router";
import { useMarkNotificationsRead, useNotifications } from "../challenges";
import { formatDate } from "../components/QuestionCard";

export function NotificationsPage() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = notifications.data?.unreadCount ?? 0;
  const { mutate } = markRead;

  // Opening the page counts as reading everything on it.
  useEffect(() => {
    if (unread > 0) mutate();
  }, [unread, mutate]);

  if (notifications.isPending) return <p className="muted">Loading…</p>;
  if (notifications.isError) {
    return <p className="form-error">Couldn't load notifications.</p>;
  }

  const items = notifications.data.notifications;
  return (
    <section className="card card-wide">
      <h1>Notifications</h1>
      {items.length === 0 ? (
        <p className="muted">
          Nothing yet. You'll hear here when someone challenges your post or
          replies to you.
        </p>
      ) : (
        <ul className="notification-list">
          {items.map((item) => {
            const who = item.actor?.username ?? "Someone";
            const href = item.commentId
              ? `/c/${item.challengeId}#comment-${item.commentId}`
              : `/c/${item.challengeId}`;
            return (
              <li
                key={item.id}
                className={item.read ? "notification" : "notification unread"}
              >
                <Link to={href}>
                  <strong>{who}</strong>{" "}
                  {item.type === "post_challenged"
                    ? "challenged your post"
                    : "replied to you"}{" "}
                  in “{item.challengeTitle}”
                </Link>
                <p className="question-meta">{formatDate(item.createdAt)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
