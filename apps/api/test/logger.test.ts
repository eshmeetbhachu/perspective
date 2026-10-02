import { expect, it } from "vitest";
import { redactUrl } from "../src/config/logger";

it("hides one-time values in logged URLs", () => {
  expect(
    redactUrl("/auth/google/callback?code=abc&state=xyz&scope=email"),
  ).toBe("/auth/google/callback?code=REDACTED&state=REDACTED&scope=email");
  expect(redactUrl("/auth/me")).toBe("/auth/me");
});
