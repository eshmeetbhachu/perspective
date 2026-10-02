import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { useChallenge, useThread } from "../challenges";
import { formatDate } from "../components/QuestionCard";
import { ReportButton } from "../components/ReportButton";
import { ReplyForm, Thread } from "../components/Thread";
import { renderMarkdown } from "../markdown";

export function ChallengePage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const root = searchParams.get("root");
  const { data: user } = useCurrentUser();
  const challenge = useChallenge(id);
  const thread = useThread(id, root);
  const body = challenge.data?.challenge.body ?? "";
  const html = useMemo(() => renderMarkdown(body), [body]);

  if (challenge.isPending) return <p className="muted">Loading…</p>;
  if (challenge.error) {
    const notFound =
      challenge.error instanceof ApiError && challenge.error.status === 404;
    return (
      <section className="card">
        <h1>{notFound ? "Challenge not found" : "Something went wrong"}</h1>
        <Link to="/">Browse questions</Link>
      </section>
    );
  }

  const { challenge: current, post, question } = challenge.data;
  const canReply = Boolean(user?.emailVerified);

  return (
    <article className="challenge-page">
      <p className="muted small">
        <Link to={`/q/${question.slug}`}>{question.title}</Link>
      </p>

      <section className="challenged-post">
        <p className="section-title">Challenged post</p>
        {post ? (
          <>
            <Link to={`/posts/${post.id}`} className="question-title">
              {post.title}
            </Link>
            <p className="question-meta">
              <span className={`stance-text-${post.stance}`}>
                {post.stance}
              </span>{" "}
              · {post.author?.username ?? "deleted account"}
            </p>
          </>
        ) : (
          <p className="muted">The author deleted this post.</p>
        )}
      </section>

      <header className="challenge-header">
        <h1>{current.title}</h1>
        <p className="question-meta">
          Challenge by {current.author?.username ?? "a deleted account"}
          {current.authorStance && (
            <>
              {" "}
              (stands{" "}
              <span className={`stance-text-${current.authorStance}`}>
                {current.authorStance}
              </span>
              )
            </>
          )}{" "}
          · {formatDate(current.createdAt)}
        </p>
        <div
          className="markdown"
          // Sanitized by renderMarkdown (DOMPurify).
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {current.author?.username !== user?.username && (
          <div className="post-actions">
            <ReportButton targetType="challenge" targetId={current.id} />
          </div>
        )}
      </header>

      <section className="discussion">
        <h2 className="section-title">Discussion ({current.commentCount})</h2>

        {root ? (
          <p className="notice">
            Showing one branch of the discussion.{" "}
            <Link to={`/c/${id}`}>Back to the full thread</Link>
          </p>
        ) : canReply ? (
          <ReplyForm challengeId={id} />
        ) : (
          <p className="muted">
            {user ? (
              "Verify your email to join the discussion."
            ) : (
              <>
                <Link to="/login">Log in</Link> to join the discussion.
              </>
            )}
          </p>
        )}

        {thread.isPending && <p className="muted">Loading discussion…</p>}
        {thread.isError && (
          <p className="form-error">Couldn't load the discussion.</p>
        )}
        {thread.data?.comments.length === 0 && !root && (
          <p className="muted">No replies yet. Start the discussion.</p>
        )}
        {thread.data && (
          <Thread
            comments={thread.data.comments}
            challengeId={id}
            canReply={canReply}
          />
        )}
      </section>
    </article>
  );
}
