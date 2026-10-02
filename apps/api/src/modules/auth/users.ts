import { db, type Executor } from "../../db/client";
import { uniqueViolation } from "../../db/errors";
import { users } from "../../db/schema";
import { AppError } from "../../errors";
import { type AuthUser, authUserColumns } from "./sessions";

export async function insertUser(
  values: typeof users.$inferInsert,
  executor: Executor = db,
): Promise<AuthUser> {
  try {
    const [user] = await executor
      .insert(users)
      .values(values)
      .returning(authUserColumns);
    if (!user) throw new Error("Insert returned no user");
    return user;
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint === "users_email_lower_unique") {
      throw new AppError(
        409,
        "EMAIL_TAKEN",
        "An account with this email already exists",
      );
    }
    if (constraint === "users_username_lower_unique") {
      throw new AppError(409, "USERNAME_TAKEN", "This username is taken");
    }
    throw err;
  }
}
