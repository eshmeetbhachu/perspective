import { expect, test } from "../fixtures";

test("take a side, write a post, edit it and delete it", async ({ person }) => {
  const writer = await person("writer");
  const { page } = writer;
  const { question } = await writer.api<{ question: { slug: string } }>(
    "POST",
    "/questions",
    { title: `Should zoos be phased out ${Date.now().toString(36)}?` },
  );
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });

  await page.goto(`/q/${question.slug}`);
  await expect(page.getByText("Where do you stand?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Write a post" })).toHaveCount(0);
  await page.getByRole("button", { name: "against", exact: true }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("You can change it after")).toBeVisible();

  await page
    .locator(".column-against")
    .getByRole("link", { name: "Write a post" })
    .click();
  await page.getByLabel("Title").fill("Conservation needs them");
  await page
    .locator("#post-body")
    .fill(
      'Breeding programmes saved **several species**. <img src=x onerror="alert(1)"> [bad](javascript:alert(2))',
    );
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator(".preview strong")).toHaveText("several species");
  await page.getByRole("button", { name: "Publish post" }).click();

  const card = page.locator(".column-against .post-card");
  await expect(card.locator(".post-title")).toHaveText(
    "Conservation needs them",
  );
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.locator('a[href^="javascript"]')).toHaveCount(0);
  expect(dialogs).toEqual([]);

  await card.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Conservation still needs them");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(card.locator(".post-title")).toHaveText(
    "Conservation still needs them",
  );
  await expect(card.locator(".question-meta")).toContainText("edited");

  await card.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".column-against")).toContainText(
    "No perspectives yet.",
  );
  expect(dialogs).toEqual(["Delete this post? This can't be undone."]);
});
