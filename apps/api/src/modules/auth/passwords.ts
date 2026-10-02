import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP's recommended minimum cost (19 MiB, 2 passes).
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

// Checked when the email doesn't exist, so a wrong email takes as long as a
// wrong password and response times don't reveal which accounts exist.
const dummyHash = await hashPassword("not-a-real-password");

export async function verifyAgainstDummy(password: string): Promise<void> {
  await verify(dummyHash, password);
}
