import { expect, test } from "../fixtures";

test("ask a question, find it, and get duplicate suggestions", async ({
  person,
}) => {
  const asker = await person("asker");
  const { page } = asker;
  const tag = Date.now().toString(36);
  const title = `Should voting be mandatory ${tag}?`;

  await page.goto("/ask");
  await page.getByLabel("Question").fill(`Voting should be mandatory ${tag}.`);
  await page.getByRole("button", { name: "Publish question" }).click();
  await expect(page.locator(".field-error").first()).toHaveText(
    "Phrase it as a question ending with ?",
  );

  await page.getByLabel("Question").fill(title);
  await page
    .getByLabel("Context (optional)")
    .fill("Some countries fine non-voters.");
  await page.getByRole("button", { name: "Publish question" }).click();
  await expect(page).toHaveURL(`/q/should-voting-be-mandatory-${tag}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".column")).toHaveCount(3);

  await page.goto("/");
  await page.getByLabel("Search questions").fill("votes");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto("/ask");
  await page.getByLabel("Question").fill(`shoud votng be mandatory ${tag}`);
  await expect(
    page.locator(".similar").getByRole("link", { name: title }),
  ).toBeVisible();
});

test("unverified accounts are asked to verify before asking", async ({
  person,
}) => {
  const { page } = await person("unverified", { verified: false });
  await page.goto("/ask");
  await expect(
    page.getByRole("heading", { name: "Verify your email first" }),
  ).toBeVisible();
});
