import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { env } from "./config/env";

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
  }
}

const versionKey = (scope: CacheScope) => `version:${scope}`;

export async function bumpCache(
  log: FastifyBaseLogger,
  ...scopes: CacheScope[]
): Promise<void> {
  if (!redis) return;
  try {
    await redis.pipeline(scopes.map((s) => ["incr", versionKey(s)])).exec();
  } catch (err) {
    log.warn({ err, scopes }, "could not invalidate cache");
  }
}

// preHandler: answer from the cache, or remember the key to fill it later.
export async function serveFromCache(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const config = request.routeOptions.config.cache;
  if (!redis || !config || request.user || request.method !== "GET") return;

  let cached: string | null;
  try {
    const scopes = config.scopes(request);
    const versions = await redis.mget(scopes.map(versionKey));
    const tag = scopes.map((s, i) => `${s}@${versions[i] ?? "0"}`).join(",");
    request.cacheKey = `cache:${tag}:${request.url}`;
    cached = await redis.get(request.cacheKey);
  } catch (err) {
    request.log.warn({ err }, "cache unavailable");
    return;
  }

  if (cached === null) {
    reply.header("x-cache", "miss");
    return;
  }
  // Already serialised JSON: sent as is, skipping the database and the
  // serialiser.
  request.cacheKey = null;
  return reply
    .header("x-cache", "hit")
    .type("application/json; charset=utf-8")
    .send(cached);
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
