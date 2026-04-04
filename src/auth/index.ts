// ---------------------------------------------------------------------------
// Auth — JWT session management (framework-agnostic)
// ---------------------------------------------------------------------------
// Pure functions that take their dependencies as arguments.
// Framework-specific wrappers (Next.js cookies(), Astro.cookies, etc.)
// live in the template, not the kit.
// ---------------------------------------------------------------------------

import { SignJWT, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The session payload stored in the JWT and used throughout the app */
export interface Session {
  userId: string;
  whopUserId: string;
  email: string | null;
  name: string | null;
  profileImageUrl: string | null;
  plan: string;
  cancelAtPeriodEnd: boolean;
  isAdmin: boolean;
}

/** Options for session token creation */
export interface SessionTokenOptions {
  /** JWT max age in seconds. Defaults to 7 days. */
  maxAge?: number;
}

/** Cookie adapter interface — implement per framework */
export interface CookieAdapter {
  get(name: string): string | undefined | Promise<string | undefined>;
  set(
    name: string,
    value: string,
    options: CookieOptions,
  ): void | Promise<void>;
  delete(name: string): void | Promise<void>;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAge: number;
  path: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const SESSION_COOKIE = "session";
const LOGGED_IN_COOKIE = "logged_in";

// ---------------------------------------------------------------------------
// JWT helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Create a signed JWT session token.
 *
 * @param session - The session payload
 * @param secret - The signing secret (Uint8Array)
 * @param options - Optional token settings
 */
export async function createSessionToken(
  session: Session,
  secret: Uint8Array,
  options?: SessionTokenOptions,
): Promise<string> {
  const maxAge = options?.maxAge ?? DEFAULT_MAX_AGE;
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret);
}

/**
 * Verify and decode a JWT session token.
 *
 * @param token - The JWT string
 * @param secret - The signing secret (Uint8Array)
 * @param validPlanKeys - Array of valid plan keys (to validate the plan field)
 * @param defaultPlan - Fallback plan key if the JWT's plan is invalid
 */
export async function verifySessionToken(
  token: string,
  secret: Uint8Array,
  validPlanKeys: string[],
  defaultPlan: string,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);

    if (
      typeof payload.userId !== "string" ||
      typeof payload.whopUserId !== "string" ||
      typeof payload.plan !== "string"
    ) {
      return null;
    }

    const plan = validPlanKeys.includes(payload.plan)
      ? payload.plan
      : defaultPlan;

    return {
      userId: payload.userId,
      whopUserId: payload.whopUserId,
      email: (payload.email as string) ?? null,
      name: (payload.name as string) ?? null,
      profileImageUrl: (payload.profileImageUrl as string) ?? null,
      plan,
      cancelAtPeriodEnd: (payload.cancelAtPeriodEnd as boolean) ?? false,
      isAdmin: (payload.isAdmin as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie-based session helpers
// ---------------------------------------------------------------------------

/**
 * Set the session cookie (and a non-httpOnly login indicator).
 *
 * @param session - The session payload
 * @param secret - JWT signing secret
 * @param cookies - Framework-specific cookie adapter
 * @param isProduction - Whether to set Secure flag
 */
export async function setSessionCookie(
  session: Session,
  secret: Uint8Array,
  cookies: CookieAdapter,
  isProduction = false,
): Promise<void> {
  const token = await createSessionToken(session, secret);
  const opts: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: DEFAULT_MAX_AGE,
    path: "/",
  };
  await cookies.set(SESSION_COOKIE, token, opts);
  await cookies.set(LOGGED_IN_COOKIE, "1", {
    ...opts,
    httpOnly: false,
  });
}

/**
 * Clear the session cookie.
 *
 * @param cookies - Framework-specific cookie adapter
 * @param isProduction - Whether to set Secure flag
 */
export async function clearSessionCookie(
  cookies: CookieAdapter,
  isProduction = false,
): Promise<void> {
  const opts: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  };
  await cookies.set(SESSION_COOKIE, "", opts);
  await cookies.set(LOGGED_IN_COOKIE, "", { ...opts, httpOnly: false });
}

/**
 * Read and verify the session from cookies, optionally refreshing the plan
 * from the database.
 *
 * @param cookies - Framework-specific cookie adapter
 * @param secret - JWT signing secret
 * @param validPlanKeys - Array of valid plan keys
 * @param defaultPlan - Fallback plan key
 * @param refreshPlan - Optional async function to fetch fresh plan from DB
 */
export async function getSessionFromCookie(
  cookies: CookieAdapter,
  secret: Uint8Array,
  validPlanKeys: string[],
  defaultPlan: string,
  refreshPlan?: (
    userId: string,
  ) => Promise<{ plan: string; cancelAtPeriodEnd: boolean } | null>,
): Promise<Session | null> {
  const token = await cookies.get(SESSION_COOKIE);
  if (!token) return null;

  const session = await verifySessionToken(
    token,
    secret,
    validPlanKeys,
    defaultPlan,
  );
  if (!session) return null;

  if (refreshPlan) {
    const fresh = await refreshPlan(session.userId);
    if (!fresh) return null; // user deleted
    const plan = validPlanKeys.includes(fresh.plan)
      ? fresh.plan
      : defaultPlan;
    return { ...session, plan, cancelAtPeriodEnd: fresh.cancelAtPeriodEnd };
  }

  return session;
}

// ---------------------------------------------------------------------------
// Secret helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure secret string (hex-encoded).
 * Useful for auto-generating SESSION_SECRET on first run.
 */
export function generateSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encode a secret string to Uint8Array (for use with jose) */
export function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
