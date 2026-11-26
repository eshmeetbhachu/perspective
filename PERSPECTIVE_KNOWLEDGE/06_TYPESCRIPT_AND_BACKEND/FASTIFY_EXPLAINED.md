# Fastify Explained

Fastify is a Node.js web framework: it listens for HTTP requests, matches them to routes, runs your code, and sends responses. This page explains the Fastify features Perspective relies on.

## 1. An app, routes and handlers

```ts
const app = Fastify({ logger: loggerOptions, trustProxy: ... });
app.get("/health", { logLevel: "warn" }, () => ({ status: "ok" }));
await app.listen({ host: "0.0.0.0", port: 3000 });
```

- Returning an object from a handler sends it as JSON with status 200.
- `reply.status(201).send(body)` sets the status explicitly; `reply.status(204).send()` sends no body.
- Route options (the second argument) configure the route: `schema`, `preHandler`, `config` (custom per-route data such as `rateLimit` and `cache`), `logLevel`.

## 2. Plugins and `register`

A plugin is an `async (app) => { ... }` function that adds routes, hooks or decorations. Every module exports one (`authRoutes`, `postRoutes`, …), and `buildApp` registers them:

```ts
await app.register(helmet); // a third-party plugin
await app.register(postRoutes); // our routes
```

**Encapsulation:** each `register` creates a child context. Hooks and decorations added inside a child apply to that child's routes only, unless the plugin is wrapped with `fastify-plugin`. Perspective uses this deliberately in `moderationRoutes`: the `requireRole("moderator")` hook lives in an inner `register` and protects exactly the routes defined inside.

## 3. The request lifecycle and hooks

```mermaid
flowchart LR
  A[onRequest] --> B[preParsing] --> C[preValidation] --> D[validation] --> E[preHandler] --> F[handler] --> G[preSerialization] --> H[onSend] --> I[onResponse]
```

| Hook         | Perspective uses it for                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `onRequest`  | `requireProxySecret`, `checkOrigin`, `loadSession`: before the body is even parsed, so rejected requests cost little |
| `preHandler` | `serveFromCache` (global) and route guards (`requireVerifiedEmail`, `requireRole`)                                   |
| `onSend`     | `storeInCache`, and the default `Cache-Control: no-store`                                                            |
| `onResponse` | metrics: request duration by route pattern (`telemetry.ts`)                                                          |

A hook can **end the request early**: throwing an `AppError` jumps to the error handler, and `serveFromCache` calls `reply.send(cached)`, after which Fastify skips the handler.

## 4. Validation and serialisation with schemas

Fastify compiles a validator for each route's `schema.body/params/querystring/headers` and a serializer for `schema.response`. Perspective swaps in Zod:

```ts
app.setValidatorCompiler(validatorCompiler); // from fastify-type-provider-zod
app.setSerializerCompiler(serializerCompiler);
```

- Invalid input never reaches the handler; Fastify throws an error with `error.validation`, which `errorHandler` turns into 400 `VALIDATION_FAILED`.
- Zod **transforms** apply: `request.body.email` is already trimmed and lower-cased; `limit` is already a number (`z.coerce`); `sort` has its default.
- The response schema both checks and **strips** unknown properties before sending.

## 5. Decorators

```ts
app.decorateRequest("user", null);
```

Declares a property on every request object (with a default), so its shape is fixed up front (fast) and documented. The TypeScript side is the module augmentation in `plugins/auth.ts`.

## 6. Content-type parsers

Fastify parses `application/json` and `text/plain` by default. `app.removeContentTypeParser("text/plain")` means any non-JSON body gets **415 Unsupported Media Type**: part of the CSRF defence.

## 7. Logging (Pino)

`Fastify({ logger: loggerOptions })` creates a Pino logger. `request.log` is a child logger that tags every line with the request id. Per-route `logLevel: "warn"` silences the normal request logs of chatty routes (health checks, the polled unread count).

## 8. `trustProxy`

Decides whether `request.ip` comes from the TCP connection or from `X-Forwarded-For`. Perspective sets `true` only when `ORIGIN_SECRET` guarantees requests came through Vercel; otherwise a list of trusted addresses (`TRUST_PROXY`), or `false`. Fastify no longer honours a numeric hop count (D58).

## 9. Testing with `inject`

```ts
const app = await buildApp();
const response = await app.inject({
  method: "POST",
  url: "/auth/login",
  payload: { email, password },
  headers: { origin: env.WEB_ORIGIN },
});
expect(response.statusCode).toBe(200);
```

`inject` pushes a fake request through the full pipeline (hooks, validation, handler, serialisation) without opening a port. That's why `buildApp` doesn't call `listen`.

## 10. Graceful close

`await app.close()` stops accepting new connections, waits for in-flight requests, and runs `onClose` hooks. `server.ts` calls it on `SIGTERM`/`SIGINT`.

## 11. Plugins used

| Plugin                      | Configuration in `app.ts`                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fastify/helmet`           | defaults: CSP, HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, Referrer-Policy, …                                          |
| `@fastify/cors`             | `origin: WEB_ORIGIN, credentials: true`                                                                                                            |
| `@fastify/cookie`           | parsing + `reply.setCookie` / `clearCookie`                                                                                                        |
| `@fastify/rate-limit`       | `global: false`; per-route `config.rateLimit`; Redis store if available; `skipOnError: true`; errors built as `AppError(429, "RATE_LIMITED", ...)` |
| `fastify-type-provider-zod` | validator/serializer compilers and `FastifyPluginAsyncZod`                                                                                         |
| `@fastify/otel`             | tracing instrumentation, lab only, loaded from `instrumentation.ts`                                                                                |

## Why Fastify over Express (reconstructed)

Express has no built-in schemas, typed hooks or `inject`; you'd add body-parser, a validator, a logger and supertest separately. Fastify includes them and is faster. NestJS adds a large framework of decorators and dependency injection on top, which would hide the mechanics this project set out to teach.
