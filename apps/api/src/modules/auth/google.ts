import * as oidc from "openid-client";
import { env } from "../../config/env";

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export interface GoogleChecks {
  state: string;
  codeVerifier: string;
  nonce: string;
}

let config: Promise<oidc.Configuration> | undefined;

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

// Discovery fetches Google's endpoints and signing keys once, then is reused.
function googleConfig(): Promise<oidc.Configuration> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google sign-in is not configured");
  }
  config ??= oidc
    .discovery(
      new URL("https://accounts.google.com"),
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
    )
    .then((discovered) => {
      oidc.enableNonRepudiationChecks(discovered);
      return discovered;
    })
    .catch((err: unknown) => {
      config = undefined;
      throw err;
    });
  return config;
}

export async function createGoogleAuthorization(): Promise<{
  url: URL;
  checks: GoogleChecks;
}> {
  const checks = {
    state: oidc.randomState(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    nonce: oidc.randomNonce(),
  };
  const url = oidc.buildAuthorizationUrl(await googleConfig(), {
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    scope: "openid email",
    state: checks.state,
    nonce: checks.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url, checks };
}

// Exchanges the one-time code for tokens. openid-client verifies state, PKCE,
// nonce, and the ID token's signature, issuer, audience, and expiry.
export async function exchangeGoogleCode(
  callbackUrl: URL,
  checks: GoogleChecks,
): Promise<GoogleIdentity> {
  const tokens = await oidc.authorizationCodeGrant(
    await googleConfig(),
    callbackUrl,
    {
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      pkceCodeVerifier: checks.codeVerifier,
      idTokenExpected: true,
    },
  );
  const claims = tokens.claims();
  if (!claims || typeof claims.email !== "string") {
    throw new Error("Google did not return an email address");
  }
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
  };
}
