// ---------------------------------------------------------------------------
// Core plan system — framework-agnostic, parameterized
// ---------------------------------------------------------------------------
// Users define their own plans via definePlans(). The kit never hardcodes
// plan names, tiers, or pricing. Everything is derived from the definition.
// ---------------------------------------------------------------------------

export type BillingInterval = "monthly" | "yearly";

/** Shape of each plan entry passed to definePlans() */
export interface PlanMetadataEntry {
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: readonly string[];
  highlighted: boolean;
  /** Display-only free trial length (configure the actual trial in Whop) */
  trialDays?: number;
  /** Which billing intervals to offer. Defaults to ["monthly", "yearly"]. */
  billingIntervals?: readonly BillingInterval[];
}

/** The resolved plan system returned by definePlans() */
export interface PlanSystem<K extends string = string> {
  /** The full metadata object as passed in */
  metadata: Record<K, PlanMetadataEntry>;
  /** Ordered array of plan keys (insertion order = hierarchy) */
  keys: K[];
  /** Numeric rank for each plan (used for comparisons) */
  ranks: Record<K, number>;
  /** The lowest-tier plan key (first in metadata) */
  defaultPlan: K;
  /** Check if a user's plan meets or exceeds a minimum plan level */
  hasMinimum: (userPlan: K, minimumPlan: K) => boolean;
  /** Get the billing intervals a plan supports */
  getBillingIntervals: (key: K) => BillingInterval[];
  /** Config key for a plan's Whop plan ID (monthly) */
  configKey: (key: K) => string;
  /** Config key for a plan's Whop plan ID (yearly) */
  configKeyYearly: (key: K) => string;
  /** Config key for a plan's cached price (monthly) */
  priceConfigKey: (key: K) => string;
  /** Config key for a plan's cached price (yearly) */
  priceConfigKeyYearly: (key: K) => string;
  /** Config key for a plan's admin-customized name */
  nameConfigKey: (key: K) => string;
}

/**
 * Define your app's plan system. Key order defines the hierarchy
 * (first = lowest/free, last = highest).
 *
 * @example
 * const plans = definePlans({
 *   free: { name: "Free", description: "Get started", ... },
 *   starter: { name: "Starter", description: "For teams", ... },
 *   pro: { name: "Pro", description: "For power users", ... },
 * });
 *
 * plans.hasMinimum("starter", "free") // true
 * plans.hasMinimum("free", "pro")     // false
 * plans.defaultPlan                    // "free"
 */
export function definePlans<K extends string>(
  metadata: Record<K, PlanMetadataEntry>,
): PlanSystem<K> {
  const keys = Object.keys(metadata) as K[];
  const ranks = Object.fromEntries(
    keys.map((key, index) => [key, index]),
  ) as Record<K, number>;
  const defaultPlan = keys[0];

  return {
    metadata,
    keys,
    ranks,
    defaultPlan,

    hasMinimum(userPlan: K, minimumPlan: K): boolean {
      return (ranks[userPlan] ?? 0) >= (ranks[minimumPlan] ?? 0);
    },

    getBillingIntervals(key: K): BillingInterval[] {
      const meta = metadata[key];
      return [...(meta.billingIntervals ?? ["monthly", "yearly"])];
    },

    configKey: (key: K) => `whop_${key}_plan_id`,
    configKeyYearly: (key: K) => `whop_${key}_plan_id_yearly`,
    priceConfigKey: (key: K) => `whop_${key}_price_monthly`,
    priceConfigKeyYearly: (key: K) => `whop_${key}_price_yearly`,
    nameConfigKey: (key: K) => `plan_${key}_name`,
  };
}
