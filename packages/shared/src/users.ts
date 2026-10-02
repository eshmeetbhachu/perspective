import { z } from "zod";

// What a user is allowed to do. Checked by the auth guard (Phase 1, step 6).
export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Username rules (D28): 3-20 letters, digits or underscores.
// The database enforces the same pattern, and the API validates it with Zod.
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const usernameSchema = z
  .string()
  .regex(
    USERNAME_PATTERN,
    "Use 3-20 letters, numbers or underscores (no spaces)",
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

// Long minimum instead of composition rules ("1 symbol, 1 digit"), per NIST
// guidance; the maximum stops huge inputs from making hashing expensive.
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters");

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Login deliberately doesn't apply the signup password rules.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  emailVerified: z.boolean(),
  googleConnected: z.boolean(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const userResponseSchema = z.object({ user: publicUserSchema });
export type UserResponse = z.infer<typeof userResponseSchema>;

export const providersResponseSchema = z.object({ google: z.boolean() });
export type ProvidersResponse = z.infer<typeof providersResponseSchema>;

// A Google sign-in waiting for its next step (D27).
export const googlePendingResponseSchema = z.object({
  email: z.string(),
  accountExists: z.boolean(),
});
export type GooglePendingResponse = z.infer<typeof googlePendingResponseSchema>;

export const completeGoogleSignupSchema = z.object({
  username: usernameSchema,
});
export type CompleteGoogleSignupInput = z.infer<
  typeof completeGoogleSignupSchema
>;
