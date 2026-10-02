import type { Question } from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCurrentUser } from "../auth";
import { QuestionCard } from "../components/QuestionCard";
import { useLatestQuestions, useQuestionSearch } from "../questions";

export function HomePage() {
  const { data: user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";

  return (
    <>
      {!user && (
        <section className="hero hero-compact">
          <h1>Understand a view before you argue with it.</h1>
          <p className="lead">
            Every question is split into For, Neutral and Against. Read the
            reasoning on each side, and debate only inside challenges.
          </p>
        </section>
      )}

      <div className="toolbar">
        <SearchForm
          key={query}
          initial={query}
          onSearch={(q) => {
            setSearchParams(q ? { q } : {});
          }}
        />
        <Link to="/ask" className="button button-small">
          Ask a question
        </Link>
      </div>

      {query.length >= 2 ? (
        <SearchResults query={query} />
      ) : (
        <LatestQuestions />
      )}
    </>
  );
}

// Keyed by the current query, so it resets when the URL changes elsewhere.
function SearchForm({
  initial,
  onSearch,
}: {
  initial: string;
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState(initial);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(draft.trim());
  }

  return (
    <form className="search" role="search" onSubmit={handleSubmit}>
      <input
        type="search"
        aria-label="Search questions"
        placeholder="Search questions"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
      />
      <button type="submit" className="button button-small">
        Search
      </button>
    </form>
  );
}

function QuestionList({ questions }: { questions: Question[] }) {
  return (
    <ul className="question-list">
      {questions.map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
    </ul>
  );
}

function LatestQuestions() {
  const latest = useLatestQuestions();

  if (latest.isPending) return <p className="muted">Loading questions…</p>;
  if (latest.isError) {
    return <p className="form-error">Couldn't load questions.</p>;
  }

  const questions = latest.data.pages.flatMap((page) => page.questions);
  if (questions.length === 0) {
    return (
      <p className="empty">
        No questions yet. <Link to="/ask">Ask the first one.</Link>
      </p>
    );
  }

  return (
    <>
      <h2 className="section-title">Latest questions</h2>
      <QuestionList questions={questions} />
      {latest.hasNextPage && (
        <button
          type="button"
          className="button button-secondary"
          disabled={latest.isFetchingNextPage}
          onClick={() => {
            void latest.fetchNextPage();
          }}
        >
          {latest.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

function SearchResults({ query }: { query: string }) {
  const search = useQuestionSearch(query);

  if (search.isPending) return <p className="muted">Searching…</p>;
  if (search.isError) return <p className="form-error">Search failed.</p>;

  return (
    <>
      <h2 className="section-title">Results for “{query}”</h2>
      {search.data.questions.length === 0 ? (
        <p className="empty">
          Nothing matches yet. <Link to="/ask">Ask it yourself.</Link>
        </p>
      ) : (
        <QuestionList questions={search.data.questions} />
      )}
    </>
  );
}
