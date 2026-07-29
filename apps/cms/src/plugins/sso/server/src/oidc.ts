/**
 * OIDC Authorization Code + PKCE client for admin SSO (Req §8, §0 A3, §10.2 Q1).
 *
 * ## Protocol choice
 *
 * The plan's open question 1 defaulted to **OIDC over SAML**, to be confirmed in
 * P7. Confirmed here, and the reasoning is worth recording because it is the kind
 * of decision that gets revisited: OIDC's JSON/JWT flow needs no XML canonical-
 * isation or XML-DSig, and XML signature wrapping is a decades-long source of
 * authentication-bypass bugs in SAML implementations. It also carries MFA
 * assurance in a machine-readable way (`amr`/`acr`) rather than as an out-of-band
 * agreement. If VNG's IdP turns out to be SAML-only, `docs/adr/004` records the
 * fallback: front the IdP with an OIDC bridge rather than hand-rolling SAML here.
 *
 * ## Why no `openid-client`
 *
 * `openid-client` is the reference library and would normally be the right call.
 * It is not usable here: v6+ ships **ESM only**, and the Strapi server runs as
 * compiled CommonJS, so it cannot be `require`d. Rather than pin an
 * end-of-life v5, the flow is implemented against Node's built-in `crypto`,
 * which has first-class JWK support (`createPublicKey({ format: "jwk" })`) — so
 * no signature verification is hand-rolled at the maths level, only the JWS
 * framing. Every check the spec requires is enumerated in `verifyIdToken` below.
 */
import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Absolute URL of our callback, must match the IdP registration exactly. */
  redirectUri: string;
  scopes: string[];
  /**
   * Require evidence of multi-factor authentication in the ID token (Req §8
   * "SSO/MFA"). When true, the token must carry either an `acr` in
   * `mfaAcrValues` or an `amr` containing one of `mfaAmrValues`.
   */
  requireMfa: boolean;
  mfaAcrValues: string[];
  mfaAmrValues: string[];
  /** `acr_values` to *request* — asks the IdP to step up rather than just checking. */
  requestedAcrValues: string[];
  /** Claim holding group/role names used for role mapping. */
  groupsClaim: string;
  /** Create an admin user on first successful login? */
  autoProvision: boolean;
  /** Only accept identities in these email domains (empty = any). */
  allowedEmailDomains: string[];
  /**
   * Require `email_verified: true` in the ID token. On by default — the email is the
   * account-identity key, so an unverified one is an account-takeover primitive.
   */
  requireVerifiedEmail: boolean;
}

/**
 * https always; http only against localhost and never in production. Returning a
 * boolean rather than throwing inside the URL parse keeps the caller's error message
 * specific.
 */
/**
 * `oidcConfigFromEnv` runs on every admin request via the enforcement middleware, so a
 * misconfiguration must not flood the log. Warn once per distinct message per process.
 */
const warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  // `strapi` is a global at runtime; fall back to console when it isn't yet.
  const log = (globalThis as { strapi?: { log?: { error?: (m: string) => void } } }).strapi?.log
    ?.error;
  if (log) log(`[sso] ${message}`);
  else console.error(`[sso] ${message}`);
}

function isAcceptableIssuerUrl(issuer: string): boolean {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return isLocalhost && process.env.NODE_ENV !== "production";
}

