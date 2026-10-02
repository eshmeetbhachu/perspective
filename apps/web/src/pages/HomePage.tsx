import { STANCES } from "@perspective/shared";
import { Link } from "react-router";
import { useCurrentUser } from "../auth";

export function HomePage() {
  const { data: user } = useCurrentUser();

  return (
    <section className="hero">
      <h1>Understand a view before you argue with it.</h1>
      <p className="lead">
        Every question on Perspective is split into three sides. Read the
        reasoning on each one, and debate only inside challenges.
      </p>
      <ul className="stances">
        {STANCES.map((stance) => (
          <li key={stance} className={`stance stance-${stance}`}>
            {stance}
          </li>
        ))}
      </ul>
      {user ? (
        <Link to="/account" className="button">
          Go to your account
        </Link>
      ) : (
        <Link to="/signup" className="button">
          Join Perspective
        </Link>
      )}
    </section>
  );
}
