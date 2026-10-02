import { type Post, VOTING_ACCOUNT_AGE_HOURS } from "@perspective/shared";
import { Link } from "react-router";
import { useCurrentUser } from "../auth";
import { useMyStance, useVote } from "../posts";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

// Why the reader can't vote yet, or null if they can.
function blockedReason(
  user: { emailVerified: boolean; createdAt: string } | null | undefined,
  hasStance: boolean,
): string | null {
  if (!user) return null;
  if (!user.emailVerified) return "Verify your email to vote";
  const votingFrom =
    new Date(user.createdAt).getTime() +
    VOTING_ACCOUNT_AGE_HOURS * 60 * 60 * 1000;
  if (Date.now() < votingFrom) {
    return `New accounts can vote from ${dateTimeFormat.format(votingFrom)}`;
  }
  if (!hasStance) return "Choose where you stand to vote";
  return null;
}

export function HelpfulButton({ post, slug }: { post: Post; slug: string }) {
  const { data: user } = useCurrentUser();
  const myStance = useMyStance(slug, Boolean(user));
  const vote = useVote(slug);
  const isOwn = Boolean(user && post.author?.username === user.username);
  const count = (
    <span className="helpful-count">
      {post.helpfulCount === 1
        ? "1 person found this helpful"
        : `${String(post.helpfulCount)} people found this helpful`}
    </span>
  );

  if (!user) {
    return (
      <div className="helpful">
        <Link to="/login" className="helpful-button">
          Helped me understand
        </Link>
        {count}
      </div>
    );
  }

  if (isOwn) return <div className="helpful">{count}</div>;

  const reason = blockedReason(user, Boolean(myStance.data?.stance));
  return (
    <div className="helpful">
      <button
        type="button"
        className="helpful-button"
        aria-pressed={post.votedByMe}
        disabled={reason !== null || vote.isPending}
        title={reason ?? undefined}
        onClick={() => {
          vote.mutate({ postId: post.id, voted: !post.votedByMe });
        }}
      >
        {post.votedByMe ? "✓ Helped me understand" : "Helped me understand"}
      </button>
      {count}
      {reason && <p className="field-hint">{reason}</p>}
      {vote.error && <p className="form-error">{vote.error.message}</p>}
    </div>
  );
}
