import { Link, useParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { usePostChallenges } from "../challenges";
import { PostCard } from "../components/PostCard";
import { formatDate } from "../components/QuestionCard";
import { usePost } from "../posts";

export function PostPage() {
  const { id = "" } = useParams();
  const { data: user } = useCurrentUser();
  const post = usePost(id);
  const challenges = usePostChallenges(id);

  if (post.isPending) return <p className="muted">Loading…</p>;
  if (post.error) {
    const notFound =
      post.error instanceof ApiError && post.error.status === 404;
    return (
      <section className="card">
        <h1>{notFound ? "Post not found" : "Something went wrong"}</h1>
        <Link to="/">Browse questions</Link>
      </section>
    );
  }

  const current = post.data.post;
  const isOwn = current.author?.username === user?.username;

  return (
    <article className="post-page">
      <p className="muted small">
        <Link to={`/q/${current.questionSlug}`}>Back to the question</Link>
      </p>
      <ul className="post-list post-page-card">
        <PostCard post={current} />
      </ul>

      <section className="discussion">
        <div className="column-header">
          <h2 className="section-title">
            Challenges ({challenges.data?.challenges.length ?? 0})
          </h2>
          {user && !isOwn && (
            <Link to={`/posts/${id}/challenge`} className="button button-small">
              Challenge this post
            </Link>
          )}
        </div>
        {challenges.data?.challenges.length === 0 && (
          <p className="muted">
            Nobody has challenged this post yet. Debate on Perspective happens
            only inside challenges.
          </p>
        )}
        <ul className="question-list">
          {challenges.data?.challenges.map((challenge) => (
            <li key={challenge.id} className="question-card">
              <Link to={`/c/${challenge.id}`} className="question-title">
                {challenge.title}
              </Link>
              <p className="question-meta">
                {challenge.author?.username ?? "deleted account"} ·{" "}
                {formatDate(challenge.createdAt)} · {challenge.commentCount}{" "}
                {challenge.commentCount === 1 ? "reply" : "replies"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