export function oidcConfigFromEnv(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  const redirectUri = process.env.OIDC_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;

  const list = (raw: string | undefined, fallback: string[] = []): string[] => {
    const parts = (raw ?? "")
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : fallback;
  };

  // The discovery, JWKS and token endpoints are all derived from the issuer, and the
  // token exchange sends the client secret and the authorization code. Over plaintext
  // http all three are readable and rewritable by anyone on the path, which turns the
  // whole flow into theatre. Allowed only for a localhost IdP stub in development.
  //
  // Returning `null` rather than throwing is deliberate: this function is a
  // "is SSO usable?" probe called from the enforcement middleware on **every** admin
  // request. Throwing here would turn a mistyped env var into a 500 on the whole admin
  // panel. `null` means "SSO disabled" — the plugin logs it loudly at register() and
  // local password login still works, which is the recoverable failure.
  const normalisedIssuer = issuer.replace(/\/$/, "");
  if (!isAcceptableIssuerUrl(normalisedIssuer)) {
    warnOnce(
      `OIDC_ISSUER must be an https URL (got "${normalisedIssuer}") — SSO is DISABLED. ` +
        "Plain http is only accepted for a localhost IdP stub outside production.",
    );
    return null;
  }

  return {
    issuer: normalisedIssuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes: list(process.env.OIDC_SCOPES, ["openid", "profile", "email"]),
    // Defaults to ON: an SSO integration that silently accepts single-factor
    // logins satisfies the letter of "SSO/MFA" and none of its intent.
    requireMfa: process.env.OIDC_REQUIRE_MFA !== "false",
    mfaAcrValues: list(process.env.OIDC_MFA_ACR_VALUES, [
      // Common values across Entra ID / Okta / Keycloak / ADFS.
      "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
      "urn:mace:incommon:iap:silver",
      "mfa",
      "L2",
      "L3",
    ]),
    mfaAmrValues: list(process.env.OIDC_MFA_AMR_VALUES, [
      "mfa",
      "otp",
      "hwk",
      "swk",
      "sms",
      "pop",
      "fido",
      "phr",
      "phrh",
    ]),
    requestedAcrValues: list(process.env.OIDC_ACR_VALUES),
    groupsClaim: process.env.OIDC_GROUPS_CLAIM?.trim() || "groups",
    autoProvision: process.env.OIDC_AUTO_PROVISION === "true",
    allowedEmailDomains: list(process.env.OIDC_ALLOWED_EMAIL_DOMAINS).map((d) =>
      d.toLowerCase().replace(/^@/, ""),
    ),
    requireVerifiedEmail: process.env.OIDC_REQUIRE_EMAIL_VERIFIED !== "false",
  };
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
  end_session_endpoint?: string;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

/** Discovery + JWKS are cached: both are stable, and re-fetching per login is a self-DoS. */
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Bound on any IdP call so a hung IdP can't pin a Strapi worker. */
const FETCH_TIMEOUT_MS = 8000;

let discoveryCache: { value: Discovery; expiresAt: number } | null = null;
let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`IdP request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

export async function discover(config: OidcConfig): Promise<Discovery> {
  if (discoveryCache && Date.now() < discoveryCache.expiresAt) return discoveryCache.value;

  const url = `${config.issuer}/.well-known/openid-configuration`;
  const doc = (await fetchJson(url)) as Discovery;

  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error("IdP discovery document is missing required endpoints");
  }
  // The document's own `issuer` must match what we asked for, or a compromised
  // discovery URL could point us at somebody else's token endpoint.
  if (doc.issuer?.replace(/\/$/, "") !== config.issuer) {
    throw new Error(`IdP issuer mismatch: expected ${config.issuer}, got ${doc.issuer}`);
  }
  discoveryCache = { value: doc, expiresAt: Date.now() + DISCOVERY_TTL_MS };
  return doc;
}

async function getJwks(config: OidcConfig, force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const doc = await discover(config);
  const jwks = (await fetchJson(doc.jwks_uri)) as { keys?: Jwk[] };
  const keys = jwks.keys ?? [];
  jwksCache = { keys, expiresAt: Date.now() + JWKS_TTL_MS };
  return keys;
}

/** URL-safe base64 without padding, as used throughout OAuth/JOSE. */
function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

export interface AuthRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Build the authorization URL plus the three one-time values that must be
 * remembered for the callback:
 *  - `state` binds the callback to *this* browser (CSRF on the auth flow),
 *  - `nonce` binds the ID token to this request (token-replay),
 *  - `codeVerifier` (PKCE S256) binds the code to this client even if the code
 *    leaks via a Referer, a proxy log or a shared device's history.
 *
 * PKCE is used even though this is a confidential client with a secret: it costs
 * nothing and removes the whole class of authorization-code interception.
 */
export async function buildAuthRequest(config: OidcConfig): Promise<AuthRequest> {
  const doc = await discover(config);

  const state = base64Url(randomBytes(32));
  const nonce = base64Url(randomBytes(32));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());

  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (config.requestedAcrValues.length > 0) {
    url.searchParams.set("acr_values", config.requestedAcrValues.join(" "));
  }

  return { url: url.toString(), state, nonce, codeVerifier };
}

export interface TokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** Exchange the code for tokens. Client authentication is `client_secret_basic`. */
export async function exchangeCode(
  config: OidcConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const doc = await discover(config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      authorization: `Basic ${basic}`,
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    // The IdP's error body can contain the code; never surface it to the browser.
    throw new Error(`token exchange failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  azp?: string;
  acr?: string;
  amr?: string[];
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

/**
 * Signature algorithms we accept.
 *
 * `none` and the whole HMAC (`HS*`) family are excluded deliberately: accepting
 * `HS256` alongside `RS256` is the key-confusion attack, where an attacker signs
 * a token with the *public* key as the HMAC secret and a naive verifier accepts
 * it. Excluding them at the allow-list makes that unreachable regardless of what
 * the rest of the code does.
 *
 * `PS*` (RSASSA-PSS) is omitted rather than approximated: getting its
 * `saltLength` wrong would either reject valid tokens or, worse, accept
 * malleable ones. No mainstream IdP requires it, and adding it correctly is a
 * small, deliberate change if VNG's IdP turns out to need it.
 */
const ALLOWED_ALGS: Record<string, { verifier: string; keyType: string }> = {
  RS256: { verifier: "RSA-SHA256", keyType: "RSA" },
  RS384: { verifier: "RSA-SHA384", keyType: "RSA" },
  RS512: { verifier: "RSA-SHA512", keyType: "RSA" },
  ES256: { verifier: "SHA256", keyType: "EC" },
  ES384: { verifier: "SHA384", keyType: "EC" },
  ES512: { verifier: "SHA512", keyType: "EC" },
};

/** Tolerance for clock skew between us and the IdP, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * Verify an ID token and return its claims.
 *
 * Every check below is required by OIDC Core §3.1.3.7, and each one is load-bearing:
 *
 *  1. `alg` is on an allow-list — this is the `alg: none` / `HS256`-with-public-key
 *     confusion attack, which is *the* classic JWT bypass.
 *  2. Signature verifies against a JWKS key selected by `kid`, with a single
 *     forced JWKS refresh on miss (key rotation) and no unbounded refetching.
 *  3. `iss` matches the configured issuer exactly.
 *  4. `aud` contains our `client_id`; if `azp` is present it must be us.
 *  5. `exp` / `iat` are within a 60 s skew.
 *  6. `nonce` matches the one we issued, compared in constant time.
 *  7. MFA evidence (`acr`/`amr`) when `requireMfa`.
 */
export async function verifyIdToken(
  config: OidcConfig,
  idToken: string,
  expectedNonce: string,
): Promise<IdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
    alg?: string;
    kid?: string;
    typ?: string;
  };

  // (1) Algorithm allow-list.
  const alg = header.alg ?? "";
  const spec = ALLOWED_ALGS[alg];
  if (!spec) throw new Error(`ID token uses unsupported alg "${alg}"`);

  // (2) Signature.
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);
  let verified = false;
  for (const force of [false, true]) {
    const keys = await getJwks(config, force);
    const candidates = keys.filter(
      (key) =>
        key.kty === spec.keyType &&
        (header.kid ? key.kid === header.kid : true) &&
        (key.use ? key.use === "sig" : true),
    );
    verified = candidates.some((jwk) => verifyWith(jwk, alg, spec, signingInput, signature));
    if (verified) break;
    // A `kid` we've never seen usually means the IdP rotated keys; retry once
    // with a forced JWKS fetch, then give up (an attacker-chosen `kid` must not
    // be able to make us hammer the IdP).
  }
  if (!verified) throw new Error("ID token signature verification failed");

  const claims = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as IdTokenClaims;

  // (3) Issuer.
  if (claims.iss?.replace(/\/$/, "") !== config.issuer) {
    throw new Error(`ID token issuer mismatch: ${claims.iss}`);
  }

  // (4) Audience.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) {
    throw new Error("ID token audience does not include this client");
  }
  if (claims.azp !== undefined && claims.azp !== config.clientId) {
    throw new Error("ID token azp is not this client");
  }

  // (5) Freshness.
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("ID token has expired");
  }
  if (typeof claims.iat !== "number" || claims.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error("ID token was issued in the future");
  }

  // (6) Nonce — constant-time, and required.
  if (!claims.nonce || !constantTimeEqual(claims.nonce, expectedNonce)) {
    throw new Error("ID token nonce mismatch");
  }

  // (7) MFA assurance.
  if (config.requireMfa && !hasMfaEvidence(claims, config)) {
    throw new Error(
      "the IdP did not assert multi-factor authentication (no matching acr/amr claim)",
    );
  }

  return claims;
}

function verifyWith(
  jwk: Jwk,
  alg: string,
  spec: { verifier: string },
  signingInput: string,
  signature: Buffer,
): boolean {
  try {
    const key = createPublicKey({ key: jwk as never, format: "jwk" });
    const verifier = createVerify(spec.verifier);
    verifier.update(signingInput);
    verifier.end();
    if (alg.startsWith("ES")) {
      // JOSE encodes ECDSA signatures as raw r||s; Node defaults to DER.
      return verifier.verify({ key, dsaEncoding: "ieee-p1363" }, signature);
    }
    return verifier.verify(key, signature);
  } catch {
    return false;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hasMfaEvidence(claims: IdTokenClaims, config: OidcConfig): boolean {
  if (claims.acr && config.mfaAcrValues.includes(claims.acr)) return true;
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.some((method) => config.mfaAmrValues.includes(method));
}

/** Reset caches — used by tests and by an admin-triggered "reload IdP metadata". */
export function resetOidcCaches(): void {
  discoveryCache = null;
  jwksCache = null;
}
