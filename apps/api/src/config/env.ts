import { z } from "zod";

// Every environment variable the API reads, with its rules.
// If anything is missing or invalid, the API refuses to start.
const EnvSchema = z
  .object({
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
    // Reduced to scheme + host, so "https://site.app/" still matches.
    WEB_ORIGIN: z
      .url()
      .default("http://localhost:5173")
      .transform((url) => new URL(url).origin),
    // Google sign-in is switched off until both are set.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Must match a redirect URI registered in Google Cloud Console.
    GOOGLE_REDIRECT_URI: z
      .url()
      .default("http://localhost:5173/api/auth/google/callback"),
    // Addresses of the proxies in front of the API (load balancer), e.g.
    // "10.0.0.0/8" or "uniquelocal". Only requests arriving from them may set
    // X-Forwarded-For; otherwise anyone could fake their IP and dodge rate
    // limits. Unset means no proxy is trusted.
    TRUST_PROXY: z.string().min(1).optional(),
    // Set when the website's proxy (Vercel) adds this value as the
    // X-Origin-Secret header. Every other request is refused, which is what
    // makes the visitor IP that the proxy reports trustworthy (D61).
    ORIGIN_SECRET: z.string().min(32).optional(),
    // e.g. smtps://user:password@smtp.gmail.com:465. Without it, emails are
    // only written to the log.
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    EMAIL_FROM: z.string().min(1).default("Perspective <no-reply@localhost>"),
  })
  .refine(
    (env) => env.NODE_ENV !== "production" || env.SMTP_URL !== undefined,
    {
      path: ["SMTP_URL"],
      message: "Production must be able to send emails",
    },
  )
  .refine((env) => !(env.TRUST_PROXY && env.ORIGIN_SECRET), {
    path: ["TRUST_PROXY"],
    message: "Use either TRUST_PROXY or ORIGIN_SECRET, not both",
  });

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  // An empty line like `GOOGLE_CLIENT_ID=` means "not set".
  const values = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
  );
  const result = EnvSchema.safeParse(values);

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
