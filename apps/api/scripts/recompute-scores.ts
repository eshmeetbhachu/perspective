// Usage: pnpm recompute-scores (after changing vote weights, D44)
import { pool } from "../src/db/client";
import { recomputeScores } from "../src/modules/votes/scores";

await recomputeScores();
await pool.end();
console.log("Vote weights and post scores recomputed");
