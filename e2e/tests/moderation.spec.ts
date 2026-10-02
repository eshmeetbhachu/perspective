import { expect, questionWithPost, test } from "../fixtures";

test("report, review, remove, and restore", async ({ person }) => {
  const sam = await person("sam");
  const alex = await person("alex");
  const mod = await person("mod", { role: "moderator" });
  const { slug } = await questionWithPost(sam, "for");

  await alex.page.goto(`/q/${slug}`);
  const card = alex.page.locator(".column-for .post-card");
  await card.getByRole("button", { name: "Report" }).click();
  await card.getByLabel("Spam or advertising").check();
  await card
    .getByLabel(/Anything else moderators/)
    .fill("Looks copied from an ad");
  await card.getByRole("button", { name: "Send report" }).click();
  await expect(
    card.getByText("Reported. A moderator will review it."),
  ).toBeVisible();
  await expect(alex.page.getByRole("link", { name: "Moderation" })).toHaveCount(
    0,
  );

  const { page } = mod;
  page.on("dialog", (dialog) => void dialog.accept("Removed by mistake"));
  await page.goto("/");
  await page.getByRole("link", { name: "Moderation" }).click();
  const item = page.locator(".queue-card", {
    hasText: "Streets are for people",
  });
  await expect(item).toContainText("Spam or advertising");
  await expect(item).toContainText("Looks copied from an ad");
  await expect(item.getByRole("button", { name: "Remove" })).toBeDisabled();
  await item.getByLabel("Note for the audit log").fill("Promotional spam");
  await item.getByRole("button", { name: "Remove" }).click();
  await expect(item).toHaveCount(0);

  await alex.page.goto(`/q/${slug}`);
  await expect(alex.page.locator(".column-for")).toContainText(
    "No perspectives yet.",
  );

  await page.getByRole("tab", { name: "Audit log" }).click();
  const entry = page
    .locator(".notification", { hasText: "removed a post" })
    .first();
  await expect(entry).toContainText("Promotional spam");
  await entry.getByRole("button", { name: "Restore" }).click();
  await expect(
    page.locator(".notification", { hasText: "restored a post" }).first(),
  ).toBeVisible();

  await alex.page.reload();
  await expect(alex.page.locator(".column-for .post-card")).toBeVisible();
});

test("a ban logs the person out immediately", async ({ person }) => {
  const mod = await person("mod", { role: "moderator" });
  const target = await person("target");
  await target.page.goto("/account");
  await expect(
    target.page.getByRole("heading", { name: `Hi, ${target.username}` }),
  ).toBeVisible();

  await mod.page.goto("/moderation?tab=users");
  await mod.page.getByLabel("Username").fill(target.username);
  await mod.page.getByLabel(/Reason/).fill("Repeated spam");
  await mod.page.getByRole("button", { name: "Ban", exact: true }).click();
  await expect(
    mod.page.getByText(`${target.username} was banned.`),
  ).toBeVisible();

  await target.page.reload();
  await expect(target.page).toHaveURL(/\/login/);
});

test("non-moderators can't open the dashboard", async ({ person }) => {
  const { page } = await person("curious");
  await page.goto("/moderation");
  await expect(
    page.getByRole("heading", { name: "Moderators only" }),
  ).toBeVisible();
});
