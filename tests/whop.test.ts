import { describe, it, expect, vi } from "vitest";
import {
  randomString,
  sha256,
  verifyWebhookSignature,
  getEffectivePrice,
} from "../src/whop/index";
import type { WhopPlanDetails } from "../src/whop/index";

describe("randomString", () => {
  it("generates a string of reasonable length", () => {
    const s = randomString(32);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("generates unique strings", () => {
    const a = randomString(32);
    const b = randomString(32);
    expect(a).not.toBe(b);
  });
});

describe("sha256", () => {
  it("returns a base64url-encoded hash", async () => {
    const hash = await sha256("hello");
    expect(typeof hash).toBe("string");
    // Should not contain +, /, or = (base64url encoding)
    expect(hash).not.toMatch(/[+/=]/);
  });

  it("produces consistent output for the same input", async () => {
    const a = await sha256("test");
    const b = await sha256("test");
    expect(a).toBe(b);
  });

  it("produces different output for different input", async () => {
    const a = await sha256("hello");
    const b = await sha256("world");
    expect(a).not.toBe(b);
  });
});

describe("verifyWebhookSignature", () => {
  async function signWebhook(body: string, secret: string, msgId: string, timestamp: string) {
    const secretBytes = new TextEncoder().encode(secret);
    const toSign = `${msgId}.${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `v1,${b64}`;
  }

  const secret = "whsec_test_secret";
  const body = '{"action":"membership_activated","data":{}}';
  const msgId = "msg_123";

  it("verifies a valid signature", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signWebhook(body, secret, msgId, timestamp);

    const isValid = await verifyWebhookSignature(
      body,
      { "webhook-id": msgId, "webhook-signature": signature, "webhook-timestamp": timestamp },
      secret,
    );
    expect(isValid).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));

    const isValid = await verifyWebhookSignature(
      body,
      { "webhook-id": msgId, "webhook-signature": "v1,invalidsignature", "webhook-timestamp": timestamp },
      secret,
    );
    expect(isValid).toBe(false);
  });

  it("rejects when headers are missing", async () => {
    const isValid = await verifyWebhookSignature(
      body,
      { "webhook-id": null, "webhook-signature": null, "webhook-timestamp": null },
      secret,
    );
    expect(isValid).toBe(false);
  });

  it("rejects a replayed webhook (timestamp too old)", async () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 min ago
    const signature = await signWebhook(body, secret, msgId, oldTimestamp);

    const isValid = await verifyWebhookSignature(
      body,
      { "webhook-id": msgId, "webhook-signature": signature, "webhook-timestamp": oldTimestamp },
      secret,
    );
    expect(isValid).toBe(false);
  });

  it("rejects a signature with wrong body", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signWebhook(body, secret, msgId, timestamp);

    const isValid = await verifyWebhookSignature(
      '{"different":"body"}',
      { "webhook-id": msgId, "webhook-signature": signature, "webhook-timestamp": timestamp },
      secret,
    );
    expect(isValid).toBe(false);
  });

  it("accepts when signature is one of multiple space-separated signatures", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const validSig = await signWebhook(body, secret, msgId, timestamp);
    const multiSig = `v1,garbage ${validSig}`;

    const isValid = await verifyWebhookSignature(
      body,
      { "webhook-id": msgId, "webhook-signature": multiSig, "webhook-timestamp": timestamp },
      secret,
    );
    expect(isValid).toBe(true);
  });
});

describe("getEffectivePrice", () => {
  it("returns renewal_price for renewal plans", () => {
    const details: WhopPlanDetails = {
      id: "plan_1",
      initial_price: 1000,
      renewal_price: 500,
      billing_period: 30,
      currency: "usd",
      plan_type: "renewal",
      trial_period_days: null,
    };
    expect(getEffectivePrice(details)).toBe(500);
  });

  it("returns initial_price for non-renewal plans", () => {
    const details: WhopPlanDetails = {
      id: "plan_2",
      initial_price: 2000,
      renewal_price: null,
      billing_period: null,
      currency: "usd",
      plan_type: "one_time",
      trial_period_days: null,
    };
    expect(getEffectivePrice(details)).toBe(2000);
  });

  it("defaults to 0 when prices are null", () => {
    const details: WhopPlanDetails = {
      id: "plan_3",
      initial_price: null,
      renewal_price: null,
      billing_period: null,
      currency: "usd",
      plan_type: "renewal",
      trial_period_days: null,
    };
    expect(getEffectivePrice(details)).toBe(0);
  });
});
