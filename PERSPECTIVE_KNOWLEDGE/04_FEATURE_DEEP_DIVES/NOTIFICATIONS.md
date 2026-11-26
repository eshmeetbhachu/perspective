# Feature: Notifications

**User-facing purpose:** know when someone challenges your post or replies to you. A badge in the header shows the unread count; `/notifications` lists them.

## Pieces

| Layer  | Files                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| UI     | `SiteHeader.tsx` (`NotificationsLink` with the badge), `pages/NotificationsPage.tsx`                          |
| Hooks  | `challenges.ts`: `useUnreadCount(enabled)` (polls every 60 s), `useNotifications`, `useMarkNotificationsRead` |
| Shared | `challenges.ts`: `notificationSchema`, `notificationListResponseSchema`, `unreadCountResponseSchema`          |
| API    | `modules/notifications/notify.ts`, `routes.ts`                                                                |
| Table  | `notifications (id, user_id, type, actor_id, challenge_id, comment_id, read_at, created_at)`                  |

## Types

| Type              | Written when           | Recipient                                                              | Written in                 |
| ----------------- | ---------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `post_challenged` | A challenge is created | The post's author                                                      | `challenges/routes.ts:150` |
| `comment_reply`   | A comment is posted    | The parent comment's author, or the challenger for a top-level comment | `challenges/thread.ts:190` |

`notify()` skips the insert when the recipient is `null` (deleted account) or is the person acting: nobody is notified about their own actions.

## Endpoints

| Route                             | Guard     | Notes                                                                                   |
| --------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `GET /notifications/unread-count` | logged in | `logLevel: "warn"`, because it's polled and would flood the logs at info level          |
| `GET /notifications`              | logged in | Latest 30, joined with the challenge title and the actor's username, plus `unreadCount` |
| `POST /notifications/read`        | logged in | Marks **all** unread as read; 204                                                       |

## Design decisions (D49)

**Written in the same transaction as the event.** The alternative, writing notifications from a queue after the commit, would allow a challenge without its notification (if the job failed) or a notification about a challenge that was rolled back. Writing one row inside the transaction is cheap and gives an exact guarantee (D70 kept this even after the queue existed).

**Polling instead of push.** The header asks once a minute. With the partial index `notifications_unread_idx (user_id) WHERE read_at IS NULL`, that's a tiny index-only count: the index holds only unread rows, so it stays small however many old notifications exist. WebSockets or Server-Sent Events would deliver instantly but need long-lived connections, which free hosts handle poorly and which complicate scaling. D49 leaves push as a change to make only if measurements call for it.

**Opening the page marks everything read** (`NotificationsPage.tsx`: an effect calls the mutation when `unread > 0`), and the mutation sets the cached unread count to 0 so the badge clears immediately.

**Privacy:** every query filters by `user_id = current user` (test `challenges.test.ts:370`, "are private").

## Indexes

- `notifications_user_idx (user_id, id desc)`: the list, newest first.
- `notifications_unread_idx (user_id) WHERE read_at IS NULL`: the badge count.

## Links

Each notification links to `/c/<challengeId>`, and replies to `#comment-<commentId>`, which the thread scrolls to once loaded.

## Limitations

- Only the latest 30 are shown; there's no paging.
- No per-notification "mark read"; no email notifications; no preferences.
- Up to 60 seconds of delay before the badge updates.
