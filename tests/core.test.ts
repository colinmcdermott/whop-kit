import { describe, it, expect } from "vitest";
import { definePlans } from "../src/core/index";

const plans = definePlans({
  free: {
    name: "Free",
    description: "Basic",
    priceMonthly: 0,
    priceYearly: 0,
    features: ["Feature A"],
    highlighted: false,
  },
  starter: {
    name: "Starter",
    description: "Mid tier",
    priceMonthly: 10,
    priceYearly: 100,
    features: ["Feature A", "Feature B"],
    highlighted: true,
    billingIntervals: ["monthly", "yearly"],
  },
  pro: {
    name: "Pro",
    description: "Top tier",
    priceMonthly: 30,
    priceYearly: 300,
    features: ["Feature A", "Feature B", "Feature C"],
    highlighted: false,
    billingIntervals: ["monthly"],
  },
});

describe("definePlans", () => {
  it("derives keys from metadata in insertion order", () => {
    expect(plans.keys).toEqual(["free", "starter", "pro"]);
  });

  it("sets defaultPlan to the first key", () => {
    expect(plans.defaultPlan).toBe("free");
  });

  it("assigns ranks based on key order", () => {
    expect(plans.ranks).toEqual({ free: 0, starter: 1, pro: 2 });
  });

  it("preserves the full metadata object", () => {
    expect(plans.metadata.free.name).toBe("Free");
    expect(plans.metadata.pro.priceMonthly).toBe(30);
  });
});

describe("hasMinimum", () => {
  it("returns true when user plan equals minimum", () => {
    expect(plans.hasMinimum("starter", "starter")).toBe(true);
  });

  it("returns true when user plan exceeds minimum", () => {
    expect(plans.hasMinimum("pro", "free")).toBe(true);
    expect(plans.hasMinimum("pro", "starter")).toBe(true);
  });

  it("returns false when user plan is below minimum", () => {
    expect(plans.hasMinimum("free", "starter")).toBe(false);
    expect(plans.hasMinimum("free", "pro")).toBe(false);
    expect(plans.hasMinimum("starter", "pro")).toBe(false);
  });
});

describe("getBillingIntervals", () => {
  it("defaults to monthly + yearly when not specified", () => {
    expect(plans.getBillingIntervals("free")).toEqual(["monthly", "yearly"]);
  });

  it("respects explicit billing intervals", () => {
    expect(plans.getBillingIntervals("pro")).toEqual(["monthly"]);
  });

  it("returns a new array each time (no mutation risk)", () => {
    const a = plans.getBillingIntervals("free");
    const b = plans.getBillingIntervals("free");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("config key helpers", () => {
  it("generates correct config keys", () => {
    expect(plans.configKey("starter")).toBe("whop_starter_plan_id");
    expect(plans.configKeyYearly("pro")).toBe("whop_pro_plan_id_yearly");
    expect(plans.priceConfigKey("starter")).toBe("whop_starter_price_monthly");
    expect(plans.priceConfigKeyYearly("pro")).toBe("whop_pro_price_yearly");
    expect(plans.nameConfigKey("free")).toBe("plan_free_name");
  });
});

describe("single plan edge case", () => {
  it("works with only one plan", () => {
    const single = definePlans({
      basic: {
        name: "Basic",
        description: "Only plan",
        priceMonthly: 0,
        priceYearly: 0,
        features: [],
        highlighted: false,
      },
    });

    expect(single.keys).toEqual(["basic"]);
    expect(single.defaultPlan).toBe("basic");
    expect(single.hasMinimum("basic", "basic")).toBe(true);
  });
});
