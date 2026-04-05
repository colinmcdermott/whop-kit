import { describe, it, expect, vi } from "vitest";
import { createWebhookHandler } from "../src/webhooks/index";

// Helper: sign a webhook payload
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

function makeHeaders(msgId: string, signature: string, timestamp: string) {
  return {
    "webhook-id": msgId,
    "webhook-signature": signature,
    "webhook-timestamp": timestamp,
  };
}

const secret = "test_webhook_secret";

describe("createWebhookHandler", () => {
  it("routes events to the correct handler", async () => {
    const onActivated = vi.fn();
    const onDeactivated = vi.fn();

    const handle = createWebhookHandler({
      secret,
      on: {
        membership_activated: onActivated,
        membership_deactivated: onDeactivated,
      },
    });

    const body = JSON.stringify({ type: "membership_activated", data: { user_id: "u1" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await signWebhook(body, secret, "msg_1", timestamp);

    const result = await handle(body, makeHeaders("msg_1", sig, timestamp));

    expect(result.status).toBe(200);
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(onActivated).toHaveBeenCalledWith({ user_id: "u1" }, { type: "membership_activated", data: { user_id: "u1" } });
    expect(onDeactivated).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid signature", async () => {
    const handle = createWebhookHandler({
      secret,
      on: { test: vi.fn() },
    });

    const body = JSON.stringify({ type: "test", data: {} });
    const timestamp = String(Math.floor(Date.now() / 1000));

    const result = await handle(body, makeHeaders("msg_1", "v1,invalid", timestamp));

    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Invalid signature");
  });

  it("returns 400 for invalid JSON", async () => {
    const handle = createWebhookHandler({
      secret,
      on: {},
    });

    const body = "not json at all";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await signWebhook(body, secret, "msg_1", timestamp);

    const result = await handle(body, makeHeaders("msg_1", sig, timestamp));

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid JSON");
  });

  it("returns 413 for oversized payloads", async () => {
    const handle = createWebhookHandler({
      secret,
      on: {},
      maxPayloadSize: 100,
    });

    const result = await handle(
      "x",
      { "webhook-id": "msg_1", "webhook-signature": "sig", "webhook-timestamp": "123" },
      200, // contentLength > maxPayloadSize
    );

    expect(result.status).toBe(413);
  });

  it("returns 200 for unhandled event types", async () => {
    const onUnhandled = vi.fn();

    const handle = createWebhookHandler({
      secret,
      on: {},
      onUnhandled,
    });

    const body = JSON.stringify({ type: "unknown_event", data: { foo: "bar" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await signWebhook(body, secret, "msg_1", timestamp);

    const result = await handle(body, makeHeaders("msg_1", sig, timestamp));

    expect(result.status).toBe(200);
    expect(onUnhandled).toHaveBeenCalledWith("unknown_event", { foo: "bar" });
  });

  it("returns 500 when handler throws", async () => {
    const onError = vi.fn();

    const handle = createWebhookHandler({
      secret,
      on: {
        failing_event: async () => {
          throw new Error("DB connection lost");
        },
      },
      onError,
    });

    const body = JSON.stringify({ type: "failing_event", data: {} });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await signWebhook(body, secret, "msg_1", timestamp);

    const result = await handle(body, makeHeaders("msg_1", sig, timestamp));

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("processing_failed");
    expect(onError).toHaveBeenCalledWith("failing_event", expect.any(Error));
  });

  it("passes the full event to handlers", async () => {
    const handler = vi.fn();

    const handle = createWebhookHandler({
      secret,
      on: { test_event: handler },
    });

    const event = { type: "test_event", data: { user_id: "u1", plan_id: "plan_1" } };
    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await signWebhook(body, secret, "msg_1", timestamp);

    await handle(body, makeHeaders("msg_1", sig, timestamp));

    expect(handler).toHaveBeenCalledWith(
      { user_id: "u1", plan_id: "plan_1" },
      event,
    );
  });
});
