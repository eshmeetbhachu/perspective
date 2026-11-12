import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { testDatabaseUrls } from "../env";
import { expect, test } from "../fixtures";

const PASSWORD = "correct horse battery";

test("sign up, confirm the email, log out and back in", async ({ page }) => {
  const username = `new_${Date.now().toString(36).slice(-6)}`;
  const email = `${username}@e2e.example`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL("/account");
  await expect(
    page.getByRole("heading", { name: `Hi, ${username}` }),
  ).toBeVisible();
  await expect(page.getByText("not verified yet")).toBeVisible();

  // The emailed link carries a one-time token; plant a known one for this
  // account and open the link the way the email would.
  const token = randomBytes(32).toString("base64url");
  const db = new pg.Client({ connectionString: testDatabaseUrls().app });
  await db.connect();
  await db.query(
    `insert into email_tokens (user_id, purpose, token_hash, expires_at)
     select id, 'verify_email', $2, now() + interval '1 hour' from users where email = $1`,
    [email, createHash("sha256").update(token).digest("hex")],
  );
  await db.end();

  await page.goto(`/verify-email?token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Email confirmed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to your account" }).click();
  await expect(
    page.locator(".badge-ok", { hasText: "verified" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  await page.goto("/login?next=%2Faccount");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator(".form-error")).toHaveText(
    "Wrong email or password",
  );

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/account");
});

test("signup explains invalid fields before calling the server", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Username").fill("bad name!");
  await page.getByLabel("Email").fill("nope");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.locator(".field-error")).toHaveText([
    "Use 3-20 letters, numbers or underscores (no spaces)",
    "Enter a valid email address",
    "Use at least 12 characters",
  ]);
});

test("members-only pages send visitors to log in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/login?next=%2Faccount");
});
