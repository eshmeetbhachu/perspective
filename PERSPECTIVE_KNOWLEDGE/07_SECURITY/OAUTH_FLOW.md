# OAuth 2.0 and OpenID Connect, Explained

Implementation details are in [AUTH_GOOGLE_OAUTH.md](../04_FEATURE_DEEP_DIVES/AUTH_GOOGLE_OAUTH.md). This page teaches the protocol and why each check exists. (Reminder: Google sign-in is implemented but **off in production**.)

## The vocabulary

- **OAuth 2.0:** a protocol for an app to get _permission_ from a provider (Google) on behalf of a user, without ever seeing their Google password.
- **OpenID Connect (OIDC):** a layer on top of OAuth that answers "_who_ is this user?" with a signed **ID token** (a JWT) containing claims such as `sub`, `email`, `email_verified`.
- **Client:** Perspective's API, identified by `GOOGLE_CLIENT_ID`, and proving it's really us with `GOOGLE_CLIENT_SECRET` (server-side only).
- **Redirect URI:** where Google sends the browser back. It must exactly match one registered in Google Cloud Console.
- **Authorization code:** a short-lived, one-time code Google gives the browser, which our server exchanges (with the secret) for tokens.
- **`sub` (subject):** Google's permanent, unique id for the account. Emails can change hands; `sub` doesn't.

## The flow (Authorization Code + PKCE)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as Perspective API
  participant G as Google
  B->>A: GET /api/auth/google/start
  A->>A: make state, nonce, PKCE verifier<br/>challenge = base64url(sha256(verifier))
  A-->>B: Set-Cookie google_oauth={state,verifier,nonce,intent}<br/>302 → Google (client_id, redirect_uri, scope=openid email,<br/>state, nonce, code_challenge, S256)
  B->>G: user picks an account, consents
  G-->>B: 302 → /api/auth/google/callback?code=…&state=…
  B->>A: GET callback (+ google_oauth cookie)
  A->>G: POST token endpoint: code + client_secret + code_verifier
  G-->>A: ID token (signed JWT) + access token
  A->>A: verify state, nonce, signature, iss, aud, exp; email_verified
  A-->>B: session cookie / pending cookie, 302 → website
```

## Why each protection exists

| Check                                         | Stops                                                                                               | How                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **state**                                     | _Login CSRF_: an attacker sends you a callback link carrying **their** code, logging you in as them | Random value stored in your cookie; the callback's `state` must match                                                                       |
| **PKCE** (`code_verifier` / `code_challenge`) | A stolen authorization code being exchanged by someone else                                         | Only the party holding the random verifier (our server, via your cookie) can redeem the code; Google checks `sha256(verifier) == challenge` |
| **nonce**                                     | Replay of an old ID token                                                                           | Random value sent to Google and echoed inside the signed ID token; must match                                                               |
| **Signature**                                 | Forged ID tokens                                                                                    | Verified against Google's published keys (discovery + `enableNonRepudiationChecks`)                                                         |
| **iss**                                       | Tokens from another issuer                                                                          | Must be `https://accounts.google.com`                                                                                                       |
| **aud**                                       | Tokens issued to a different app                                                                    | Must equal our client id                                                                                                                    |
| **exp**                                       | Old tokens                                                                                          | Must not be expired                                                                                                                         |
| **email_verified**                            | Someone claiming an email they don't control                                                        | Must be `true` (checked in `google-routes.ts:108`)                                                                                          |
| **client secret**                             | Impersonating our app at the token endpoint                                                         | Kept in env on the server only                                                                                                              |
| **Exact redirect URI**                        | Codes being sent to an attacker's URL                                                               | Registered at Google; `GOOGLE_REDIRECT_URI` in env                                                                                          |

openid-client performs every check in the table except `email_verified`, which our code checks itself (D34: "a certified library handles state, PKCE, nonce, issuer/audience/expiry checks instead of hand-rolled crypto").

## After Google says "this is user `sub`": account linking

This is the part where most real-world vulnerabilities live, and it's Perspective's own logic (D27):

1. `sub` already linked → log in to that account (unless banned).
2. Not linked, logged in with `intent=link` → link to the current account (being logged in proves ownership), unless the `sub` belongs to someone else.
3. Not linked, not logged in → **never** log into an existing account just because the email matches. Hold the identity in `oauth_pending` for 15 minutes:
   - no account with that email → pick a username and create one (email pre-verified by Google);
   - an account exists → the owner must log in **with that account's password**; only then is Google linked.

### The attack this prevents: pre-account takeover

1. The attacker signs up on Perspective with **your** email and their own password (they can't verify it, but the account exists).
2. Later you click "Continue with Google". A naive site sees the matching email and logs you in to that account, now linked to your Google.
3. The attacker still knows the password, so both of you control the account, and the attacker can read everything you do there.

With D27, step 2 instead asks you to log in with the existing account's password, which you don't have. Nothing gets linked. (You could recover the email-squatted account through "forgot password", which also verifies it, ends the attacker's sessions and replaces their password.)

## Scopes and privacy

`scope: "openid email"`: only an identity and an email. No profile picture, name, contacts or Drive. `prompt: "select_account"` always shows the account chooser, which helps on shared computers.

## To enable it in production

1. Google Cloud Console → OAuth client (Web application). Authorized origin `https://perspective-lilac.vercel.app`; redirect URI `https://perspective-lilac.vercel.app/api/auth/google/callback`.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` on Render; redeploy.
3. While the Google app is in "Testing" mode, only listed test users can sign in; publishing the consent screen lifts that.
