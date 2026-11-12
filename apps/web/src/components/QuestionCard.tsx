import type { Question } from "@perspective/shared";
import { Link } from "react-router";
import { countFormat, StanceBar, totalOf } from "./StanceBar";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

function activity(question: Question): string {
  const people = totalOf(question.stanceCounts);
  return `${countFormat.format(people)} ${people === 1 ? "person" : "people"} · ${countFormat.format(question.postCount)} ${question.postCount === 1 ? "post" : "posts"}`;
}

// "row" for the browse page, "tile" for the landing page's grid.
export function QuestionCard({
  question,
  variant = "row",
}: {
  question: Question;
  variant?: "row" | "tile";
}) {
  if (variant === "tile") {
    return (
      <li className="question-tile">
        <Link to={`/q/${question.slug}`}>
          <h3 className="question-title">{question.title}</h3>
          <StanceBar counts={question.stanceCounts} />
          <p className="question-meta">{activity(question)}</p>
        </Link>
      </li>
    );
  }

  return (
    <li className="question-card">
      <Link to={`/q/${question.slug}`}>
        <div className="question-card-main">
          <h2 className="question-title">{question.title}</h2>
          {question.description && (
            <p className="question-snippet">{question.description}</p>
          )}
          <p className="question-meta">
            {activity(question)} · asked {formatDate(question.createdAt)}
          </p>
        </div>
        <div className="question-card-split">
          <StanceBar counts={question.stanceCounts} />
        </div>
      </Link>
    </li>
  );
}
