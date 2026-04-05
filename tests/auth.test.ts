import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  generateSecret,
  encodeSecret,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromCookie,
} from "../src/auth/index";
import type { Session, CookieAdapter } from "../src/auth/index";

const testSecret = encodeSecret("test-secret-at-least-32-chars-long!!");
const validPlanKeys = ["free", "starter", "pro"];
const defaultPlan = "free";

const testSession: Session = {
  userId: "user_123",
  whopUserId: "whop_456",
  email: "test@example.com",
  name: "Test User",
  profileImageUrl: null,
  plan: "starter",
  cancelAtPeriodEnd: false,
  isAdmin: false,
};

describe("generateSecret", () => {
  it("generates a hex string of expected length", () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique secrets", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });

  it("respects custom byte length", () => {
    const short = generateSecret(16);
    expect(short).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});

describe("encodeSecret", () => {
  it("encodes a string to Uint8Array", () => {
    const encoded = encodeSecret("hello");
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBe(5);
  });
});

describe("createSessionToken + verifySessionToken", () => {
  it("round-trips a session through JWT", async () => {
    const token = await createSessionToken(testSession, testSecret);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

    const decoded = await verifySessionToken(token, testSecret, validPlanKeys, defaultPlan);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user_123");
    expect(decoded!.whopUserId).toBe("whop_456");
    expect(decoded!.email).toBe("test@example.com");
    expect(decoded!.plan).toBe("starter");
    expect(decoded!.isAdmin).toBe(false);
  });

  it("returns null for an invalid token", async () => {
    const decoded = await verifySessionToken("garbage.token.here", testSecret, validPlanKeys, defaultPlan);
    expect(decoded).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await createSessionToken(testSession, testSecret);
    const wrongSecret = encodeSecret("wrong-secret-definitely-not-right!!");
    const decoded = await verifySessionToken(token, wrongSecret, validPlanKeys, defaultPlan);
    expect(decoded).toBeNull();
  });

  it("falls back to defaultPlan for invalid plan in JWT", async () => {
    const badPlanSession = { ...testSession, plan: "nonexistent" };
    const token = await createSessionToken(badPlanSession, testSecret);
    const decoded = await verifySessionToken(token, testSecret, validPlanKeys, defaultPlan);
    expect(decoded!.plan).toBe("free");
  });

  it("preserves null fields", async () => {
    const nullSession = { ...testSession, email: null, name: null, profileImageUrl: null };
    const token = await createSessionToken(nullSession, testSecret);
    const decoded = await verifySessionToken(token, testSecret, validPlanKeys, defaultPlan);
    expect(decoded!.email).toBeNull();
    expect(decoded!.name).toBeNull();
    expect(decoded!.profileImageUrl).toBeNull();
  });
});

describe("cookie helpers", () => {
  function createMockCookies(): CookieAdapter & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      get: (name) => store.get(name),
      set: (name, value) => { store.set(name, value); },
      delete: (name) => { store.delete(name); },
    };
  }

  it("setSessionCookie sets session and logged_in cookies", async () => {
    const cookies = createMockCookies();
    await setSessionCookie(testSession, testSecret, cookies);

    expect(cookies.store.has("session")).toBe(true);
    expect(cookies.store.has("logged_in")).toBe(true);
    expect(cookies.store.get("logged_in")).toBe("1");
  });

  it("clearSessionCookie clears both cookies", async () => {
    const cookies = createMockCookies();
    await setSessionCookie(testSession, testSecret, cookies);
    await clearSessionCookie(cookies);

    // Cookies are set to empty string with maxAge 0
    expect(cookies.store.get("session")).toBe("");
    expect(cookies.store.get("logged_in")).toBe("");
  });

  it("getSessionFromCookie reads and verifies the session", async () => {
    const cookies = createMockCookies();
    await setSessionCookie(testSession, testSecret, cookies);

    const session = await getSessionFromCookie(cookies, testSecret, validPlanKeys, defaultPlan);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user_123");
    expect(session!.plan).toBe("starter");
  });

  it("getSessionFromCookie returns null when no cookie exists", async () => {
    const cookies = createMockCookies();
    const session = await getSessionFromCookie(cookies, testSecret, validPlanKeys, defaultPlan);
    expect(session).toBeNull();
  });

  it("getSessionFromCookie calls refreshPlan when provided", async () => {
    const cookies = createMockCookies();
    await setSessionCookie(testSession, testSecret, cookies);

    const session = await getSessionFromCookie(
      cookies,
      testSecret,
      validPlanKeys,
      defaultPlan,
      async () => ({ plan: "pro", cancelAtPeriodEnd: true }),
    );

    expect(session!.plan).toBe("pro");
    expect(session!.cancelAtPeriodEnd).toBe(true);
  });

  it("getSessionFromCookie returns null when refreshPlan returns null (user deleted)", async () => {
    const cookies = createMockCookies();
    await setSessionCookie(testSession, testSecret, cookies);

    const session = await getSessionFromCookie(
      cookies,
      testSecret,
      validPlanKeys,
      defaultPlan,
      async () => null,
    );

    expect(session).toBeNull();
  });
});
