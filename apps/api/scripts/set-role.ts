// Usage: pnpm set-role <email> <user|moderator|admin>
import { USER_ROLES } from "@perspective/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../src/db/client";
import { users } from "../src/db/schema";

const args = z
  .tuple([z.email(), z.enum(USER_ROLES)])
  .safeParse(process.argv.slice(2));

if (!args.success) {
  console.error("Usage: pnpm set-role <email> <user|moderator|admin>");
  process.exit(1);
}

const [email, role] = args.data;
const updated = await db
  .update(users)
  .set({ role })
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .returning({ username: users.username });

await pool.end();

if (updated.length === 0) {
  console.error(`No account with the email ${email}`);
  process.exit(1);
}
console.log(`${updated[0]?.username ?? email} is now ${role}`);
