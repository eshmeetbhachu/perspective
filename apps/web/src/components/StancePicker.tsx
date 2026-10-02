import { STANCES, type Stance } from "@perspective/shared";
import { useState } from "react";
import { Link } from "react-router";
import { useCurrentUser } from "../auth";
import { useMyStance, useSetStance } from "../posts";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function StancePicker({ slug }: { slug: string }) {
  const { data: user } = useCurrentUser();
  const myStance = useMyStance(slug, Boolean(user));
  const setStance = useSetStance(slug);
  const [choice, setChoice] = useState<Stance | null>(null);

  if (!user) {
    return (
      <p className="stance-picker muted">
        <Link to="/login">Log in</Link> to say where you stand and write a post.
      </p>
    );
  }
  if (!myStance.data) return null;

  const { stance, changeableAt } = myStance.data;
  const locked = changeableAt !== null;

  if (choice) {
    return (
      <div className="stance-picker">
        <p>
          {stance ? "Change your stance to " : "Your stance: "}
          <strong className={`stance-text-${choice}`}>{choice}</strong>?{" "}
          <span className="muted">You can change it once a day.</span>
        </p>
        <div className="stance-actions">
          <button
            type="button"
            className="button button-small"
            disabled={setStance.isPending}
            onClick={() => {
              setStance.mutate(choice, {
                onSuccess: () => {
                  setChoice(null);
                },
              });
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            className="button button-small button-secondary"
            onClick={() => {
              setChoice(null);
              setStance.reset();
            }}
          >
            Cancel
          </button>
        </div>
        {setStance.error && (
          <p className="form-error">{setStance.error.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="stance-picker">
      <p>{stance ? "You stand:" : "Where do you stand?"}</p>
      <div className="stance-buttons" role="group" aria-label="Your stance">
        {STANCES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === stance}
            className={`stance stance-${option} stance-button`}
            disabled={option === stance || (stance !== null && locked)}
            onClick={() => {
              setChoice(option);
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {stance && locked && (
        <p className="muted small">
          You can change it after{" "}
          {dateTimeFormat.format(new Date(changeableAt))}.
        </p>
      )}
    </div>
  );
}
