# CSRF, CORS and XSS

Three different browser-security problems that are often confused. Here's each one, and exactly how Perspective handles it.

## 1. CSRF: Cross-Site Request Forgery

**The attack:** you're logged in to Perspective. You visit `evil.example`, which contains:

```html
<form
  action="https://perspective-lilac.vercel.app/api/posts/<id>/vote"
  method="POST"
  id="f"
></form>
<script>
  document.getElementById("f").submit();
</script>
```

Your browser sends the POST, and without protection it would attach your Perspective cookie. The attacker can't _read_ the response, but the vote happened as you.

**Perspective's defences (D30), three independent layers:**

1. **`SameSite=Lax` cookie:** the browser doesn't attach the session cookie to that cross-site POST at all. The request arrives logged out.
2. **Origin check** (`apps/api/src/plugins/csrf.ts`):
   ```ts
   const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
   export async function checkOrigin(request) {
     if (SAFE_METHODS.has(request.method)) return;
     if (request.headers.origin !== env.WEB_ORIGIN)
       throw new AppError(403, "FORBIDDEN", "Cross-site request blocked");
   }
   ```
   Browsers always send an `Origin` header on cross-site POSTs, and page JavaScript can't change it (it's a "forbidden header"). A request from `evil.example` carries `Origin: https://evil.example` → 403. Our own `fetch` calls carry our origin.
3. **JSON-only bodies** (`app.removeContentTypeParser("text/plain")`): an HTML form can only send `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`. The API accepts none of these (only JSON). And a cross-site `fetch` with `Content-Type: application/json` triggers a **CORS preflight**, which our CORS policy refuses.

Any one layer alone stops the attack; together they cover older browsers, odd edge cases and configuration mistakes.

**What this requires from the code:** GET requests must never change data. They don't: every write is POST/PUT/PATCH/DELETE. (Lax cookies _are_ sent on cross-site GET navigations.)

**Normalising `WEB_ORIGIN`** (`env.ts:22`): the comparison is exact, so `https://site.app/` (with a slash) would never equal the browser's `https://site.app`. The env schema reduces the value to `new URL(url).origin` (D61, test `server.test.ts:196`).

**Why not CSRF tokens:** they need state the frontend must fetch and echo on every write. The layers above are standard for modern browsers and simpler.

Tests: `auth.test.ts:214` ("blocks state-changing requests from other origins", "refuses non-JSON bodies").

## 2. CORS: Cross-Origin Resource Sharing

**What it is:** by default, the browser's **same-origin policy** lets a page read responses only from its own origin (scheme + host + port). CORS is how a _server_ allows other specific origins to read its responses, using headers like `Access-Control-Allow-Origin`.

**Common misconception:** CORS is not a CSRF defence on its own. It controls who can _read_ responses; "simple" requests (like a form POST) are still _sent_. It's the JSON requirement that turns our writes into non-simple requests, which need a preflight (an `OPTIONS` request asking permission), and _that_ is where CORS blocks them.

**Perspective's configuration** (`app.ts:54`):

```ts
await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
```

- Only `WEB_ORIGIN` may read responses or send credentialed cross-origin requests.
- In practice the website calls the API **same-origin** through the proxy, so CORS isn't even exercised. It's configured strictly for the case where the setup changes.

## 3. XSS: Cross-Site Scripting

**The attack:** an attacker gets their own JavaScript to run on _our_ page in _your_ browser, for example by writing a post containing `<img src=x onerror="steal()">`. That script runs with the page's privileges: it can call the API as you.

### Defence 1: React escapes text by default

```tsx
<h3 className="post-title">{post.title}</h3>
```

If `post.title` is `<script>alert(1)</script>`, React renders those characters as **text**, not HTML. All titles, usernames, descriptions, reasons and notifications go through this path.

### Defence 2: Markdown is sanitised with an allowlist (D42)

Post, challenge and comment **bodies** are Markdown, which must become HTML, so they can't simply be escaped. `apps/web/src/markdown.ts`:

```ts
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "h3",
  "h4",
  "hr",
];
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow ugc");
  }
});
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title"],
  });
}
```

- **Allowlist, not blocklist:** anything not listed is removed: `<script>`, `<iframe>`, `<img>`, `<style>`, `on*` event handlers, `style` attributes. Blocklists miss new tricks; allowlists don't.
- **`javascript:` links** are removed by DOMPurify's URI rules (test `markdown.test.ts:20`).
- **Headings** are limited to `h3`/`h4`, so a post can't render a giant page title (bigger ones are dropped to text).
- **`rel="noopener"`:** a link opened in a new tab can't control our page through `window.opener` (_reverse tabnabbing_). **`noreferrer`:** doesn't leak the page URL. **`nofollow ugc`:** search engines give spam links no ranking credit.
- **No images:** an image loads from the author's server, revealing each reader's IP and reading time (a tracking pixel).
- The sanitised HTML is inserted with `dangerouslySetInnerHTML`, and each such use has a comment saying it's sanitised.

### Defence 3: `httpOnly` limits the damage

Even if a script did run, it couldn't read the session cookie.

### Not yet: a Content-Security-Policy on the website

A **CSP** header tells the browser which scripts may run (e.g. only ones from our own origin, no inline scripts). It's a powerful second line of defence: even if HTML injection happened, the browser would refuse to execute it. **FACT:** helmet sends a CSP on API responses, but the HTML page served by Vercel has none (checked live). **RECOMMENDATION:** add a CSP header in `apps/web/vercel.json` for `/(.*)`, test the site with it in report-only mode first, then enforce it.

## 4. Clickjacking (bonus)

Helmet's `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` stop other sites from framing **API** responses. The website's own pages don't send these headers (same gap as CSP). The recommended CSP would include `frame-ancestors 'none'` to cover it.
