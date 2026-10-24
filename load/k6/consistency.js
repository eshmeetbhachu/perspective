// Read-your-writes check for the read replica (Phase 9): vote or unvote, then
// read the post's column right away, as the voter and as a logged-out visitor.
// Both must already show the change, even when the replica lags behind.
//
//   docker compose --profile load run --rm k6 run /load/k6/consistency.js
import { check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import http from "k6/http";
import { Counter } from "k6/metrics";

const API = __ENV.API_URL || "http://api-load:3000";
const ORIGIN = "http://load.test";

const sessions = new SharedArray("sessions", () =>
  JSON.parse(open("../data/fixtures.json")).sessions.filter(
    (s) => s.votable.length > 0,
  ),
);
const staleReads = new Counter("stale_reads");
const checkedReads = new Counter("checked_reads");

export const options = {
  vus: 10,
  duration: __ENV.DURATION || "1m",
  thresholds: { stale_reads: ["count==0"] },
};

function findPost(response, id) {
  if (response.status !== 200) return null;
  return response.json("posts").find((p) => p.id === id) ?? null;
}

export default function () {
  const vu = exec.vu.idInTest;
  const session = sessions[vu % sessions.length];
  const postId =
    session.votable[exec.vu.iterationInScenario % session.votable.length];
  const headers = {
    Origin: ORIGIN,
    Cookie: `session=${session.token}`,
    "X-Forwarded-For": `198.19.${vu % 250}.${exec.vu.iterationInScenario % 250}`,
  };

  const post = http.get(`${API}/posts/${postId}`, { headers });
  if (post.status !== 200) return;
  const { questionSlug, stance, votedByMe } = post.json("post");

  const voted = votedByMe
    ? http.del(`${API}/posts/${postId}/vote`, null, { headers })
    : http.put(`${API}/posts/${postId}/vote`, null, { headers });
  if (!check(voted, { "vote ok": (r) => r.status === 200 })) return;
  const expected = voted.json();

  const column = `${API}/questions/${questionSlug}/posts?stance=${stance}&sort=new&limit=50`;
  const asVoter = findPost(http.get(column, { headers }), postId);
  const asVisitor = findPost(
    http.get(column, {
      headers: { "X-Forwarded-For": headers["X-Forwarded-For"] },
    }),
    postId,
  );
  for (const [seen, mine] of [
    [asVoter, true],
    [asVisitor, false],
  ]) {
    if (!seen) continue;
    checkedReads.add(1);
    const fresh =
      seen.helpfulScore === expected.helpfulScore &&
      (!mine || seen.votedByMe === expected.votedByMe);
    if (!fresh) staleReads.add(1);
  }
}

export function handleSummary(data) {
  const checked = data.metrics.checked_reads?.values.count ?? 0;
  const stale = data.metrics.stale_reads?.values.count ?? 0;
  return {
    stdout: `\nconsistency: ${stale} stale of ${checked} reads right after a write\n`,
  };
}
