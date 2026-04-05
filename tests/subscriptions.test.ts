import { describe, it, expect, vi } from "vitest";
import { createSubscriptionHelpers } from "../src/subscriptions/index";
import type { DbAdapter } from "../src/subscriptions/index";

function createMockDb(): DbAdapter & { users: Map<string, any> } {
  const users = new Map<string, any>();

  return {
    users,
    findUserById: vi.fn(async (id) => users.get(id) ?? null),
    findUserByWhopId: vi.fn(async (whopUserId) => {
      for (const u of users.values()) {
        if (u.whopUserId === whopUserId) return { email: u.email, name: u.name };
      }
      return null;
    }),
    getUserCreatedAt: vi.fn(async (id) => users.get(id)?.createdAt ?? null),
    upsertMembership: vi.fn(async (whopUserId, plan, membershipId) => {
      const existing = [...users.values()].find((u) => u.whopUserId === whopUserId);
      if (existing) {
        existing.plan = plan;
        existing.whopMembershipId = membershipId;
        existing.cancelAtPeriodEnd = false;
      } else {
        users.set(`new_${whopUserId}`, {
          whopUserId,
          plan,
          whopMembershipId: membershipId,
          cancelAtPeriodEnd: false,
        });
      }
    }),
    deactivateMembership: vi.fn(async (whopUserId, defaultPlan) => {
      for (const u of users.values()) {
        if (u.whopUserId === whopUserId) {
          u.plan = defaultPlan;
          u.whopMembershipId = null;
          u.cancelAtPeriodEnd = false;
        }
      }
    }),
    updateCancelAtPeriodEnd: vi.fn(async (whopUserId, cancel) => {
      for (const u of users.values()) {
        if (u.whopUserId === whopUserId) u.cancelAtPeriodEnd = cancel;
      }
    }),
    uncancelSubscription: vi.fn(async (userId) => {
      const u = users.get(userId);
      if (u) u.cancelAtPeriodEnd = false;
    }),
  };
}

const planKeys = ["free", "starter", "pro"];
const defaultPlan = "free";

describe("createSubscriptionHelpers", () => {
  it("getSubscriptionDetails returns free for nonexistent user", async () => {
    const db = createMockDb();
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    const result = await subs.getSubscriptionDetails("nonexistent");
    expect(result.hasSubscription).toBe(false);
    expect(result.error).toBe("User not found");
  });

  it("getSubscriptionDetails returns free for free users", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "free", whopMembershipId: null, cancelAtPeriodEnd: false });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    const result = await subs.getSubscriptionDetails("u1");
    expect(result.hasSubscription).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("getSubscriptionDetails returns active subscription for paid users", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "pro", whopMembershipId: "mem_1", cancelAtPeriodEnd: false });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    const result = await subs.getSubscriptionDetails("u1");
    expect(result.hasSubscription).toBe(true);
    expect(result.subscription!.plan).toBe("pro");
    expect(result.subscription!.status).toBe("active");
  });

  it("getSubscriptionDetails returns canceling status", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "starter", whopMembershipId: "mem_1", cancelAtPeriodEnd: true });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    const result = await subs.getSubscriptionDetails("u1");
    expect(result.subscription!.status).toBe("canceling");
  });

  it("isUserSubscribed returns true only for active paid users", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "pro", whopMembershipId: "mem_1", cancelAtPeriodEnd: false });
    db.users.set("u2", { plan: "free", whopMembershipId: null, cancelAtPeriodEnd: false });
    db.users.set("u3", { plan: "starter", whopMembershipId: "mem_2", cancelAtPeriodEnd: true });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    expect(await subs.isUserSubscribed("u1")).toBe(true);
    expect(await subs.isUserSubscribed("u2")).toBe(false);
    expect(await subs.isUserSubscribed("u3")).toBe(false); // canceling
  });

  it("getUserSubscriptionStatus returns correct status", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "pro", whopMembershipId: "mem_1", cancelAtPeriodEnd: false });
    db.users.set("u2", { plan: "free", whopMembershipId: null, cancelAtPeriodEnd: false });
    db.users.set("u3", { plan: "starter", whopMembershipId: "mem_2", cancelAtPeriodEnd: true });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    expect(await subs.getUserSubscriptionStatus("u1")).toBe("active");
    expect(await subs.getUserSubscriptionStatus("u2")).toBe("free");
    expect(await subs.getUserSubscriptionStatus("u3")).toBe("canceling");
  });

  it("activateMembership calls db adapter", async () => {
    const db = createMockDb();
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    await subs.activateMembership("whop_1", "pro", "mem_1");
    expect(db.upsertMembership).toHaveBeenCalledWith("whop_1", "pro", "mem_1");
  });

  it("deactivateMembership calls db adapter with default plan", async () => {
    const db = createMockDb();
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    await subs.deactivateMembership("whop_1");
    expect(db.deactivateMembership).toHaveBeenCalledWith("whop_1", "free");
  });

  it("falls back to default plan for invalid plan in DB", async () => {
    const db = createMockDb();
    db.users.set("u1", { plan: "nonexistent_plan", whopMembershipId: null, cancelAtPeriodEnd: false });
    const subs = createSubscriptionHelpers(db, defaultPlan, planKeys);

    const result = await subs.getSubscriptionDetails("u1");
    // "nonexistent_plan" falls back to "free" which is the default
    expect(result.hasSubscription).toBe(false);
  });
});
