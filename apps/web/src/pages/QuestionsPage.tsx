import {
  QUESTION_SORTS,
  type Question,
  type QuestionSort,
} from "@perspective/shared";
import { type SubmitEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { QuestionCard } from "../components/QuestionCard";
import { useQuestionList, useQuestionSearch } from "../questions";
import { usePageTitle } from "../title";

const SORT_LABELS: Record<QuestionSort, string> = {
  new: "Newest",
  active: "Most active",
  divided: "Most divided",
};

export function QuestionsPage() {
  usePageTitle("Questions");
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const sortParam = searchParams.get("sort");
  const sort = QUESTION_SORTS.find((s) => s === sortParam) ?? "new";

  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Questions</h1>
          <p>Find a question, see how people split, and read why.</p>
        </div>
        <Link to="/ask" className="button button-inline">
          Ask a question
        </Link>
      </div>

      <SearchForm
        key={query}
        initial={query}
        onSearch={(q) => {
          setSearchParams(q ? { q } : {});
        }}
      />

      {query.length >= 2 ? (
        <SearchResults query={query} />
      ) : (
        <>
          <div className="sort-bar" role="group" aria-label="Sort questions">
            <span className="muted">Sort by</span>
            {QUESTION_SORTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === sort}
                onClick={() => {
                  setSearchParams(option === "new" ? {} : { sort: option }, {
                    replace: true,
                  });
                }}
              >
                {SORT_LABELS[option]}
              </button>
            ))}
          </div>
          <SortedQuestions sort={sort} />
        </>
      )}
    </div>
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
      <label className="search-box">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          aria-label="Search questions"
          placeholder="Search questions, e.g. voting, transport, AI"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
      </label>
      <button type="submit" className="button button-dark button-inline">
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

function SortedQuestions({ sort }: { sort: QuestionSort }) {
  const list = useQuestionList(sort);

  if (list.isPending) return <p className="muted">Loading questions…</p>;
  if (list.isError) {
    return <p className="form-error">Couldn't load questions.</p>;
  }

  const questions = list.data.pages.flatMap((page) => page.questions);
  if (questions.length === 0) {
    return (
      <p className="empty">
        No questions yet. <Link to="/ask">Ask the first one.</Link>
      </p>
    );
  }

  return (
    <>
      <QuestionList questions={questions} />
      {list.hasNextPage && (
        <button
          type="button"
          className="button button-outline button-inline load-more"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {list.isFetchingNextPage ? "Loading…" : "Show more questions"}
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
