# Feature: Search and "Did You Mean…?" Suggestions

Two different text-matching tools for two different jobs (D39):

| Job                                 | Tool                                       | Endpoint                        | Why this tool                                                     |
| ----------------------------------- | ------------------------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| Find questions about a topic        | Postgres **full-text search** (`tsvector`) | `GET /questions/search?q=`      | Understands word forms (vote/voting), ranks by relevance          |
| Warn about a duplicate while asking | **Trigram similarity** (`pg_trgm`)         | `GET /questions/similar?title=` | Tolerates typos and different word order; works on partial titles |

## Full-text search

### The column

```sql
search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', description), 'B')
) STORED
```

- `to_tsvector('english', 'Should voting be mandatory?')` → `'mandatori':4 'vote':2`. Stop words ("should", "be") are dropped and the remaining words are **stemmed** to their root.
- `setweight(..., 'A')` labels title words as more important than description words (`'B'`).
- `GENERATED ALWAYS AS ... STORED`: Postgres computes it on every insert and update. The application never writes it, so it can never be out of date.
- Index: `questions_search_idx USING gin (search_vector)`. A **GIN** (generalised inverted) index maps each word to the list of rows that contain it, like the index at the back of a book.

### The query (`questions/routes.ts:236`)

```sql
select ... from questions q left join users u ...
where q.status = 'published'
  and q.search_vector @@ websearch_to_tsquery('english', $1)
order by ts_rank(q.search_vector, websearch_to_tsquery('english', $1)) desc, q.id desc
limit 30
```

- `websearch_to_tsquery` accepts search-engine-style input safely: `cars -ban "city centre" or transit`. Unlike `to_tsquery`, it never throws a syntax error on user input.
- `@@` means "matches".
- `ts_rank` scores each match (title hits weigh more); ties are broken by newest.
- **30 results, no paging (D39):** ranked results beyond the first few dozen are rarely useful, and floating-point ranks make fragile cursors.
- Input validation: `q` is trimmed, 2–100 characters.

### Measured performance (Phase 9, D72)

- A rare word uses the GIN index: ~0.6 ms.
- A very common word ("cities" matched 16% of 50,000 generated questions) makes Postgres rank all ~8,000 matches to keep 30: ~10.9 ms. That was the most expensive query in the lab.
- Search was 18–26% of database time from about 4% of requests. **Decision: keep Postgres search** until it passes ~40% of database time after caching, or until typo tolerance or facets are needed. The generated seed titles reuse a few dozen words, so they exaggerate the cost.

## "Did you mean…?" suggestions

### Trigrams

A trigram is a three-character chunk. `pg_trgm` splits text into its trigrams (after lower-casing, with padding): "vote" → `"  v", " vo", "vot", "ote", "te "`. Two strings are similar if they share many trigrams. "Shoud votng be mandatry" still shares most trigrams with "Should voting be mandatory", which full-text search would miss (the misspelled words don't stem to the same roots).

### The query (`questions/routes.ts:259`)

```sql
select ... where q.status = 'published' and q.title % $1
order by similarity(q.title, $1) desc
limit 5
```

- `%` is true when similarity is above `pg_trgm.similarity_threshold` (default 0.3).
- Index: `questions_title_trgm_idx USING gin (title gin_trgm_ops)` makes `%` fast.
- The extension is enabled by the hand-written migration `0004_enable_pg_trgm.sql`. It must run before `0005`, which creates the index using it.
- Input: trimmed, 5–150 characters.
- **Not cached** in the lab (it isn't configured with `config.cache`): it's only called while someone is typing on the ask page.

### Frontend (`questions.ts:62`)

```ts
const debounced = useDebounced(title.trim(), 400);
useQuery({
  queryKey: ["questions", "similar", debounced],
  enabled: debounced.length >= 5,
  placeholderData: (previous) => previous,
});
```

- **Debouncing** waits until typing pauses for 400 ms, so typing a 60-character title sends a few requests instead of 60.
- `placeholderData: previous` keeps showing the last suggestions while the next ones load, so the list doesn't flicker.
- `AskPage` hides suggestions when the title drops below 5 characters.

## The browse page search UI

`QuestionsPage` keeps the query in the URL (`/questions?q=voting`), so searches are shareable and survive a reload. The search form is a separate component keyed by the query (`<SearchForm key={query} …>`). Changing the URL elsewhere (e.g. the back button) remounts it with the new text.

## Tests

`questions.test.ts:197` ("matches word forms and ranks title matches first", "returns nothing for unrelated words") and `:224` ("finds an existing question despite typos"). E2E `questions.spec.ts` covers finding a new question and getting duplicate suggestions.
