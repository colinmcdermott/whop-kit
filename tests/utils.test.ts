import { describe, it, expect } from "vitest";
import { cn, monthlyEquivalent, formatDate } from "../src/utils/index";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "b", "")).toBe("a b");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});

describe("monthlyEquivalent", () => {
  it("divides yearly by 12 and rounds to 2 decimals", () => {
    expect(monthlyEquivalent(120)).toBe(10);
    expect(monthlyEquivalent(290)).toBe(24.17);
    expect(monthlyEquivalent(0)).toBe(0);
  });
});

describe("formatDate", () => {
  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-01-15"));
    expect(result).toContain("Jan");
    expect(result).toContain("2026");
  });

  it("formats a date string", () => {
    const result = formatDate("2026-06-01");
    expect(result).toContain("2026");
  });
});
