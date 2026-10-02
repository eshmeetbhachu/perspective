import type { Question } from "@perspective/shared";
import { Link } from "react-router";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function QuestionCard({ question }: { question: Question }) {
  return (
    <li className="question-card">
      <Link to={`/q/${question.slug}`} className="question-title">
        {question.title}
      </Link>
      {question.description && (
        <p className="question-snippet">{question.description}</p>
      )}
      <p className="question-meta">
        {question.author ? question.author.username : "deleted account"} ·{" "}
        {formatDate(question.createdAt)}
      </p>
    </li>
  );
}
