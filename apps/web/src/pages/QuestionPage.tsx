import { STANCES } from "@perspective/shared";
import { Link, useParams } from "react-router";
import { ApiError } from "../api";
import { formatDate } from "../components/QuestionCard";
import { useQuestion } from "../questions";

export function QuestionPage() {
  const { slug = "" } = useParams();
  const { data, isPending, error } = useQuestion(slug);

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

      <div className="columns">
        {STANCES.map((stance) => (
          <section key={stance} className={`column column-${stance}`}>
            <h2 className={`stance stance-${stance}`}>{stance}</h2>
            <p className="muted">No perspectives yet.</p>
          </section>
        ))}
      </div>
    </article>
  );
}
