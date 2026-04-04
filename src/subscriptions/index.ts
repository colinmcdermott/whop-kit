// ---------------------------------------------------------------------------
// Subscription helpers — framework-agnostic
// ---------------------------------------------------------------------------
// All database operations go through the DbAdapter interface.
// Templates provide their own adapter (Prisma, Drizzle, raw SQL, etc.).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal user record for subscription operations */
export interface UserRecord {
  id: string;
  whopUserId: string;
  email: string | null;
  name: string | null;
  plan: string;
  whopMembershipId: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}

export type SubscriptionStatus = "active" | "canceling" | "free";

export interface SubscriptionDetails {
  plan: string;
  whopMembershipId: string | null;
  cancelAtPeriodEnd: boolean;
  status: SubscriptionStatus;
}

export interface SubscriptionDetailsResult {
  hasSubscription: boolean;
  subscription?: SubscriptionDetails;
  error?: string;
}

/** Database adapter — implement per ORM/driver */
export interface DbAdapter {
  /** Find a user by internal ID */
  findUserById(
    id: string,
  ): Promise<Pick<
    UserRecord,
    "plan" | "whopMembershipId" | "cancelAtPeriodEnd"
  > | null>;

  /** Find a user by Whop user ID */
  findUserByWhopId(
    whopUserId: string,
  ): Promise<Pick<UserRecord, "email" | "name"> | null>;

  /** Get a user's creation date */
  getUserCreatedAt(id: string): Promise<Date | null>;

  /** Create or update a user on membership activation */
  upsertMembership(
    whopUserId: string,
    plan: string,
    membershipId: string | null,
  ): Promise<void>;

  /** Downgrade a user to the default plan */
  deactivateMembership(whopUserId: string, defaultPlan: string): Promise<void>;

  /** Update the cancel-at-period-end flag */
  updateCancelAtPeriodEnd(
    whopUserId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<void>;

  /** Reverse a pending cancellation by user ID */
  uncancelSubscription(userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SubscriptionHelpers {
  getSubscriptionDetails(userId: string): Promise<SubscriptionDetailsResult>;
  isUserSubscribed(userId: string): Promise<boolean>;
  getUserSubscriptionStatus(userId: string): Promise<SubscriptionStatus>;
  getUserCreatedAt(userId: string): Promise<Date | null>;
  getUserForNotification(
    whopUserId: string,
  ): Promise<{ email: string; name: string | null } | null>;
  activateMembership(
    whopUserId: string,
    plan: string,
    membershipId: string | null,
  ): Promise<void>;
  deactivateMembership(whopUserId: string): Promise<void>;
  updateCancelAtPeriodEnd(
    whopUserId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<void>;
  uncancelSubscription(userId: string): Promise<void>;
}

/**
 * Create subscription helpers bound to a database adapter.
 *
 * @param db - Your database adapter implementation
 * @param defaultPlan - The default/free plan key
 * @param validPlanKeys - Array of all valid plan keys
 *
 * @example
 * import { createSubscriptionHelpers } from 'whop-kit/subscriptions'
 * import { prismaDbAdapter } from './adapters/prisma'
 *
 * const subs = createSubscriptionHelpers(
 *   prismaDbAdapter(prisma),
 *   plans.defaultPlan,
 *   plans.keys,
 * );
 *
 * const result = await subs.getSubscriptionDetails(userId);
 */
export function createSubscriptionHelpers(
  db: DbAdapter,
  defaultPlan: string,
  validPlanKeys: string[],
): SubscriptionHelpers {
  async function getSubscriptionDetails(
    userId: string,
  ): Promise<SubscriptionDetailsResult> {
    try {
      const user = await db.findUserById(userId);
      if (!user) {
        return { hasSubscription: false, error: "User not found" };
      }

      const plan = validPlanKeys.includes(user.plan)
        ? user.plan
        : defaultPlan;
      const isPaid = plan !== defaultPlan;

      if (!isPaid) {
        return { hasSubscription: false };
      }

      return {
        hasSubscription: true,
        subscription: {
          plan,
          whopMembershipId: user.whopMembershipId,
          cancelAtPeriodEnd: user.cancelAtPeriodEnd,
          status: user.cancelAtPeriodEnd ? "canceling" : "active",
        },
      };
    } catch (error) {
      console.error("[whop-kit] Failed to get subscription details:", error);
      return { hasSubscription: false, error: "Database error" };
    }
  }

  async function isUserSubscribed(userId: string): Promise<boolean> {
    const result = await getSubscriptionDetails(userId);
    return (
      result.hasSubscription && result.subscription?.status === "active"
    );
  }

  async function getUserSubscriptionStatus(
    userId: string,
  ): Promise<SubscriptionStatus> {
    const result = await getSubscriptionDetails(userId);
    if (!result.hasSubscription || !result.subscription) return "free";
    return result.subscription.status;
  }

  async function getUserCreatedAt(userId: string): Promise<Date | null> {
    return db.getUserCreatedAt(userId);
  }

  async function getUserForNotification(
    whopUserId: string,
  ): Promise<{ email: string; name: string | null } | null> {
    const user = await db.findUserByWhopId(whopUserId);
    if (!user?.email) return null;
    return { email: user.email, name: user.name };
  }

  async function activateMembership(
    whopUserId: string,
    plan: string,
    membershipId: string | null,
  ): Promise<void> {
    await db.upsertMembership(whopUserId, plan, membershipId);
  }

  async function deactivateMembership(whopUserId: string): Promise<void> {
    await db.deactivateMembership(whopUserId, defaultPlan);
  }

  async function updateCancelAtPeriodEnd(
    whopUserId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<void> {
    await db.updateCancelAtPeriodEnd(whopUserId, cancelAtPeriodEnd);
  }

  async function uncancelSubscription(userId: string): Promise<void> {
    await db.uncancelSubscription(userId);
  }

  return {
    getSubscriptionDetails,
    isUserSubscribed,
    getUserSubscriptionStatus,
    getUserCreatedAt,
    getUserForNotification,
    activateMembership,
    deactivateMembership,
    updateCancelAtPeriodEnd,
    uncancelSubscription,
  };
}
