import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { createChallengeSchema, createCommentSchema } from "./challenges";
import { createReportSchema } from "./moderation";
import { createPostSchema, postListQuerySchema } from "./posts";
import { createQuestionSchema } from "./questions";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  usernameSchema,
} from "./users";

// First error message, or null when the value is valid.
function problem(schema: ZodType, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "invalid");
}

describe("usernames (D28)", () => {
  it.each(["sam", "Sam_1", "a_b_c", "x".repeat(20)])("accepts %s", (name) => {
    expect(problem(usernameSchema, name)).toBeNull();
  });

  it.each(["ab", "x".repeat(21), "no spaces", "dash-name", "émile", ""])(
    "rejects %j",
    (name) => {
      expect(problem(usernameSchema, name)).not.toBeNull();
    },
  );
});

describe("emails", () => {
  it("trims and lowercases before checking", () => {
    expect(emailSchema.parse("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it.each(["not-an-email", "sam@", "@example.com", `${"a".repeat(250)}@x.io`])(
    "rejects %j",
    (email) => {
      expect(problem(emailSchema, email)).not.toBeNull();
    },
  );
});

describe("passwords", () => {
  it("need 12 to 128 characters and nothing else", () => {
    expect(problem(passwordSchema, "short")).toBe("Use at least 12 characters");
    expect(problem(passwordSchema, "x".repeat(129))).toBe(
      "Use at most 128 characters",
    );
    expect(problem(passwordSchema, "all lowercase words")).toBeNull();
  });

  it("aren't checked against signup rules when logging in", () => {
    expect(
      problem(loginSchema, { email: "sam@example.com", password: "short" }),
    ).toBeNull();
    expect(
      problem(loginSchema, { email: "sam@example.com", password: "" }),
    ).toBe("Enter your password");
  });

  it("are required at signup with the other fields", () => {
    expect(
      registerSchema.safeParse({
        username: "sam",
        email: "sam@example.com",
        password: "correct horse battery",
      }).success,
    ).toBe(true);
  });
});

describe("question titles", () => {
  it("collapse extra spaces and must end with a question mark", () => {
    const parsed = createQuestionSchema.parse({
      title: "  Should   voting be mandatory? ",
    });
    expect(parsed).toEqual({
      title: "Should voting be mandatory?",
      description: "",
    });
    expect(
      problem(createQuestionSchema, { title: "Voting should be mandatory." }),
    ).toBe("Phrase it as a question ending with ?");
  });

  it("are 10 to 150 characters", () => {
    expect(problem(createQuestionSchema, { title: "Why not?" })).toBe(
      "Use at least 10 characters",
    );
    expect(
      problem(createQuestionSchema, { title: `${"x".repeat(150)}?` }),
    ).toBe("Use at most 150 characters");
  });
});

describe("posts and challenges", () => {
  it("need a real argument, not a one-liner", () => {
    expect(
      problem(createPostSchema, { title: "Yes!!", body: "Because I said so." }),
    ).toBe("Explain your reasoning in at least 30 characters");
    expect(
      problem(createChallengeSchema, { title: "No", body: "x".repeat(40) }),
    ).toBe("Use at least 5 characters");
  });

  it("sort columns by Top unless asked otherwise", () => {
    expect(postListQuerySchema.parse({ stance: "for" })).toMatchObject({
      sort: "top",
      limit: 10,
    });
    expect(problem(postListQuerySchema, { stance: "maybe" })).not.toBeNull();
  });
});

describe("comments", () => {
  it("can't be blank", () => {
    expect(problem(createCommentSchema, { body: "   " })).toBe(
      "Write something first",
    );
  });
});

describe("reports", () => {
  it("can't claim to be automated", () => {
    const report = {
      targetType: "post",
      targetId: "01a0fd6d-0000-7000-8000-000000000000",
    };
    expect(
      problem(createReportSchema, { ...report, reason: "spam" }),
    ).toBeNull();
    expect(
      problem(createReportSchema, { ...report, reason: "automated" }),
    ).not.toBeNull();
  });
});
