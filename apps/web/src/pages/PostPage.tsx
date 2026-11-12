import { CROSS_SIDE_BADGE_MIN } from "@perspective/shared";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { usePostChallenges } from "../challenges";
import { HelpfulButton } from "../components/HelpfulButton";
import { formatDate } from "../components/QuestionCard";
import { ReportButton } from "../components/ReportButton";
import { StanceBar } from "../components/StanceBar";
import { renderMarkdown } from "../markdown";
import { useDeletePost, usePost } from "../posts";
import { useQuestion } from "../questions";
import { usePageTitle } from "../title";

export function PostPage() {
  const { id = "" } = useParams();
  const { data: user } = useCurrentUser();
  const post = usePost(id);
  const challenges = usePostChallenges(id);
  const slug = post.data?.post.questionSlug ?? "";
  const question = useQuestion(slug);
  const deletePost = useDeletePost();
  const navigate = useNavigate();
  const body = post.data?.post.body ?? "";
  const html = useMemo(() => renderMarkdown(body), [body]);
  usePageTitle(post.data?.post.title ?? null);

  if (post.isPending) {
    return (
      <div>
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (post.error) {
    const notFound =
      post.error instanceof ApiError && post.error.status === 404;
    return (
      <div>
        <section className="card">
          <h1>{notFound ? "Post not found" : "Something went wrong"}</h1>
          <Link to="/questions">Browse questions</Link>
        </section>
      </div>
    );
  }

  const current = post.data.post;
  const isOwn = Boolean(user && current.author?.username === user.username);
  const list = challenges.data?.challenges ?? [];
  const questionTitle = question.data?.question.title ?? "The question";

  return (
    <div className="post-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/questions">Questions</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/q/${slug}`}>{questionTitle}</Link>
      </nav>

      <div className="post-layout">
        <div className="post-main">
          <article className={`post-full post-full-${current.stance}`}>
            <div className="post-chips">
              <span className={`stance-chip stance-chip-${current.stance}`}>
                {current.stance}
              </span>
              {current.crossSideCount >= CROSS_SIDE_BADGE_MIN && (
                <span className="badge badge-across">Valued across sides</span>
              )}
            </div>
            <h1>{current.title}</h1>
            <div className="byline">
              <span className="avatar" aria-hidden="true">
                {(current.author?.username ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <span className="byline-name">
                  {current.author ? current.author.username : "deleted account"}
                </span>
                <span className="question-meta">
                  {formatDate(current.createdAt)}
                  {current.editedAt && " · edited"}
                </span>
              </div>
            </div>
            <div
              className="markdown post-body"
              // Sanitized by renderMarkdown (DOMPurify).
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="post-full-footer">
              <HelpfulButton post={current} />
              {current.crossSideCount > 0 && (
                <p className="muted">
                  {current.crossSideCount} of them from other sides
                </p>
              )}
            </div>
            <div className="post-actions">
              {!isOwn && (
                <ReportButton targetType="post" targetId={current.id} />
              )}
              {isOwn && (
                <>
                  <Link to={`/posts/${current.id}/edit`}>Edit</Link>
                  <button
                    type="button"
                    className="link-button danger"
                    disabled={deletePost.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this post? This can't be undone.",
                        )
                      ) {
                        deletePost.mutate(current.id, {
                          onSuccess: () => {
                            void navigate(`/q/${slug}`);
                          },
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </article>

          <section className="challenges">
            <div className="section-heading section-heading-row">
              <div>
                <h2>Challenges · {list.length}</h2>
                <p className="muted">
                  Debate on Perspective happens here, one thread per challenge.
                </p>
              </div>
              {user && !isOwn && (
                <Link
                  to={`/posts/${id}/challenge`}
                  className="button button-outline button-inline"
                >
                  Challenge this post
                </Link>
              )}
            </div>
            {challenges.isSuccess && list.length === 0 && (
              <p className="empty">
                Nobody has challenged this post yet. Debate on Perspective
                happens only inside challenges.
              </p>
            )}
            <ul className="challenge-list">
              {list.map((challenge) => (
                <li key={challenge.id}>
                  <Link to={`/c/${challenge.id}`} className="challenge-row">
                    <div>
                      <span className="challenge-title">{challenge.title}</span>
                      <span className="question-meta">
                        by {challenge.author?.username ?? "deleted account"}
                        {challenge.authorStance &&
                          ` · stands ${challenge.authorStance}`}{" "}
                        · {formatDate(challenge.createdAt)}
                      </span>
                    </div>
                    <span className="count-chip">
                      {challenge.commentCount}{" "}
                      {challenge.commentCount === 1 ? "reply" : "replies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="post-aside">
          <div className="aside-card">
            <p className="eyebrow muted-eyebrow">The question</p>
            <Link to={`/q/${slug}`} className="aside-title">
              {questionTitle}
            </Link>
            {question.data && (
              <StanceBar counts={question.data.question.stanceCounts} />
            )}
            <Link to={`/q/${slug}`} className="text-link">
              Read the other sides
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
