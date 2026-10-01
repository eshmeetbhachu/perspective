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
  // Connects as perspective_app, the row-access-only role (D19).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
