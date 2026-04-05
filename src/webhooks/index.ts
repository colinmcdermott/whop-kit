// ---------------------------------------------------------------------------
// Webhook handler — declarative event routing with signature verification
// ---------------------------------------------------------------------------
// Bundles signature verification + JSON parsing + event routing + error
// handling into a single call. Templates just register callbacks.
// ---------------------------------------------------------------------------

import { verifyWebhookSignature } from "../whop/index.js";
import type { WebhookHeaders } from "../whop/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw webhook event from Whop */
export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/** Result returned by the webhook handler */
export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/** Event handler callback */
export type EventHandler = (
  data: Record<string, unknown>,
  event: WebhookEvent,
) => void | Promise<void>;

export interface WebhookHandlerOptions {
  /** Your webhook signing secret */
  secret: string;
  /** Map of event type → handler function */
  on: Record<string, EventHandler>;
  /** Max payload size in bytes. Defaults to 1MB. */
  maxPayloadSize?: number;
  /** Called for unhandled event types. Defaults to console.log. */
  onUnhandled?: (eventType: string, data: Record<string, unknown>) => void;
  /** Called when an event handler throws. Defaults to console.error. */
  onError?: (eventType: string, error: unknown) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a webhook handler that verifies signatures and routes events.
 *
 * @example
 * const handle = createWebhookHandler({
 *   secret: process.env.WHOP_WEBHOOK_SECRET,
 *   on: {
 *     membership_activated: async (data) => {
 *       await subs.activateMembership(data.user_id, "pro", data.id);
 *     },
 *     membership_deactivated: async (data) => {
 *       await subs.deactivateMembership(data.user_id);
 *     },
 *   },
 * });
 *
 * // In your route handler:
 * const result = await handle(rawBody, headers);
 * return new Response(JSON.stringify(result.body), { status: result.status });
 */
export function createWebhookHandler(
  options: WebhookHandlerOptions,
): (body: string, headers: WebhookHeaders, contentLength?: number) => Promise<WebhookResult> {
  const {
    secret,
    on,
    maxPayloadSize = 1_000_000,
    onUnhandled = (type) => console.log(`[whop-kit] Unhandled webhook event: ${type}`),
    onError = (type, err) => console.error(`[whop-kit] Webhook error processing ${type}:`, err),
  } = options;

  return async (body, headers, contentLength) => {
    // Guard against oversized payloads
    if (contentLength !== undefined && contentLength > maxPayloadSize) {
      return { status: 413, body: { error: "Payload too large" } };
    }

    // Verify signature
    const isValid = await verifyWebhookSignature(body, headers, secret);
    if (!isValid) {
      return { status: 401, body: { error: "Invalid signature" } };
    }

    // Parse JSON
    let event: WebhookEvent;
    try {
      event = JSON.parse(body);
    } catch {
      return { status: 400, body: { error: "Invalid JSON" } };
    }

    const eventType = event.type;
    console.log(`[whop-kit] Webhook received: ${eventType}`);

    // Route to handler
    const handler = on[eventType];
    if (!handler) {
      onUnhandled(eventType, event.data);
      return { status: 200, body: { received: true } };
    }

    try {
      await handler(event.data, event);
      return { status: 200, body: { received: true } };
    } catch (err) {
      onError(eventType, err);
      // Return 500 so Whop retries — the event was authenticated
      // but processing failed (likely a DB error)
      return { status: 500, body: { error: "processing_failed" } };
    }
  };
}
