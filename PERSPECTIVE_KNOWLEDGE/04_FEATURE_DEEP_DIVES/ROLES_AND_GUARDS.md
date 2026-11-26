# Feature: Roles, Guards and Permissions

**Purpose:** decide, on the server and for every request, whether the person may do what they're asking.

## Roles

`USER_ROLES = ["user", "moderator", "admin"]` (`packages/shared/src/users.ts:4`) is also the Postgres enum `user_role`. Ranks: `user 0 < moderator 1 < admin 2` (`plugins/auth.ts:59`, duplicated in `moderation/routes.ts:25`).

| Role      | Can                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------- |
| user      | Everything a member does: ask, post, vote, challenge, comment, report                                 |
| moderator | + the moderation scope: queue, remove/restore/dismiss, ban/unban users ranked below, audit log        |
| admin     | Same routes as moderator; can additionally ban **moderators** (rank rule). No admin-only route exists |

Changing a role: `pnpm set-role <email> <user|moderator|admin>` (`apps/api/scripts/set-role.ts`). The arguments are validated with a Zod tuple, and the lookup is case-insensitive.

## Guards (`apps/api/src/plugins/auth.ts`)

```ts
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new AppError(401, "UNAUTHENTICATED", "You need to log in");
  return request.user;
}

export async function requireVerifiedEmail(request: FastifyRequest): Promise<void> {
  if (!requireUser(request).emailVerifiedAt) throw new AppError(403, "EMAIL_NOT_VERIFIED", ...);
}

export function requireRole(minimum: UserRole) {
  return async (request: FastifyRequest): Promise<void> => {
    if (ROLE_RANK[requireUser(request).role] < ROLE_RANK[minimum]) throw new AppError(403, "FORBIDDEN", ...);
  };
}
```

- `requireUser` is a **plain function that returns the user**. Handlers call it to get a `user` that TypeScript knows isn't `null`. It's also the base of the other two guards.
- `requireVerifiedEmail` and `requireRole(...)` are used as Fastify `preHandler`s: they run after validation and before the handler.
- `requireRole` is a **factory**: it returns a new guard function configured with `minimum`. This pattern is a _closure_.

## Which route needs what

| Route group                                                                    | Guard                                         | Extra checks in the handler                                |
| ------------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| All GET reads (questions, columns, posts, challenges, threads)                 | none (public)                                 | Only published/live content is returned                    |
| `GET /auth/me`, `/questions/:slug/stance`, notifications, `POST /auth/logout`* | `requireUser` in handler                      | (*logout works without a session too)                      |
| `PUT /questions/:slug/stance`                                                  | `requireUser`                                 | 24 h cooldown                                              |
| `POST /questions`                                                              | `requireVerifiedEmail`                        | 5/day                                                      |
| `POST /questions/:slug/posts`                                                  | `requireVerifiedEmail`                        | must have a stance; 10/day; one live post per side         |
| `PATCH`/`DELETE /posts/:id`                                                    | `requireUser`                                 | **must be the author** (`findOwnPost`)                     |
| `PUT /posts/:id/vote`                                                          | `requireVerifiedEmail`                        | account ≥24 h; not own post; must have a stance            |
| `DELETE /posts/:id/vote`                                                       | `requireUser`                                 | none (removes only your own vote row)                      |
| `POST /posts/:id/challenges`                                                   | `requireVerifiedEmail`                        | not own post; 5/day; one per post                          |
| `POST /challenges/:id/comments`                                                | `requireVerifiedEmail`                        | parent in the same challenge and live; depth < 50; 100/day |
| `DELETE /comments/:id`                                                         | `requireUser`                                 | **must be the author**                                     |
| `POST /reports`                                                                | `requireUser`                                 | target visible; not your own; 20/day                       |
| `/moderation/*`                                                                | `requireRole("moderator")` on the whole scope | ban: target rank < yours and not yourself                  |

**Authentication vs authorization:** "logged in" isn't enough to edit a post. `findOwnPost` (`posts/routes.ts:27`) compares `author_id` with the user id and throws 403 otherwise. Tested in `posts.test.ts:278`.

## The moderation scope (encapsulation)

```ts
await app.register(async (scope) => {
  const mod = scope.withTypeProvider<ZodTypeProvider>();
  mod.addHook("preHandler", requireRole("moderator"));
  mod.get("/moderation/queue", ...);
  ...
});
```

`app.register` with an inline plugin creates a Fastify **encapsulation context**: the hook added inside applies only to routes registered inside. `POST /reports`, registered outside, stays open to all users. Adding a new moderation route inside the scope protects it automatically, so it can't be forgotten.

## Roles are read on every request

`loadSession` joins `users` on every request, so `request.user.role` is always current. Demote a moderator and their next request is refused (test `guards.test.ts:67`: "uses the current role, not the one at login"). The same goes for bans and email verification.

## The frontend mirrors, but doesn't enforce

`SiteHeader` shows "Moderation" only for moderators/admins; `ModerationPage` shows "Moderators only" otherwise; `HelpfulButton` explains why voting is disabled; `PostCard` shows Edit/Delete only for your own posts (matching by username). All of these are conveniences. The API is the authority.

## Known gap (FACT, recommendation)

`POST /moderation/users/:username/unban` (`moderation/routes.ts:262`) doesn't apply the rank rule that `ban` applies. A moderator can unban a user that an admin banned (including a banned moderator). **RECOMMENDATION:** apply the same `ROLE_RANK` comparison in `unban`, or record who placed a ban and only allow equal or higher ranks to lift it. Listed in [KNOWN_LIMITATIONS.md](../08_BUGS_AND_DEBUGGING/KNOWN_LIMITATIONS.md).

## Tests

`apps/api/test/guards.test.ts` registers test-only routes guarded by each guard and checks anonymous/user/moderator/admin behaviour, plus the "current role" rule. `moderation.test.ts:344` checks the ban rank rule.
