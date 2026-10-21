import { build } from "esbuild";
import pkg from "../package.json" with { type: "json" };

// Bundles our code, including @perspective/shared (TypeScript source, D17),
// into plain JavaScript. npm packages stay as imports from node_modules.
await build({
  entryPoints: ["src/server.ts", "src/migrate.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  sourcemap: true,
  external: Object.keys(pkg.dependencies).filter(
    (name) => name !== "@perspective/shared",
  ),
});
