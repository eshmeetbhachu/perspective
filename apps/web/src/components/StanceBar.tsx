import { type Question, STANCES, type Stance } from "@perspective/shared";

type Counts = Question["stanceCounts"];

const LABELS: Record<Stance, string> = {
  for: "For",
  neutral: "Neutral",
  against: "Against",
};

export const countFormat = new Intl.NumberFormat("en-US");

export function totalOf(counts: Counts): number {
  return counts.for + counts.neutral + counts.against;
}

// Whole percentages that always add up to 100.
export function sharesOf(counts: Counts): Record<Stance, number> {
  const total = totalOf(counts) || 1;
  const forShare = Math.round((100 * counts.for) / total);
  const neutralShare = Math.round((100 * counts.neutral) / total);
  return {
    for: forShare,
    neutral: neutralShare,
    against: Math.max(0, 100 - forShare - neutralShare),
  };
}

// How a question's readers split between the three sides.
export function StanceBar({
  counts,
  labels = true,
}: {
  counts: Counts;
  labels?: boolean;
}) {
  if (totalOf(counts) === 0) {
    return <p className="stance-bar-empty">No one has taken a side yet</p>;
  }
  const shares = sharesOf(counts);
  return (
    <div className="stance-bar">
      <div
        className="stance-bar-track"
        role="img"
        aria-label={STANCES.map((s) => `${String(shares[s])}% ${s}`).join(", ")}
      >
        {STANCES.map((stance) => (
          <span
            key={stance}
            className={`stance-bar-${stance}`}
            style={{ width: `${String(shares[stance])}%` }}
          />
        ))}
      </div>
      {labels && (
        <div className="stance-bar-labels" aria-hidden="true">
          {STANCES.map((stance) => (
            <span key={stance} className={`stance-text-${stance}`}>
              {shares[stance]}% {LABELS[stance]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The question page's larger version, with the number of people per side.
export function StanceSummary({ counts }: { counts: Counts }) {
  const total = totalOf(counts);
  const shares = sharesOf(counts);
  return (
    <section className="stance-summary" aria-label="Where people stand">
      <p className="eyebrow muted-eyebrow">
        {total === 0
          ? "Nobody has taken a side yet"
          : `Where ${countFormat.format(total)} ${total === 1 ? "person stands" : "people stand"}`}
      </p>
      <StanceBar counts={counts} labels={false} />
      <div className="stance-summary-numbers">
        {STANCES.map((stance) => (
          <div key={stance}>
            <span className={`stance-summary-share stance-text-${stance}`}>
              {total === 0 ? "–" : `${String(shares[stance])}%`}
            </span>
            <span className="stance-summary-label">{LABELS[stance]}</span>
            <span className="stance-summary-count">
              {countFormat.format(counts[stance])}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
