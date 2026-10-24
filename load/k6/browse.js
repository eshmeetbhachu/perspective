// Simulated visitors browsing Perspective. Each iteration is one visit:
// home page, sometimes a search, a question with its three columns, often a
// post, sometimes a challenge thread; logged-in visitors sometimes vote.
//
//   docker compose --profile load run --rm k6 run -e RATE=50 /load/k6/browse.js
//
// RATE = new visits per second, DURATION = how long to keep that rate.
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import http from "k6/http";
import { Rate } from "k6/metrics";

const API = __ENV.API_URL || "http://api-load:3000";
const ORIGIN = "http://load.test";
const RATE = Number(__ENV.RATE || 20);
const DURATION = __ENV.DURATION || "2m";
const LABEL = __ENV.LABEL || "baseline";

const fixtures = () => JSON.parse(open("../data/fixtures.json"));
const slugs = new SharedArray("slugs", () => fixtures().slugs);
const postIds = new SharedArray("posts", () => fixtures().postIds);
const challengeIds = new SharedArray(
  "challenges",
  () => fixtures().challengeIds,
);
const sessions = new SharedArray("sessions", () => fixtures().sessions);

const SEARCH_TERMS = [
  "cities",
  "schools",
  "energy",
  "AI",
  "privacy",
  "transport",
  "voting",
  "health",
  "plastic",
  "work",
];
const ENDPOINTS = [
  "GET /questions",
  "GET /auth/me",
  "GET /notifications/unread-count",
  "GET /questions/search",
  "GET /questions/:slug",
  "GET /questions/:slug/posts",
  "GET /questions/:slug/stance",
  "GET /posts/:id",
  "GET /posts/:id/challenges",
  "GET /challenges/:id",
  "GET /challenges/:id/comments",
  "PUT /posts/:id/vote",
];

export const options = {
  scenarios: {
    visits: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(50, RATE * 10),
      maxVUs: Math.max(200, RATE * 40),
    },
  },
  // Listing each endpoint makes k6 report its latency separately.
  thresholds: Object.fromEntries([
    ["http_req_failed", ["rate<0.01"]],
    ...ENDPOINTS.map((name) => [
      `http_req_duration{name:${name}}`,
      ["p(95)<1000"],
    ]),
  ]),
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
};

// Logged-out visitors get 401 from /auth/me; that's an answer, not a failure.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 401));

const pick = (items) => items[Math.floor(Math.random() * items.length)];
// Popular questions get most of the traffic, like on a real site.
const popularSlug = () => slugs[Math.floor(slugs.length * Math.random() ** 3)];
const think = (min, max) => sleep(min + Math.random() * (max - min));

function visitor() {
  const id = exec.vu.idInTest;
  // 198.18.0.0/15 is reserved for benchmarks: every simulated visitor gets
  // its own address, so per-IP rate limits apply per visitor.
  const headers = {
    "X-Forwarded-For": `198.18.${Math.floor(id / 250) % 256}.${id % 250}`,
    Origin: ORIGIN,
  };
  const session = id % 10 < 3 ? sessions[id % sessions.length] : null;
  if (session) headers.Cookie = `session=${session.token}`;
  return { headers, session };
}

function get(path, name, headers) {
  return ["GET", `${API}${path}`, null, { headers, tags: { name } }];
}

// Share of cacheable responses (those with an X-Cache header) that were hits.
const cacheHits = new Rate("cache_hits");

function expectOk(responses) {
  for (const r of responses) {
    const cache = r.headers["X-Cache"];
    if (cache) cacheHits.add(cache === "hit");
    check(r, { "status ok": (res) => res.status < 400 || res.status === 401 });
  }
}

export default function () {
  const { headers, session } = visitor();

  const home = [
    get("/questions", "GET /questions", headers),
    get("/auth/me", "GET /auth/me", headers),
  ];
  if (session)
    home.push(
      get(
        "/notifications/unread-count",
        "GET /notifications/unread-count",
        headers,
      ),
    );
  expectOk(http.batch(home));
  think(1, 3);

  if (Math.random() < 0.3) {
    expectOk([
      http.get(`${API}/questions/search?q=${pick(SEARCH_TERMS)}`, {
        headers,
        tags: { name: "GET /questions/search" },
      }),
    ]);
    think(1, 2);
  }

  const slug = popularSlug();
  const roll = Math.random();
  const sort = roll < 0.7 ? "top" : roll < 0.9 ? "hot" : "new";
  const question = [
    get(`/questions/${slug}`, "GET /questions/:slug", headers),
    ...["for", "neutral", "against"].map((stance) =>
      get(
        `/questions/${slug}/posts?stance=${stance}&sort=${sort}`,
        "GET /questions/:slug/posts",
        headers,
      ),
    ),
  ];
  if (session)
    question.push(
      get(`/questions/${slug}/stance`, "GET /questions/:slug/stance", headers),
    );
  expectOk(http.batch(question));
  think(2, 5);

  if (Math.random() < 0.4) {
    const postId = pick(postIds);
    expectOk(
      http.batch([
        get(`/posts/${postId}`, "GET /posts/:id", headers),
        get(
          `/posts/${postId}/challenges`,
          "GET /posts/:id/challenges",
          headers,
        ),
      ]),
    );
    think(2, 4);
  }

  if (Math.random() < 0.15) {
    const challengeId = pick(challengeIds);
    expectOk(
      http.batch([
        get(`/challenges/${challengeId}`, "GET /challenges/:id", headers),
        get(
          `/challenges/${challengeId}/comments`,
          "GET /challenges/:id/comments",
          headers,
        ),
      ]),
    );
  }

  if (session && session.votable.length > 0 && Math.random() < 0.2) {
    const res = http.put(`${API}/posts/${pick(session.votable)}/vote`, null, {
      headers,
      tags: { name: "PUT /posts/:id/vote" },
    });
    check(res, { "vote ok": (r) => r.status === 200 });
  }
}

// One compact line per endpoint, plus the full numbers as JSON for the write-up.
export function handleSummary(data) {
  const ms = (v) => (v === undefined ? "-" : `${v.toFixed(0)}ms`.padStart(7));
  const lines = [`\n${LABEL} @ ${RATE} visits/s for ${DURATION}`];
  const reqs = data.metrics.http_reqs.values;
  lines.push(
    `requests: ${reqs.count} (${reqs.rate.toFixed(0)}/s), failed: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`,
  );
  if (data.metrics.cache_hits) {
    lines.push(
      `cache hits: ${(data.metrics.cache_hits.values.rate * 100).toFixed(1)}% of cacheable responses`,
    );
  }
  lines.push(`${"endpoint".padEnd(36)}    med     p95     p99`);
  for (const name of ["", ...ENDPOINTS]) {
    const metric =
      data.metrics[
        name ? `http_req_duration{name:${name}}` : "http_req_duration"
      ];
    if (!metric) continue;
    const v = metric.values;
    lines.push(
      `${(name || "all requests").padEnd(36)}${ms(v.med)} ${ms(v["p(95)"])} ${ms(v["p(99)"])}`,
    );
  }
  return {
    stdout: `${lines.join("\n")}\n`,
    [`/load/results/${LABEL}-${RATE}.json`]: JSON.stringify(data, null, 2),
  };
}
