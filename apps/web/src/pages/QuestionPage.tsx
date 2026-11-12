import {
  POST_SORTS,
  type PostSort,
  STANCES,
  type Stance,
} from "@perspective/shared";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useCurrentUser } from "../auth";
import { PostColumn } from "../components/PostColumn";
import { formatDate } from "../components/QuestionCard";
import { ReportButton } from "../components/ReportButton";
import { StanceSummary } from "../components/StanceBar";
import { StancePicker } from "../components/StancePicker";
import { useMyStance } from "../posts";
import { useQuestion } from "../questions";
import { usePageTitle } from "../title";

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
  // On a phone the columns become tabs, one side at a time.
  const [shown, setShown] = useState<Stance>("for");
  usePageTitle(data?.question.title ?? null);

  if (isPending) {
    return (
      <div>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div>
        <section className="card">
          <h1>{notFound ? "Question not found" : "Something went wrong"}</h1>
          <p className="muted">
            {notFound
              ? "It may have been removed, or the link is wrong."
              : "Try again in a moment."}
          </p>
          <Link to="/questions">Browse questions</Link>
        </section>
      </div>
    );
  }

  const { question } = data;
  return (
    <article className="question-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/questions">Questions</Link>
        <span aria-hidden="true">/</span>
        <span>{question.title}</span>
      </nav>

      <div className="question-top">
        <header className="question-header">
          <h1>{question.title}</h1>
          {question.description && (
            <p className="question-description">{question.description}</p>
          )}
          <p className="question-meta">
            Asked by{" "}
            {question.author ? question.author.username : "a deleted account"} ·{" "}
            {formatDate(question.createdAt)}
          </p>
          {question.author?.username !== user?.username && (
            <div className="post-actions">
              <ReportButton targetType="question" targetId={question.id} />
            </div>
          )}
        </header>
        <StanceSummary counts={question.stanceCounts} />
      </div>

      <StancePicker slug={slug} />

      <div className="sort-bar" role="group" aria-label="Sort posts">
        <span className="muted">Sort posts by</span>
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

      <div className="column-tabs" role="group" aria-label="Show a side">
        {STANCES.map((stance) => (
          <button
            key={stance}
            type="button"
            className={`column-tab column-tab-${stance}`}
            aria-pressed={stance === shown}
            onClick={() => {
              setShown(stance);
            }}
          >
            {stance}
          </button>
        ))}
      </div>

      <div className="columns" data-shown={shown}>
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
