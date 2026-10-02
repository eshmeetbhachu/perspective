import { expect, questionWithPost, test } from "../fixtures";

test("challenge a post, get notified, and debate in a thread", async ({
  person,
}) => {
  const sam = await person("sam");
  const alex = await person("alex");
  const { slug } = await questionWithPost(sam, "for");

  await alex.page.goto(`/q/${slug}`);
  await alex.page
    .locator(".column-for .post-card")
    .getByRole("link", { name: "Challenge", exact: true })
    .click();
  await alex.page
    .getByLabel("What are you challenging?")
    .fill("What about commuters?");
  await alex.page
    .getByLabel("Your argument")
    .fill(
      "Many workers live where buses don't run at night, so a ban shifts the cost.",
    );
  await alex.page.getByRole("button", { name: "Start challenge" }).click();
  await expect(
    alex.page.getByRole("heading", { name: "What about commuters?" }),
  ).toBeVisible();
  const challengeUrl = alex.page.url();

  await sam.page.goto("/");
  await expect(sam.page.locator(".unread-badge")).toHaveText("1");
  await sam.page.getByRole("link", { name: /Notifications/ }).click();
  await expect(sam.page.locator(".notification").first()).toContainText(
    "challenged your post",
  );
  await expect(sam.page.locator(".unread-badge")).toHaveCount(0);
  await sam.page.locator(".notification").first().getByRole("link").click();

  await sam.page
    .getByLabel("Add to the discussion")
    .fill("Night buses would come with the ban.");
  await sam.page.getByRole("button", { name: "Comment" }).click();
  await expect(sam.page.locator(".comment .markdown").first()).toContainText(
    "Night buses",
  );

  await alex.page.goto(challengeUrl);
  await alex.page
    .locator(".comment")
    .first()
    .getByRole("button", { name: "Reply" })
    .click();
  await alex.page.getByLabel("Your reply").fill("Funded how, and from when?");
  await alex.page
    .getByRole("button", { name: "Reply", exact: true })
    .last()
    .click();
  await expect(
    alex.page.locator(".comment .comment-list .comment .markdown"),
  ).toHaveText("Funded how, and from when?");

  await sam.page.goto("/notifications");
  await expect(sam.page.locator(".notification").first()).toContainText(
    "replied to you",
  );
  await sam.page.locator(".notification").first().getByRole("link").click();
  await expect(sam.page).toHaveURL(/#comment-/);
});

test("deep threads continue on their own page", async ({ person }) => {
  const sam = await person("sam");
  const alex = await person("alex");
  const { postId } = await questionWithPost(sam, "for");
  const { challenge } = await alex.api<{ challenge: { id: string } }>(
    "POST",
    `/posts/${postId}/challenges`,
    {
      title: "A long back-and-forth",
      body: "This deserves a careful reply about the details.",
    },
  );

  let parentId: string | undefined;
  for (let level = 1; level <= 7; level++) {
    const { comment } = await (level % 2 ? alex : sam).api<{
      comment: { id: string };
    }>("POST", `/challenges/${challenge.id}/comments`, {
      body: `Level ${String(level)} reply`,
      parentId,
    });
    parentId = comment.id;
  }

  await alex.page.goto(`/c/${challenge.id}`);
  await expect(alex.page.getByText("Level 5 reply")).toBeVisible();
  await expect(alex.page.getByText("Level 6 reply")).toHaveCount(0);
  await alex.page.getByRole("link", { name: "Continue this thread →" }).click();
  await expect(
    alex.page.getByText("Showing one branch of the discussion."),
  ).toBeVisible();
  await expect(alex.page.getByText("Level 7 reply")).toBeVisible();
});
