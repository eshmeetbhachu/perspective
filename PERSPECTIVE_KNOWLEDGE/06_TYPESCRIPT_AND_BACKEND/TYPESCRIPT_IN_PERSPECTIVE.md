# TypeScript in Perspective: Settings and Patterns

## The compiler settings (`tsconfig.base.json`), line by line

| Setting                            | Value     | What it means here                                                                                                                                                     |
| ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`, `lib`                    | `ES2023`  | Modern JavaScript features (e.g. `Array.prototype.at`, used as `page.at(-1)`). Browsers/Node 22 support them                                                           |
| `module`                           | `ESNext`  | `import`/`export` syntax                                                                                                                                               |
| `moduleResolution`                 | `bundler` | Resolve imports the way Vite/tsx/esbuild do; allows `packages/shared` to export `.ts` files directly (D17)                                                             |
| `resolveJsonModule`                | `true`    | `import pkg from "../package.json" with { type: "json" }` in `scripts/build.ts`                                                                                        |
| `strict`                           | `true`    | All strict checks, incl. `strictNullChecks` (null must be handled) and `noImplicitAny`                                                                                 |
| `noUncheckedIndexedAccess`         | `true`    | `arr[0]` is `T \| undefined`. That's why the code writes `const [row] = await ...; if (!row) ...` everywhere                                                           |
| `noImplicitReturns`                | `true`    | Every path of a value-returning function must return                                                                                                                   |
| `noFallthroughCasesInSwitch`       | `true`    | No accidental fall-through between `case`s                                                                                                                             |
| `noImplicitOverride`               | `true`    | Overriding methods needs `override`                                                                                                                                    |
| `verbatimModuleSyntax`             | `true`    | `import type` required for type-only imports                                                                                                                           |
| `isolatedModules`                  | `true`    | Each file must be compilable alone (what Vite/esbuild do)                                                                                                              |
| `esModuleInterop`                  | `true`    | Smooth default imports from CommonJS packages                                                                                                                          |
| `forceConsistentCasingInFileNames` | `true`    | `./App` vs `./app` is an error: Windows ignores case, Linux (CI, Docker) doesn't                                                                                       |
| `noEmit`                           | `true`    | `tsc` only checks                                                                                                                                                      |
| `skipLibCheck`                     | `true`    | Don't type-check `node_modules` `.d.ts` files                                                                                                                          |
| `types`                            | `[]`      | No global type packages by default; the API adds `["node"]`, the web app `["vite/client"]`, shared adds nothing (so it can't accidentally use `process` or `document`) |

Per package: `apps/web/tsconfig.json` adds `lib: DOM` and `jsx: "react-jsx"`; `tsconfig.node.json` type-checks the Vite configs with Node types; `pnpm typecheck` runs `tsc -p` for all five configs.

## Pattern 1: one schema → validation + type (Zod)

```ts
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;
// { username: string; email: string; password: string }
```

`z.infer` gives the **output** type (after transforms). `z.input` gives what you may pass **in**, which matters when defaults exist: `CreateQuestionInput = z.input<typeof createQuestionSchema>` makes `description` optional for the caller, because the schema fills in `""`.

## Pattern 2: types from the database schema (Drizzle)

```ts
typeof users.$inferSelect; // a row: { id: string; username: string; passwordHash: string | null; ... }
typeof users.$inferInsert; // for inserts: defaults optional
type Purpose = (typeof emailTokens.$inferSelect)["purpose"]; // "verify_email" | "reset_password"
```

Selected columns shape the result type: `db.select({ id: questions.id }).from(questions)` returns `{ id: string }[]`.

## Pattern 3: typed Fastify routes with a type provider

```ts
export const postRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/questions/:slug/posts",
    { schema: { params: slugParams, body: createPostSchema, response: { 201: postResponseSchema } } },
    async (request, reply) => {
      request.params.slug;     // string, from the Zod schema
      request.body.title;      // string
      return reply.status(201).send({ post: ... });   // checked against postResponseSchema
    });
};
```

`FastifyPluginAsyncZod` (from fastify-type-provider-zod) teaches Fastify's types to read Zod schemas. Inside the encapsulated moderation scope the code calls `scope.withTypeProvider<ZodTypeProvider>()` to get the same behaviour.

## Pattern 4: module augmentation (adding fields to library types)

```ts
// apps/api/src/plugins/auth.ts
declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}
```

Interfaces in TypeScript can be **merged**: this adds `user` and `sessionId` to Fastify's own `FastifyRequest` type everywhere in the API. `cache.ts` does the same for `cacheKey`, `readFromReplica` and the route config's `cache` option (`FastifyContextConfig`). Paired with `app.decorateRequest("user", null)` at runtime.

## Pattern 5: template literal types

```ts
export type CacheScope = "questions" | "moderation" | `question:${string}`;
```

`question:${string}` accepts any string starting with `question:`, so `bumpCache(log, "questoins")` is a compile error while `` `question:${slug}` `` is fine.

## Pattern 6: `Record` lookup tables instead of `switch`

```ts
const LIFETIME_MS: Record<Purpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};
const SORT_LABELS: Record<PostSort, string> = {
  top: "Most helpful",
  hot: "Trending",
  new: "Newest",
};
```

If a new purpose or sort is added to the union, TypeScript reports the missing key.

## Pattern 7: the `Executor` type (accept a db or a transaction)

```ts
export type Executor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
```

Read it from the inside out: `typeof db.transaction` is the transaction method → `Parameters<...>[0]` is its callback → `Parameters<callback>[0]` is the callback's first argument, the `tx` object. So `Executor` = "db or tx". Functions such as `notify(tx: Executor, ...)` then work both inside and outside transactions.

## Pattern 8: closures and factories

```ts
export function requireRole(minimum: UserRole) {
  return async (request: FastifyRequest): Promise<void> => { ... uses minimum ... };
}
```

The returned function "remembers" `minimum`.

## Pattern 9: typed environment for Vite

```ts
// apps/web/src/vite-env.d.ts
interface ImportMetaEnv {
  readonly VITE_API_WAKE_URL?: string;
}
```

A `.d.ts` file only declares types. This merges into Vite's `ImportMetaEnv`, so `import.meta.env.VITE_API_WAKE_URL` is typed.

## Pattern 10: React component props

```ts
export function PostColumn({ slug, stance, sort, canWrite }: {
  slug: string; stance: Stance; sort: PostSort; canWrite: boolean;
}) { ... }
```

Props are a typed object, destructured in the parameter. Event handler types come from React: `SubmitEvent<HTMLFormElement>`.

## Lint rules that shape the code

From `typescript-eslint` `strictTypeChecked`:

- **`no-floating-promises`:** every promise must be awaited or explicitly discarded with `void`. That's why you see `void navigate("/")` and `void queryClient.invalidateQueries(...)`.
- **`restrict-template-expressions`:** numbers in template strings must be converted explicitly: `` `${String(DAILY_LIMIT)} questions` ``.
- **`no-unnecessary-condition`**, **`no-unsafe-*`**: discourage `any` and impossible checks.
- `require-await` is turned **off** because Fastify handlers and hooks are written `async` by convention even when they await nothing.
- React hooks rules (`eslint-plugin-react-hooks`): hooks at the top level only, complete effect dependencies.
