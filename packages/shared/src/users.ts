// What a user is allowed to do. Checked by the auth guard (Phase 1, step 6).
export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Username rules (D28): 3-20 letters, digits or underscores.
// The database enforces the same pattern, and the API validates it with Zod.
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
