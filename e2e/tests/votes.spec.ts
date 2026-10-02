import { expect, questionWithPost, test } from "../fixtures";

test("vote across sides, earn the badge, and re-sort", async ({
  person,
  db,
}) => {
  const author = await person("author");
  const { slug, postId } = await questionWithPost(author, "for");

  const rival = await person("rival");
  await rival.api("PUT", `/questions/${slug}/stance`, { stance: "against" });
  const { page } = rival;
  await page.goto(`/q/${slug}`);

  const card = page.locator(".column-for .post-card");
  const button = card.getByRole("button", { name: /Helped me understand/ });
  await expect(card.locator(".helpful-count")).toHaveText(
    "0 people found this helpful",
  );
  await button.click();
  await expect(card.locator(".helpful-count")).toHaveText(
    "1 person found this helpful",
  );
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();

  for (const [name, stance] of [
    ["rival2", "against"],
    ["middle", "neutral"],
  ] as const) {
    const voter = await person(name);
    await voter.api("PUT", `/questions/${slug}/stance`, { stance });
    await voter.api("PUT", `/posts/${postId}/vote`);
  }
  await page.reload();
  await expect(card.locator(".badge-across")).toHaveText("Valued across sides");

  const { rows } = await db.query<{ score: number }>(
    "select helpful_score as score from posts where id = $1",
    [postId],
  );
  expect(rows[0]?.score).toBe(3 + 3 + 2);

  await page.getByRole("button", { name: "Trending" }).click();
  await expect(page).toHaveURL(/sort=hot/);
});

test("explains why a reader can't vote yet", async ({ person }) => {
  const author = await person("author");
  const { slug } = await questionWithPost(author, "for");

  const fresh = await person("fresh", { ageDays: 0 });
  await fresh.api("PUT", `/questions/${slug}/stance`, { stance: "against" });
  await fresh.page.goto(`/q/${slug}`);
  await expect(
    fresh.page.locator(".column-for .helpful .field-hint"),
  ).toContainText("New accounts can vote from");

  const undecided = await person("undecided");
  await undecided.page.goto(`/q/${slug}`);
  await expect(
    undecided.page.locator(".column-for .helpful .field-hint"),
  ).toHaveText("Choose where you stand to vote");

  await author.page.goto(`/q/${slug}`);
  await expect(author.page.locator(".column-for .post-card")).toBeVisible();
  await expect(
    author.page
      .locator(".column-for")
      .getByRole("button", { name: /Helped me understand/ }),
  ).toHaveCount(0);
});
