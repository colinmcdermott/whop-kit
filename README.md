# whop-kit

Framework-agnostic toolkit for building apps with [Whop](https://whop.com) authentication, payments, and memberships.

Use whop-kit to add Whop OAuth, subscription management, webhook handling, and plan gating to any JavaScript framework — Next.js, Astro, SvelteKit, Express, or anything with `fetch` and `crypto`.

## Install

```bash
npm install whop-kit jose
```

`jose` is a peer dependency used for JWT signing/verification.

## Modules

Import only what you need via subpath exports:

```typescript
import { definePlans } from "whop-kit/core";
import { createSessionToken, verifySessionToken } from "whop-kit/auth";
import { buildAuthorizationUrl, verifyWebhookSignature } from "whop-kit/whop";
import { createWebhookHandler } from "whop-kit/webhooks";
import { createConfigManager } from "whop-kit/config";
import { createSubscriptionHelpers } from "whop-kit/subscriptions";
import { sendEmail } from "whop-kit/email";
import { getAnalyticsScript } from "whop-kit/analytics";
import { cn, formatDate } from "whop-kit/utils";
```

## Quick Start

### 1. Define your plans

```typescript
import { definePlans } from "whop-kit/core";

export const plans = definePlans({
  free: {
    name: "Free",
    description: "Get started",
    priceMonthly: 0,
    priceYearly: 0,
    features: ["3 projects", "Community support"],
    highlighted: false,
  },
  pro: {
    name: "Pro",
    description: "For power users",
    priceMonthly: 29,
    priceYearly: 290,
    features: ["Unlimited projects", "Priority support"],
    highlighted: true,
  },
});

plans.hasMinimum("pro", "free"); // true
plans.hasMinimum("free", "pro"); // false
plans.defaultPlan;               // "free"
plans.keys;                      // ["free", "pro"]
```

Key order defines the hierarchy — first is lowest, last is highest.

### 2. Handle authentication

```typescript
import {
  createSessionToken,
  verifySessionToken,
  encodeSecret,
} from "whop-kit/auth";

const secret = encodeSecret(process.env.SESSION_SECRET);

// After OAuth callback — create a session
const token = await createSessionToken(
  {
    userId: "user_123",
    whopUserId: "user_xxxxx",
    email: "user@example.com",
    name: "Jane",
    profileImageUrl: null,
    plan: "pro",
    cancelAtPeriodEnd: false,
    isAdmin: false,
  },
  secret,
);

// On subsequent requests — verify the session
const session = await verifySessionToken(token, secret, plans.keys, plans.defaultPlan);
```

### 3. OAuth with Whop

```typescript
import { buildAuthorizationUrl, exchangeCodeForTokens, getWhopUser } from "whop-kit/whop";

// Step 1: Redirect user to Whop
const { url, codeVerifier, state } = await buildAuthorizationUrl(
  "https://myapp.com/api/auth/callback",
  "app_xxxxx", // your Whop App ID
);
// Store codeVerifier + state in a cookie, then redirect to `url`

// Step 2: Handle the callback
const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri, clientId);
const user = await getWhopUser(tokens.access_token);
// user.sub = "user_xxxxx", user.email, user.name, etc.
```

### 4. Handle webhooks

Use `createWebhookHandler` for declarative event routing with built-in signature verification:

```typescript
import { createWebhookHandler } from "whop-kit/webhooks";

const handle = createWebhookHandler({
  secret: process.env.WHOP_WEBHOOK_SECRET,
  on: {
    membership_activated: async (data) => {
      await subs.activateMembership(data.user_id, "pro", data.id);
    },
    membership_deactivated: async (data) => {
      await subs.deactivateMembership(data.user_id);
    },
    payment_failed: async (data) => {
      await sendPaymentFailedEmail(data.user_id);
    },
  },
});

// In your route handler (any framework):
const result = await handle(rawBody, {
  "webhook-id": request.headers.get("webhook-id"),
  "webhook-signature": request.headers.get("webhook-signature"),
  "webhook-timestamp": request.headers.get("webhook-timestamp"),
});
return new Response(JSON.stringify(result.body), { status: result.status });
```

Or use `verifyWebhookSignature` directly for manual control:

```typescript
import { verifyWebhookSignature } from "whop-kit/whop";

const isValid = await verifyWebhookSignature(rawBody, headers, secret);
```

### 5. Check access

```typescript
import { checkWhopAccess } from "whop-kit/whop";

const { hasAccess } = await checkWhopAccess(
  "user_xxxxx",    // Whop user ID
  "prod_xxxxx",    // product or experience ID
  "your-api-key",
);
```

### 6. Manage subscriptions

Subscription helpers use a database adapter pattern — bring your own ORM:

```typescript
import { createSubscriptionHelpers } from "whop-kit/subscriptions";

const subs = createSubscriptionHelpers(myDbAdapter, plans.defaultPlan, plans.keys);

await subs.activateMembership("user_xxxxx", "pro", "mem_xxxxx");
const result = await subs.getSubscriptionDetails(userId);
const status = await subs.getUserSubscriptionStatus(userId); // "active" | "canceling" | "free"
```

### 7. Configuration

Key-value config with in-memory caching and env var fallback:

```typescript
import { createConfigManager } from "whop-kit/config";

const config = createConfigManager({
  store: myConfigStore, // implements { get(key): Promise<string|null>, set(key, value): Promise<void> }
  envMap: {
    whop_app_id: "WHOP_APP_ID",
    whop_api_key: "WHOP_API_KEY",
  },
  cacheTtlMs: 30_000, // 30s default
});

const appId = await config.get("whop_app_id"); // checks cache → env → store
```

### 8. Send emails

```typescript
import { sendEmail, emailWrapper, escapeHtml } from "whop-kit/email";

const result = await sendEmail(
  { provider: "resend", apiKey: "re_xxxxx" },
  {
    to: "user@example.com",
    from: "hello@myapp.com",
    subject: "Welcome!",
    html: emailWrapper(
      `<h1>Hi ${escapeHtml(name)}</h1><p>Welcome to the app.</p>`,
      "My App",
    ),
  },
);
```

Supports Resend and SendGrid via direct `fetch` — no SDK needed.

### 9. Analytics

Generate script tags for PostHog, Google Analytics, or Plausible with XSS-safe ID validation:

```typescript
import { getAnalyticsScript } from "whop-kit/analytics";

const script = getAnalyticsScript({ provider: "posthog", id: "phc_xxxxx" });
// Returns the <script> tag as a string, or null if ID format is invalid
// Inject into your <head> however your framework supports it
```

## Adapter Pattern

whop-kit is framework-agnostic through two adapter interfaces:

### CookieAdapter

Implement per framework to enable cookie-based sessions:

```typescript
import type { CookieAdapter } from "whop-kit/auth";

// Next.js
import { cookies } from "next/headers";

const nextCookies: CookieAdapter = {
  async get(name) {
    return (await cookies()).get(name)?.value;
  },
  async set(name, value, options) {
    (await cookies()).set(name, value, options);
  },
  async delete(name) {
    (await cookies()).set(name, "", { maxAge: 0, path: "/" });
  },
};

// Astro
const astroCookies = (Astro): CookieAdapter => ({
  get: (name) => Astro.cookies.get(name)?.value,
  set: (name, value, opts) => Astro.cookies.set(name, value, opts),
  delete: (name) => Astro.cookies.delete(name),
});
```

### DbAdapter

Implement per ORM for subscription management:

```typescript
import type { DbAdapter } from "whop-kit/subscriptions";

// Prisma example
const prismaAdapter: DbAdapter = {
  async findUserById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { plan: true, whopMembershipId: true, cancelAtPeriodEnd: true },
    });
  },
  async upsertMembership(whopUserId, plan, membershipId) {
    await prisma.user.upsert({
      where: { whopUserId },
      update: { plan, whopMembershipId: membershipId, cancelAtPeriodEnd: false },
      create: { whopUserId, plan, whopMembershipId: membershipId },
    });
  },
  // ... other methods
};
```

### ConfigStore

Implement for persistent config storage:

```typescript
import type { ConfigStore } from "whop-kit/config";

// Prisma example
const prismaConfigStore: ConfigStore = {
  async get(key) {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  },
  async set(key, value) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  },
};
```

## API Reference

### `whop-kit/core`

| Export | Description |
|--------|-------------|
| `definePlans(metadata)` | Create a type-safe plan system with hierarchy, ranks, and helpers |
| `PlanMetadataEntry` | Shape of each plan entry |
| `PlanSystem<K>` | The resolved plan system with all derived helpers |
| `BillingInterval` | `"monthly" \| "yearly"` |

### `whop-kit/auth`

| Export | Description |
|--------|-------------|
| `createSessionToken(session, secret, options?)` | Create a signed JWT |
| `verifySessionToken(token, secret, planKeys, defaultPlan)` | Verify and decode a JWT |
| `setSessionCookie(session, secret, cookies, isProduction?)` | Set session + login indicator cookies |
| `clearSessionCookie(cookies, isProduction?)` | Clear session cookies |
| `getSessionFromCookie(cookies, secret, planKeys, defaultPlan, refreshPlan?)` | Read session from cookies with optional DB refresh |
| `generateSecret(byteLength?)` | Generate a hex-encoded secret |
| `encodeSecret(secret)` | Encode a string secret to Uint8Array |
| `Session` | Session payload interface |
| `CookieAdapter` | Cookie interface to implement per framework |

### `whop-kit/whop`

| Export | Description |
|--------|-------------|
| `buildAuthorizationUrl(redirectUri, clientId)` | Build OAuth URL with PKCE |
| `exchangeCodeForTokens(code, verifier, redirectUri, clientId)` | Exchange auth code for tokens |
| `getWhopUser(accessToken)` | Fetch user profile from OIDC endpoint |
| `checkWhopAccess(whopUserId, resourceId, apiKey)` | Real-time access check |
| `fetchWhopPlanDetails(planId, apiKey)` | Fetch plan pricing from Whop API |
| `getEffectivePrice(details)` | Extract the effective price from plan details |
| `uncancelMembership(membershipId, apiKey)` | Reverse a pending cancellation |
| `verifyWebhookSignature(body, headers, secret)` | HMAC-SHA256 webhook verification |

### `whop-kit/config`

| Export | Description |
|--------|-------------|
| `createConfigManager(options)` | Create a config manager with caching + env fallback |
| `ConfigStore` | Persistent store interface to implement |
| `ConfigManager` | The config manager with `get`, `set`, `setMany`, `clearCache` |

### `whop-kit/subscriptions`

| Export | Description |
|--------|-------------|
| `createSubscriptionHelpers(db, defaultPlan, planKeys)` | Create all subscription CRUD helpers |
| `DbAdapter` | Database interface to implement per ORM |
| `SubscriptionStatus` | `"active" \| "canceling" \| "free"` |

### `whop-kit/email`

| Export | Description |
|--------|-------------|
| `sendEmail(config, options)` | Send via Resend or SendGrid |
| `escapeHtml(text)` | Escape HTML for safe email rendering |
| `emailWrapper(body, footerText)` | Wrap content in a standard email layout |

### `whop-kit/utils`

| Export | Description |
|--------|-------------|
| `cn(...classes)` | Merge class names, filtering falsy values |
| `monthlyEquivalent(yearlyTotal)` | Calculate monthly price from yearly |
| `formatDate(date)` | Format a date as "Jan 1, 2026" |

### `whop-kit/analytics`

| Export | Description |
|--------|-------------|
| `getAnalyticsScript(config)` | Generate `<script>` tag for PostHog, Google Analytics, or Plausible |
| `isValidAnalyticsId(provider, id)` | Validate an analytics ID format (XSS prevention) |
| `ANALYTICS_ID_PATTERNS` | Regex patterns for each provider |
| `AnalyticsProvider` | `"posthog" \| "google" \| "plausible"` |
| `AnalyticsConfig` | `{ provider, id }` |

### `whop-kit/webhooks`

| Export | Description |
|--------|-------------|
| `createWebhookHandler(options)` | Create a handler with signature verification + event routing |
| `WebhookEvent` | `{ type, data }` |
| `WebhookResult` | `{ status, body }` |
| `EventHandler` | Callback type for event handlers |

## Templates

Official starter templates built on whop-kit:

- **[whop-saas-starter-v2](https://github.com/colinmcdermott/whop-saas-starter-v2)** — Next.js SaaS with auth, payments, dashboard, and docs
- **[whop-astro-starter](https://github.com/colinmcdermott/whop-astro-starter)** — Astro 5 with auth, payments, and webhooks

## License

MIT
