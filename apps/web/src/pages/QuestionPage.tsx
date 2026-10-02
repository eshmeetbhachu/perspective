import { STANCES } from "@perspective/shared";
import { Link, useParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { PostColumn } from "../components/PostColumn";
import { formatDate } from "../components/QuestionCard";
import { StancePicker } from "../components/StancePicker";
import { useMyStance } from "../posts";
import { useQuestion } from "../questions";

export function QuestionPage() {
  const { slug = "" } = useParams();
  const { data, isPending, error } = useQuestion(slug);
  const { data: user } = useCurrentUser();
  const myStance = useMyStance(slug, Boolean(user));

  if (isPending) return <p className="muted">Loading…</p>;

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <section className="card">
        <h1>{notFound ? "Question not found" : "Something went wrong"}</h1>
        <p className="muted">
          {notFound
            ? "It may have been removed, or the link is wrong."
            : "Try again in a moment."}
        </p>
        <Link to="/">Browse questions</Link>
      </section>
    );
  }

  const { question } = data;
  return (
    <article className="question-page">
      <header className="question-header">
        <h1>{question.title}</h1>
        <p className="question-meta">
          Asked by{" "}
          {question.author ? question.author.username : "a deleted account"} ·{" "}
          {formatDate(question.createdAt)}
        </p>
        {question.description && (
          <p className="question-description">{question.description}</p>
        )}
      </header>

      <StancePicker slug={slug} />

      <div className="columns">
        {STANCES.map((stance) => (
          <PostColumn
            key={stance}
            slug={slug}
            stance={stance}
            canWrite={myStance.data?.stance === stance}
          />
        ))}
      </div>
    </article>
  );
}
