import { buildApp } from "./app";
import { env } from "./config/env";

// If shutdown takes longer than this, a request or connection is stuck:
// exit anyway rather than hang forever.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = await buildApp();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  process.exit(1);
}

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then exit. SIGINT = Ctrl+C; SIGTERM = what Docker and hosting
// platforms send when stopping a container.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "shutting down");

  const timer = setTimeout(() => {
    app.log.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let this timer by itself keep the process alive.
  timer.unref();

  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}
