import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { env } from "./config/env";
import { db, type Executor, pool, replicaDb, replicaPool } from "./db/client";
import { cachedRouteReads, cacheLookups } from "./telemetry";

// Shared cache for responses that are identical for every logged-out visitor
// (Phase 9, D67). Without REDIS_URL nothing is cached.
export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      // Fail fast when Redis is down: a cache miss is better than a hang.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })
  : null;

// Every cached response belongs to scopes. Changing something bumps its
// scope's version number, so keys built with the old number are never read
// again and simply expire. "moderation" is shared by everything: removals
// are rare, so they invalidate the whole cache.
export type CacheScope = "questions" | "moderation" | `question:${string}`;

export interface CacheConfig {
  ttlSeconds: number;
  scopes: (request: FastifyRequest) => CacheScope[];
}

declare module "fastify" {
  interface FastifyContextConfig {
    cache?: CacheConfig;
  }
  interface FastifyRequest {
    cacheKey: string | null;
    // The replica has replayed every write this route's data depends on.
    readFromReplica: boolean;
  }
}

const versionKey = (scope: CacheScope) => `version:${scope}`;
// Where the scope's latest write ends in the primary's write-ahead log
// (a byte position), so readers can tell whether the replica has it yet.
const lsnKey = (scope: CacheScope) => `lsn:${scope}`;

// Atomic, so two writers bumping together can't lower the recorded position.
const BUMP_SCRIPT = `
local n = tonumber(ARGV[2])
for i = 1, n do
  redis.call("INCR", KEYS[i])
  if ARGV[1] ~= "" and tonumber(ARGV[1]) > tonumber(redis.call("GET", KEYS[n + i]) or "0") then
    redis.call("SET", KEYS[n + i], ARGV[1])
  end
end`;

// Called after the write commits.
export async function bumpCache(
  log: FastifyBaseLogger,
  ...scopes: CacheScope[]
): Promise<void> {
  if (!redis) return;
  try {
    let lsn = "";
    if (replicaPool) {
      const { rows } = await pool.query<{ lsn: string }>(
        "select (pg_current_wal_lsn() - '0/0')::text as lsn",
      );
      lsn = rows[0]?.lsn ?? "";
    }
    await redis.eval(
      BUMP_SCRIPT,
      scopes.length * 2,
      ...scopes.map(versionKey),
      ...scopes.map(lsnKey),
      lsn,
      String(scopes.length),
    );
  } catch (err) {
    log.warn({ err, scopes }, "could not invalidate cache");
  }
}

// The furthest position any of the scopes needs; null if none was recorded.
export function neededPosition(positions: (string | null)[]): bigint {
  return positions.reduce(
    (max, p) => (p !== null && BigInt(p) > max ? BigInt(p) : max),
    0n,
  );
}

async function replicaHasReplayed(position: bigint): Promise<boolean> {
  if (!replicaPool) return false;
  const { rows } = await replicaPool.query<{ ok: boolean | null }>(
    "select pg_last_wal_replay_lsn() - '0/0' >= $1::numeric as ok",
    [position.toString()],
  );
  return rows[0]?.ok === true;
}

// preHandler: answer logged-out visitors from the cache. On a miss, decide
// whether the replica is up to date enough to answer instead of the primary.
export async function serveFromCache(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const config = request.routeOptions.config.cache;
  if (!redis || !config || request.method !== "GET") return;

  let cached: string | null = null;
  try {
    const scopes = config.scopes(request);
    const values = await redis.mget([
      ...scopes.map(versionKey),
      ...scopes.map(lsnKey),
    ]);
    if (!request.user) {
      const tag = scopes.map((s, i) => `${s}@${values[i] ?? "0"}`).join(",");
      request.cacheKey = `cache:${tag}:${request.url}`;
      cached = await redis.get(request.cacheKey);
    }
    if (cached === null) {
      request.readFromReplica = await replicaHasReplayed(
        neededPosition(values.slice(scopes.length)),
      );
    }
  } catch (err) {
    request.log.warn({ err }, "cache or replica unavailable");
    return;
  }

  if (cached === null) {
    if (request.cacheKey) {
      cacheLookups.inc({ result: "miss" });
      reply.header("x-cache", "miss");
    }
    return;
  }
  cacheLookups.inc({ result: "hit" });
  // Already serialised JSON: sent as is, skipping the database and the
  // serialiser.
  request.cacheKey = null;
  return reply
    .header("x-cache", "hit")
    .type("application/json; charset=utf-8")
    .send(cached);
}

// Which database a cached route reads from (D71).
export function readerFor(request: FastifyRequest): Executor {
  const reader = request.readFromReplica && replicaDb ? replicaDb : db;
  cachedRouteReads.inc({ database: reader === db ? "primary" : "replica" });
  return reader;
}

// onSend: store the serialised body of a successful miss.
export async function storeInCache(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
) {
  const ttl = request.routeOptions.config.cache?.ttlSeconds;
  if (
    redis &&
    request.cacheKey &&
    ttl &&
    reply.statusCode === 200 &&
    typeof payload === "string"
  ) {
    redis.set(request.cacheKey, payload, "EX", ttl).catch((err: unknown) => {
      request.log.warn({ err }, "could not store in cache");
    });
  }
  return payload;
}

// The question list and search change when questions are added or removed.
export const questionListCache: CacheConfig = {
  ttlSeconds: 600,
  scopes: () => ["questions", "moderation"],
};

// One question's page and columns change with its posts, votes and
// challenges. The slug was already validated by the route's schema.
export const questionCache: CacheConfig = {
  ttlSeconds: 600,
  scopes: (request) => {
    const { slug } = request.params as { slug: string };
    return [`question:${slug}`, "moderation"];
  },
};
