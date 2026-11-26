# TypeScript Fundamentals (Using Perspective's Code)

TypeScript is JavaScript plus **types**: labels that describe what kind of value a variable holds. The TypeScript compiler (`tsc`) checks the labels before the code runs; then the types are erased and plain JavaScript runs. In this project `tsc` **only checks** (`"noEmit": true`); tsx, Vite and esbuild do the running and building.

```ts
let port: number = 3000;
port = "3000"; // ❌ compile error: string is not assignable to number
```

## 1. Basic types

| Type                          | Example from the project                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `string`, `number`, `boolean` | `username: string`, `PORT` (number), `emailVerified: boolean`                           |
| `Date`                        | `createdAt: Date` on rows from Drizzle                                                  |
| `null`, `undefined`           | `authorUsername: string \| null`                                                        |
| arrays `T[]`                  | `scopes: CacheScope[]`                                                                  |
| `unknown`                     | `catch (err)`: "could be anything; check before use"                                    |
| `void`                        | functions that return nothing: `Promise<void>`                                          |
| `bigint`                      | `neededPosition` returns `bigint` (`0n` literal) for WAL positions too big for `number` |

## 2. Object types: `interface` and `type`

```ts
// apps/api/src/mailer.ts
export interface Email {
  to: string;
  subject: string;
  text: string;
}

// apps/api/src/modules/auth/google.ts
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}
```

`type` can name any type, including unions and computed types:

```ts
type Counts = Question["stanceCounts"]; // look up a property's type
```

## 3. Union types and literal types

```ts
// packages/shared/src/errors.ts
export type ErrorCode = "BAD_REQUEST" | "VALIDATION_FAILED" | "UNAUTHENTICATED" | ...;
```

A value of type `ErrorCode` can only be one of those exact strings. `new AppError(404, "NOT_FUOND", ...)` is a compile error, so typos are impossible.

## 4. `as const` and deriving types from data

```ts
// packages/shared/src/stances.ts
export const STANCES = ["for", "neutral", "against"] as const;
export type Stance = (typeof STANCES)[number]; // "for" | "neutral" | "against"
```

- Without `as const`, TypeScript would infer `string[]`. With it, the array is a read-only tuple of those exact strings.
- `typeof STANCES` takes the _type_ of the value; `[number]` means "the type of any element".
- One list → the runtime values (for buttons, the Postgres enum, the Zod enum) **and** the type. They can't drift apart.

## 5. Optional properties and `?`

```ts
function rankPosts(sort: PostSort, cursorValue?: string)   // may be omitted → undefined
interface PostEditorProps { initial?: CreatePostInput; ... }
```

## 6. Narrowing: proving a value's type to the compiler

```ts
function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new AppError(401, ...);
  return request.user;                 // here TypeScript knows: AuthUser, not null
}
```

Narrowing tools used in the project: `if (!x)`, `typeof x === "string"`, `x instanceof Error`, `"code" in obj`, `Array.isArray`, and `===` checks on literal unions. `db/errors.ts` is a full worked example of narrowing an `unknown` (see [IMPORTANT_FUNCTIONS_AND_MODULES.md](../02_CODEBASE/IMPORTANT_FUNCTIONS_AND_MODULES.md#uniqueviolationerr-appsapisrcdberrorsts3)).

## 7. Optional chaining `?.` and nullish coalescing `??`

```ts
const unread = data?.unreadCount ?? 0;            // SiteHeader.tsx
userAgent: request.headers["user-agent"]?.slice(0, 500)
redis?.disconnect();                               // only if redis isn't null
config ??= oidc.discovery(...)                     // assign only if undefined/null
```

- `a?.b` gives `undefined` instead of crashing when `a` is null or undefined.
- `a ?? b` uses `b` only when `a` is null or undefined (unlike `||`, it keeps `0` and `""`).

## 8. Generics: types with parameters

```ts
export async function api<T>(path: string, ...): Promise<T> { ... }
const me = await api<UserResponse>("/auth/me");    // me: UserResponse
```

`T` is a placeholder filled in by the caller. Other generics in the project: `Promise<T>`, `Record<K, V>`, `Map<string, Node>`, `useState<Stance>("for")`, `sql<number>\`...\``(Drizzle: "this SQL returns a number"),`new Queue<Email>(...)`.

## 9. Utility types

| Utility                          | Meaning                              | Example                                                |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| `Record<K, V>`                   | object with keys K and values V      | `Record<UserRole, number>` for `ROLE_RANK`             |
| `Partial<T>`                     | every property optional              | `FieldErrors = Partial<Record<string, string>>`        |
| `Omit<T, K>`                     | T without some keys                  | `AuthUser = Omit<UserRow, "passwordHash"> & {...}`     |
| `Pick<T, K>`                     | only some keys                       | `Pick<FastifyBaseLogger, "info">` in `deliverEmail`    |
| `Awaited<T>`                     | the value a promise resolves to      | `Awaited<ReturnType<typeof selectChallenges>>[number]` |
| `ReturnType<F>`, `Parameters<F>` | a function's return / argument types | `Executor` type in `db/client.ts`                      |

## 10. Intersection `&`

`A & B` has everything from both: `AuthUser = Omit<...> & { googleConnected: boolean }`.

## 11. Classes and `extends`

```ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);              // call Error's constructor
    this.name = "AppError";
    ...
  }
}
```

`readonly` means the property can't be reassigned after construction. `err instanceof AppError` then works for narrowing.

## 12. `import type` and modules

```ts
import type { FastifyRequest } from "fastify"; // types only: erased at runtime
import { buildApp } from "./app"; // a real value
import { type Executor, db } from "../db/client"; // mixed
```

`verbatimModuleSyntax` forces you to mark type-only imports, so tools that compile one file at a time know what to erase.

## 13. Type inference: you rarely write types

```ts
const user = requireUser(request);    // inferred AuthUser
const [row] = await db.select(...);   // inferred from the selected columns, | undefined
```

Write types at **boundaries** (function parameters, exported functions, shared contracts) and let inference handle the inside.

## 14. `any` is avoided

The lint config (`strictTypeChecked`) flags unsafe `any` use. The project uses `unknown` plus narrowing instead, and `as` assertions only where the value is genuinely known (e.g. `request.params as { slug: string }` in `cache.ts`, after the route's schema has validated it).

Continue with [TYPESCRIPT_IN_PERSPECTIVE.md](TYPESCRIPT_IN_PERSPECTIVE.md) for the compiler settings and the advanced patterns this project relies on.
