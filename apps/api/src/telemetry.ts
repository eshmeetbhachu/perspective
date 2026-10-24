import { createServer } from "node:http";
import type { FastifyInstance } from "fastify";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";
import { env } from "./config/env";

// Metrics (Phase 9, D73); tracing is set up in instrumentation.ts. Both are off
// unless configured, so the deployed site exposes and sends nothing.

// --- Metrics: Prometheus scrapes METRICS_PORT, which is never published. ---

export const metrics = new Registry();
collectDefaultMetrics({ register: metrics });

const requestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Time to answer a request, by route",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metrics],
});

export const cacheLookups = new Counter({
  name: "cache_lookups_total",
  help: "Response cache lookups for logged-out visitors",
  labelNames: ["result"],
  registers: [metrics],
});

export const cachedRouteReads = new Counter({
  name: "cached_route_reads_total",
  help: "Database reads by cacheable routes, by which database answered",
  labelNames: ["database"],
  registers: [metrics],
});

export function recordRequests(app: FastifyInstance): void {
  app.addHook("onResponse", async (request, reply) => {
    requestDuration.observe(
      {
        method: request.method,
        // The route pattern (/posts/:id), not the URL, so ids don't create
        // a new time series each.
        route: request.routeOptions.url ?? "unknown",
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });
}

export function startMetricsServer(): void {
  if (!env.METRICS_PORT) return;
  createServer((request, response) => {
    if (request.url !== "/metrics") {
      response.writeHead(404).end();
      return;
    }
    metrics
      .metrics()
      .then((body) => {
        response.writeHead(200, { "content-type": metrics.contentType });
        response.end(body);
      })
      .catch(() => response.writeHead(500).end());
  }).listen(env.METRICS_PORT, "0.0.0.0");
}
