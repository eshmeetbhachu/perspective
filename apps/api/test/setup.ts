import { afterAll } from "vitest";
import { useTestEnvironment } from "./env";

useTestEnvironment();

afterAll(async () => {
  // Imported lazily so the env above is set before the database client loads.
  const { pool } = await import("../src/db/client");
  await pool.end();
});
