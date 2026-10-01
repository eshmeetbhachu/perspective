// Placeholder until the Fastify server is added (Phase 0, step 5).
import { env } from "./config/env";

// DATABASE_URL is deliberately not logged: it contains a password.
console.log("api config loaded:", {
  NODE_ENV: env.NODE_ENV,
  HOST: env.HOST,
  PORT: env.PORT,
});
