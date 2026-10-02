import { z } from "zod";

// Every environment variable the API reads, with its rules.
// If anything is missing or invalid, the API refuses to start.
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  // Env vars are always strings; coerce turns "3000" into the number 3000.
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Connects as perspective_app, the row-access-only role (D19).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // The only origin allowed to make state-changing requests (CSRF, CORS).
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  // Google sign-in is switched off until both are set.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // Must match a redirect URI registered in Google Cloud Console.
  GOOGLE_REDIRECT_URI: z
    .url()
    .default("http://localhost:5173/api/auth/google/callback"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    // Logs which variables are wrong and why, but never their values:
    // they may be secrets.
    console.error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
