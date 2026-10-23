import { randomBytes } from "node:crypto";
import pg from "pg";
import { z } from "zod";

// One-time setup for a hosted database (e.g. Neon), where docker/postgres/init
// can't run: creates the two least-privilege roles (D19) with random
// passwords and prints their connection strings for the API host's settings.
// Usage: OWNER_DATABASE_URL=<the host's owner connection string> pnpm db:setup-roles

const ownerUrl = new URL(
  z.url({ protocol: /^postgres(ql)?$/ }).parse(process.env.OWNER_DATABASE_URL),
);
const passwords = {
  perspective_migrator: randomBytes(24).toString("base64url"),
  perspective_app: randomBytes(24).toString("base64url"),
};

const client = new pg.Client({ connectionString: ownerUrl.toString() });
await client.connect();
const db = client.escapeIdentifier(
  decodeURIComponent(ownerUrl.pathname.slice(1)),
);

try {
  await client.query("begin");
  for (const [role, password] of Object.entries(passwords)) {
    await client.query(
      `create role ${role} login password ${client.escapeLiteral(password)}`,
    );
  }
  // Hosted databases give us no superuser. To hand the schema to the
  // migrator, the owner account has to be able to act as it.
  await client.query("grant perspective_migrator to current_user");
  await client.query(`revoke all on database ${db} from public`);
  await client.query(
    `grant connect on database ${db} to perspective_migrator, perspective_app`,
  );
  await client.query("alter schema public owner to perspective_migrator");
  await client.query(`grant create on database ${db} to perspective_migrator`);
  await client.query("grant usage on schema public to perspective_app");
  await client.query(`alter default privileges for role perspective_migrator in schema public
    grant select, insert, update, delete on tables to perspective_app`);
  await client.query(`alter default privileges for role perspective_migrator in schema public
    grant usage, select on sequences to perspective_app`);
  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}

function urlFor(role: keyof typeof passwords): string {
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = passwords[role];
  return url.toString();
}

console.log("Roles created. These passwords are shown only once:\n");
console.log(`DATABASE_URL=${urlFor("perspective_app")}`);
console.log(`MIGRATION_DATABASE_URL=${urlFor("perspective_migrator")}`);
