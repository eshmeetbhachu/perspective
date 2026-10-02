import type { ErrorResponse, UserResponse } from "@perspective/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { env } from "../src/config/env";
import { db } from "../src/db/client";
import { oauthPending, questions, reports, users } from "../src/db/schema";

export async function resetDatabase(): Promise<void> {
  await db.delete(reports);
  await db.delete(questions);
  await db.delete(users);
  await db.delete(oauthPending);
}

export function post(
  app: FastifyInstance,
  url: string,
  payload?: object,
  session?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url,
    payload,
    headers: { origin: env.WEB_ORIGIN },
    cookies: session ? { session } : {},
  });
}

export function get(
  app: FastifyInstance,
  url: string,
  session?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "GET",
    url,
    cookies: session ? { session } : {},
  });
}

export function findCookie(response: LightMyRequestResponse, name: string) {
  return response.cookies.find(
    (cookie) => cookie.name === name && cookie.value !== "",
  );
}

export function sessionCookie(response: LightMyRequestResponse) {
  return findCookie(response, "session");
}

export async function register(
  app: FastifyInstance,
  overrides: Partial<{
    username: string;
    email: string;
    password: string;
  }> = {},
): Promise<{ session: string; body: UserResponse }> {
  const response = await post(app, "/auth/register", {
    username: "sam",
    email: "sam@example.com",
    password: "correct horse battery",
    ...overrides,
  });
  const cookie = sessionCookie(response);
  if (response.statusCode !== 201 || !cookie) {
    throw new Error(`register failed: ${response.body}`);
  }
  return { session: cookie.value, body: response.json<UserResponse>() };
}

export function errorCode(response: LightMyRequestResponse) {
  return response.json<ErrorResponse>().error.code;
}
