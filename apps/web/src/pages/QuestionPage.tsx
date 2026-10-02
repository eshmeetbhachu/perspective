import { POST_SORTS, type PostSort, STANCES } from "@perspective/shared";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { PostColumn } from "../components/PostColumn";
import { formatDate } from "../components/QuestionCard";
import { StancePicker } from "../components/StancePicker";
import { useMyStance } from "../posts";
import { useQuestion } from "../questions";

const SORT_LABELS: Record<PostSort, string> = {
  top: "Most helpful",
  hot: "Trending",
  new: "Newest",
};

export function QuestionPage() {
  const { slug = "" } = useParams();
  const { data, isPending, error } = useQuestion(slug);
  const { data: user } = useCurrentUser();
  const myStance = useMyStance(slug, Boolean(user));
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort");
  const sort: PostSort = POST_SORTS.find((s) => s === sortParam) ?? "top";

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

      <div className="sort-bar" role="group" aria-label="Sort posts">
        <span className="muted small">Sort by</span>
        {POST_SORTS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === sort}
            onClick={() => {
              setSearchParams(option === "top" ? {} : { sort: option }, {
                replace: true,
              });
            }}
          >
            {SORT_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="columns">
        {STANCES.map((stance) => (
          <PostColumn
            key={stance}
            slug={slug}
            stance={stance}
            sort={sort}
            canWrite={myStance.data?.stance === stance}
          />
        ))}
      </div>
    </article>
  );
}
