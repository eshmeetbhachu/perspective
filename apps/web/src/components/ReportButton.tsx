import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from "@perspective/shared";
import { type SubmitEvent, useId, useState } from "react";
import { useCurrentUser } from "../auth";
import { useReport } from "../moderation";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: ReportTarget;
  targetId: string;
}) {
  const { data: user } = useCurrentUser();
  const report = useReport();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const name = useId();

  if (!user) return null;

  if (report.isSuccess) {
    return (
      <span className="muted small">Reported. A moderator will review it.</span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link-button muted"
        onClick={() => {
          setOpen(true);
        }}
      >
        Report
      </button>
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || reason === "automated") return;
    report.mutate({ targetType, targetId, reason, details });
  }

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      <fieldset>
        <legend>What's wrong with it?</legend>
        {REPORT_REASONS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={reason === option}
              onChange={() => {
                setReason(option);
              }}
            />{" "}
            {REPORT_REASON_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <textarea
        aria-label="Anything else moderators should know (optional)"
        placeholder="Anything else moderators should know (optional)"
        rows={2}
        maxLength={1000}
        value={details}
        onChange={(e) => {
          setDetails(e.target.value);
        }}
      />
      {report.error && <p className="form-error">{report.error.message}</p>}
      <div className="reply-actions">
        <button
          type="submit"
          className="button button-small"
          disabled={!reason || report.isPending}
        >
          Send report
        </button>
        <button
          type="button"
          className="link-button small"
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
