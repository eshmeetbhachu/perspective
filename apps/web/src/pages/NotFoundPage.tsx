import { Link } from "react-router";
import { usePageTitle } from "../title";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>This page doesn't exist.</h1>
      <p>The link may be old, or the page may have been removed.</p>
      <div className="not-found-actions">
        <Link to="/" className="button button-inline">
          Go to the front page
        </Link>
        <Link to="/questions" className="button button-outline button-inline">
          Browse questions
        </Link>
      </div>
    </div>
  );
}
