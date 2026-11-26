# Password Security

## Never store passwords, store slow hashes

A **hash function** turns input into a fixed-size fingerprint that can't be reversed. To check a password, you hash what the user typed and compare. But if attackers steal the hashes, they can still **guess**: hash "password123", compare, and repeat billions of times per second on GPUs. So password hashes must be:

1. **Salted:** a random value mixed into each hash, so identical passwords produce different hashes and precomputed tables ("rainbow tables") are useless.
2. **Slow:** each guess must cost real time.
3. **Memory-hard:** each guess must also need lots of RAM, which GPUs and custom chips have little of per core.

**argon2id** (winner of the Password Hashing Competition, recommended by OWASP) does all three.

## Perspective's settings (`apps/api/src/modules/auth/passwords.ts`)

```ts
// Argon2id with OWASP's recommended minimum cost (19 MiB, 2 passes).
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
export function hashPassword(password: string) {
  return hash(password, options);
}
export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
```

- `memoryCost: 19_456` KiB = 19 MiB per hash.
- `timeCost: 2` passes over that memory.
- `parallelism: 1` thread.
- The output string embeds the algorithm, parameters and salt (`$argon2id$v=19$m=19456,t=2,p=1$...`), so the cost can be raised later; old hashes still verify with their own parameters.
- `@node-rs/argon2` is a Rust native binding: fast, with prebuilt binaries (no compiler needed at install), running outside the JavaScript thread.

**Why not SHA-256 for passwords** when it's used for tokens? SHA-256 is designed to be _fast_: billions per second. That's fine for 256-bit random tokens (impossible to guess anyway) and terrible for human-chosen passwords.

**Why not bcrypt?** It works, but it isn't memory-hard and it silently ignores input beyond 72 bytes.

## Password rules (shared `passwordSchema`)

```ts
z.string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters");
```

- **Length, not composition** (NIST SP 800-63B): "correct horse battery staple" beats "P@ssw0rd!". Composition rules push people towards predictable patterns.
- **Maximum 128:** hashing cost grows with input size; an attacker sending megabyte "passwords" could burn CPU.
- **Login doesn't apply the minimum:** `loginSchema.password` is `min(1).max(128)`, so a rule change can never lock out existing users.

## Making guessing online slow

- `POST /auth/login`: 10 attempts per 15 minutes per IP.
- Generic message ("Wrong email or password") for every failure.
- **Equal timing:** for an unknown email, `verifyAgainstDummy()` runs a real argon2 verification against a hash created at startup, so the response takes as long as a wrong password. Otherwise attackers could tell registered emails apart by response time alone.
- **IP accuracy:** the rate limit keys on the real client IP, which is trustworthy because of `ORIGIN_SECRET` (D61). Without it an attacker could rotate fake `X-Forwarded-For` values and get unlimited attempts.

## Recovery

Password reset by emailed link (30 minutes, single use), which also ends every existing session. See [EMAIL_VERIFICATION_AND_PASSWORD_RESET.md](../04_FEATURE_DEEP_DIVES/EMAIL_VERIFICATION_AND_PASSWORD_RESET.md).

## Not implemented (RECOMMENDATIONS)

| Feature                                                                       | Why it would help                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Change password while logged in (asking for the current one)                  | Today a user must use "forgot password"                                  |
| Breached-password check (e.g. the k-anonymity range API of Have I Been Pwned) | Rejects passwords already in public leaks                                |
| Per-account lockout / exponential delay                                       | IP limits don't stop a slow attack spread across many IPs on one account |
| Two-factor authentication (TOTP, passkeys)                                    | Protects even when the password leaks                                    |
| Notification email on password change                                         | Alerts the real owner to a takeover                                      |
