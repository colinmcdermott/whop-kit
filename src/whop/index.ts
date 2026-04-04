// ---------------------------------------------------------------------------
// Whop API helpers — framework-agnostic
// ---------------------------------------------------------------------------
// Direct fetch calls to Whop's API. No SDK dependency — you can see
// exactly what's happening. Works in any JS runtime with fetch + crypto.
// ---------------------------------------------------------------------------

const WHOP_API_BASE = "https://api.whop.com";

// ---------------------------------------------------------------------------
// Crypto utilities
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomString(len: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function sha256(str: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return base64url(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

export interface AuthorizationUrlResult {
  url: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}

/**
 * Build the Whop OAuth authorization URL with PKCE.
 *
 * @param redirectUri - Your OAuth callback URL
 * @param clientId - Whop App ID
 */
export async function buildAuthorizationUrl(
  redirectUri: string,
  clientId: string,
): Promise<AuthorizationUrlResult> {
  const codeVerifier = randomString(32);
  const codeChallenge = await sha256(codeVerifier);
  const state = randomString(16);
  const nonce = randomString(16);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${WHOP_API_BASE}/oauth/authorize?${params}`,
    codeVerifier,
    state,
    nonce,
  };
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

/**
 * Exchange an authorization code for tokens using PKCE.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
): Promise<TokenResponse> {
  const res = await fetch(`${WHOP_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "Unknown error");
    throw new Error(`Token exchange failed (${res.status}): ${error}`);
  }

  return res.json() as Promise<TokenResponse>;
}

// ---------------------------------------------------------------------------
// User info
// ---------------------------------------------------------------------------

/**
 * OIDC UserInfo response from Whop.
 * Fields depend on the scopes granted: openid, profile, email.
 */
export interface WhopUser {
  /** User ID (e.g. "user_xxxxx") */
  sub: string;
  /** Requires "profile" scope */
  name?: string;
  /** Requires "profile" scope */
  preferred_username?: string;
  /** Requires "profile" scope */
  picture?: string;
  /** Requires "email" scope */
  email?: string;
  /** Requires "email" scope */
  email_verified?: boolean;
}

/**
 * Fetch the authenticated user's profile from Whop's OIDC userinfo endpoint.
 */
export async function getWhopUser(accessToken: string): Promise<WhopUser> {
  const res = await fetch(`${WHOP_API_BASE}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user (${res.status})`);
  }

  return res.json() as Promise<WhopUser>;
}

// ---------------------------------------------------------------------------
// Access verification
// ---------------------------------------------------------------------------

export interface AccessCheckResult {
  hasAccess: boolean;
  accessLevel: string;
}

/**
 * Check if a user has access to a specific Whop resource (product/experience).
 * Uses the Whop API directly for authoritative, real-time access checks.
 *
 * @param whopUserId - The user's Whop ID
 * @param resourceId - The product or experience ID to check
 * @param apiKey - Your Whop API key
 */
export async function checkWhopAccess(
  whopUserId: string,
  resourceId: string,
  apiKey: string,
): Promise<AccessCheckResult> {
  const res = await fetch(
    `${WHOP_API_BASE}/api/v1/users/${whopUserId}/access/${resourceId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    },
  );

  if (res.ok) {
    const data = (await res.json()) as Record<string, unknown>;
    return {
      hasAccess: (data.has_access as boolean) ?? false,
      accessLevel: (data.access_level as string) ?? "no_access",
    };
  }

  if (res.status === 403 || res.status === 404) {
    return { hasAccess: false, accessLevel: "no_access" };
  }

  console.error(
    `[whop-kit] Access check failed (${res.status}) for user ${whopUserId}`,
  );
  return { hasAccess: false, accessLevel: "no_access" };
}

// ---------------------------------------------------------------------------
// Plan details
// ---------------------------------------------------------------------------

export interface WhopPlanDetails {
  id: string;
  initial_price: number | null;
  renewal_price: number | null;
  billing_period: number | null;
  currency: string;
  plan_type: string;
  trial_period_days: number | null;
}

/**
 * Fetch plan details from the Whop API.
 */
export async function fetchWhopPlanDetails(
  planId: string,
  apiKey: string,
): Promise<WhopPlanDetails | null> {
  try {
    const res = await fetch(`${WHOP_API_BASE}/api/v1/plans/${planId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        `[whop-kit] Failed to fetch plan ${planId} (${res.status})`,
      );
      return null;
    }

    return res.json() as Promise<WhopPlanDetails>;
  } catch (err) {
    console.error(`[whop-kit] Error fetching plan ${planId}:`, err);
    return null;
  }
}

/**
 * Get the effective price from a Whop plan's details.
 * Renewal plans use renewal_price; others use initial_price.
 */
export function getEffectivePrice(details: WhopPlanDetails): number {
  return details.plan_type === "renewal"
    ? (details.renewal_price ?? 0)
    : (details.initial_price ?? 0);
}

// ---------------------------------------------------------------------------
// Membership management
// ---------------------------------------------------------------------------

/**
 * Uncancel a membership via the Whop API.
 *
 * @param membershipId - The Whop membership ID
 * @param apiKey - Your Whop API key
 */
export async function uncancelMembership(
  membershipId: string,
  apiKey: string,
): Promise<boolean> {
  const res = await fetch(
    `${WHOP_API_BASE}/api/v1/memberships/${membershipId}/uncancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  return res.ok;
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

export interface WebhookHeaders {
  "webhook-id"?: string | null;
  "webhook-signature"?: string | null;
  "webhook-timestamp"?: string | null;
}

/**
 * Verify a Whop webhook signature.
 * Whop uses the standardwebhooks format: HMAC-SHA256 of "{msg_id}.{timestamp}.{body}".
 *
 * @param body - The raw request body string
 * @param headers - The webhook headers
 * @param webhookSecret - Your webhook signing secret
 */
export async function verifyWebhookSignature(
  body: string,
  headers: WebhookHeaders,
  webhookSecret: string,
): Promise<boolean> {
  const msgId = headers["webhook-id"];
  const signature = headers["webhook-signature"];
  const timestamp = headers["webhook-timestamp"];

  if (!msgId || !signature || !timestamp) return false;

  // Check timestamp to prevent replay attacks (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  const webhookTimestamp = parseInt(timestamp, 10);
  if (Math.abs(now - webhookTimestamp) > 300) return false;

  const secretBytes = new TextEncoder().encode(webhookSecret);
  const toSign = `${msgId}.${timestamp}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(toSign),
  );

  const expectedSignature = `v1,${base64url(new Uint8Array(signatureBytes))}`;

  // Check against all provided signatures (space-separated)
  // Use constant-time comparison to prevent timing attacks
  const providedSignatures = signature.split(" ");
  const expectedBytes = new TextEncoder().encode(expectedSignature);

  return providedSignatures.some((sig) => {
    const sigBytes = new TextEncoder().encode(sig);
    if (sigBytes.length !== expectedBytes.length) return false;
    let diff = 0;
    for (let i = 0; i < sigBytes.length; i++) {
      diff |= sigBytes[i] ^ expectedBytes[i];
    }
    return diff === 0;
  });
}
