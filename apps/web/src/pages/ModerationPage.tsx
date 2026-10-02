import {
  type AuditEntry,
  type QueueItem,
  REPORT_REASON_LABELS,
  REPORT_TARGETS,
  type ReportTarget,
} from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCurrentUser } from "../auth";
import { formatDate } from "../components/QuestionCard";
import { useAudit, useBan, useModerate, useQueue } from "../moderation";

const TABS = { queue: "Reports", audit: "Audit log", users: "Users" } as const;
type Tab = keyof typeof TABS;

const ACTION_LABELS: Record<AuditEntry["action"], string> = {
  remove: "removed",
  restore: "restored",
  dismiss_reports: "dismissed reports on",
  ban_user: "banned",
  unban_user: "unbanned",
};

export function ModerationPage() {
  const { data: user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "audit" || tabParam === "users" ? tabParam : "queue";

  // The API enforces this too; this only avoids showing an empty dashboard.
  if (user?.role !== "moderator" && user?.role !== "admin") {
    return (
      <section className="card">
        <h1>Moderators only</h1>
        <Link to="/">Back to questions</Link>
      </section>
    );
  }

  return (
    <section className="moderation">
      <h1>Moderation</h1>
      <div className="sort-bar" role="tablist">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-pressed={key === tab}
            onClick={() => {
              setSearchParams(key === "queue" ? {} : { tab: key });
            }}
          >
            {TABS[key]}
          </button>
        ))}
      </div>
      {tab === "queue" && <Queue />}
      {tab === "audit" && <AuditLog />}
      {tab === "users" && <Users />}
    </section>
  );
}

function Queue() {
  const queue = useQueue();
  if (queue.isPending) return <p className="muted">Loading…</p>;
  if (queue.isError)
    return <p className="form-error">Couldn't load reports.</p>;
  if (queue.data.items.length === 0) {
    return <p className="empty">Nothing to review.</p>;
  }
  return (
    <ul className="question-list">
      {queue.data.items.map((item) => (
        <QueueCard key={`${item.targetType}:${item.targetId}`} item={item} />
      ))}
    </ul>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const moderate = useModerate();
  const ban = useBan();
  const [note, setNote] = useState("");
  const { preview } = item;
  const author = preview?.author?.username;
  const error = moderate.error ?? ban.error;

  function act(action: "remove" | "dismiss") {
    moderate.mutate({
      action,
      targetType: item.targetType,
      targetId: item.targetId,
      reason: note,
    });
  }

  return (
    <li className="question-card queue-card">
      <p className="question-meta">
        <span className="badge">{item.targetType}</span>{" "}
        <strong>
          {item.reportCount} {item.reportCount === 1 ? "report" : "reports"}
        </strong>{" "}
        · {item.reasons.map((r) => REPORT_REASON_LABELS[r]).join(", ")} · last{" "}
        {formatDate(item.lastReportedAt)}
      </p>
      {preview ? (
        <>
          <Link to={preview.link} className="question-title">
            {preview.title}
          </Link>
          {preview.excerpt && (
            <p className="question-snippet">{preview.excerpt}</p>
          )}
          <p className="question-meta">
            by {author ?? "deleted account"}
            {preview.authorBanned && <span className="badge">banned</span>}
            {preview.removed && <span className="badge">already removed</span>}
          </p>
        </>
      ) : (
        <p className="muted">This content no longer exists.</p>
      )}
      {item.details.length > 0 && (
        <ul className="report-details">
          {item.details.map((detail, i) => (
            <li key={i}>“{detail}”</li>
          ))}
        </ul>
      )}
      <div className="moderation-actions">
        <input
          aria-label="Note for the audit log"
          placeholder="Note for the audit log (needed to remove or ban)"
          value={note}
          maxLength={500}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
        <button
          type="button"
          className="button button-small danger-button"
          disabled={!preview || note.trim().length < 3 || moderate.isPending}
          onClick={() => {
            act("remove");
          }}
        >
          Remove
        </button>
        <button
          type="button"
          className="button button-small button-secondary"
          disabled={moderate.isPending}
          onClick={() => {
            act("dismiss");
          }}
        >
          Dismiss
        </button>
        {author && !preview.authorBanned && (
          <button
            type="button"
            className="button button-small button-secondary"
            disabled={note.trim().length < 3 || ban.isPending}
            onClick={() => {
              if (
                window.confirm(`Ban ${author}? They are logged out at once.`)
              ) {
                ban.mutate({ username: author, reason: note });
              }
            }}
          >
            Ban {author}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error.message}</p>}
    </li>
  );
}

function AuditLog() {
  const audit = useAudit();
  const moderate = useModerate();
  if (audit.isPending) return <p className="muted">Loading…</p>;
  if (audit.isError)
    return <p className="form-error">Couldn't load the log.</p>;
  if (audit.data.entries.length === 0) {
    return <p className="empty">No moderator actions yet.</p>;
  }
  const isContent = (type: string): type is ReportTarget =>
    (REPORT_TARGETS as readonly string[]).includes(type);

  return (
    <ul className="notification-list">
      {audit.data.entries.map((entry) => (
        <li key={entry.id} className="notification">
          <strong>{entry.actor?.username ?? "a deleted account"}</strong>{" "}
          {ACTION_LABELS[entry.action]} a {entry.targetType}
          {entry.reason && <> — “{entry.reason}”</>}
          <p className="question-meta">
            {formatDate(entry.createdAt)}
            {entry.action === "remove" && isContent(entry.targetType) && (
              <>
                {" · "}
                <button
                  type="button"
                  className="link-button small"
                  disabled={moderate.isPending}
                  onClick={() => {
                    const reason = window.prompt("Why restore it?");
                    if (reason && isContent(entry.targetType)) {
                      moderate.mutate({
                        action: "restore",
                        targetType: entry.targetType,
                        targetId: entry.targetId,
                        reason,
                      });
                    }
                  }}
                >
                  Restore
                </button>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Users() {
  const ban = useBan();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);

  function submit(unban: boolean) {
    return (event?: SubmitEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setDone(null);
      ban.mutate(
        { username: username.trim(), reason, unban },
        {
          onSuccess: () => {
            setDone(`${username.trim()} was ${unban ? "unbanned" : "banned"}.`);
          },
        },
      );
    };
  }

  const ready = username.trim().length >= 3 && reason.trim().length >= 3;
  return (
    <form className="card card-wide" onSubmit={submit(false)}>
      <h2 className="section-title">Ban or unban an account</h2>
      <div className="field">
        <label htmlFor="mod-username">Username</label>
        <input
          id="mod-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="mod-reason">Reason (kept in the audit log)</label>
        <input
          id="mod-reason"
          value={reason}
          maxLength={500}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </div>
      {ban.error && <p className="form-error">{ban.error.message}</p>}
      {done && <p className="notice">{done}</p>}
      <div className="reply-actions">
        <button
          type="submit"
          className="button button-small danger-button"
          disabled={!ready || ban.isPending}
        >
          Ban
        </button>
        <button
          type="button"
          className="button button-small button-secondary"
          disabled={!ready || ban.isPending}
          onClick={() => {
            submit(true)();
          }}
        >
          Unban
        </button>
      </div>
    </form>
  );
}
