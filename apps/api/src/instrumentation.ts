import { register } from "node:module";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { env } from "./config/env";

// Tracing (Phase 9, D73). Loaded before the app with
// `node --import ./dist/instrumentation.js dist/server.js`, because the
// Postgres and Redis libraries can only be traced if they are patched before
// the app imports them. Does nothing without OTEL_EXPORTER_OTLP_ENDPOINT.
if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Lets the instrumentations see ES module imports, not only require().
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    }),
    // Spans are sent in batches in the background, not one per request.
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        // One span for the request and one for the handler, not one per hook.
        instrumentHooks: false,
        ignorePaths: (route) => route.url.startsWith("/health"),
        requestHook: (span, request) => {
          span.updateName(
            `${request.method} ${request.routeOptions.url ?? "unknown"}`,
          );
        },
      }),
    ],
  });
}
