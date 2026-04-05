import { describe, it, expect } from "vitest";
import {
  getAnalyticsScript,
  isValidAnalyticsId,
} from "../src/analytics/index";

describe("isValidAnalyticsId", () => {
  it("validates Google Analytics IDs", () => {
    expect(isValidAnalyticsId("google", "G-ABC123")).toBe(true);
    expect(isValidAnalyticsId("google", "G-12345678")).toBe(true);
    expect(isValidAnalyticsId("google", "UA-12345")).toBe(false);
    expect(isValidAnalyticsId("google", "invalid")).toBe(false);
  });

  it("validates PostHog IDs", () => {
    expect(isValidAnalyticsId("posthog", "phc_abc123XYZ")).toBe(true);
    expect(isValidAnalyticsId("posthog", "not_posthog")).toBe(false);
    expect(isValidAnalyticsId("posthog", "phc_")).toBe(false);
  });

  it("validates Plausible domains", () => {
    expect(isValidAnalyticsId("plausible", "example.com")).toBe(true);
    expect(isValidAnalyticsId("plausible", "my-site.io")).toBe(true);
    expect(isValidAnalyticsId("plausible", "<script>xss</script>")).toBe(false);
  });
});

describe("getAnalyticsScript", () => {
  it("returns Google Analytics script", () => {
    const script = getAnalyticsScript({ provider: "google", id: "G-ABC123" });
    expect(script).not.toBeNull();
    expect(script).toContain("googletagmanager.com");
    expect(script).toContain("G-ABC123");
  });

  it("returns PostHog script", () => {
    const script = getAnalyticsScript({ provider: "posthog", id: "phc_test123" });
    expect(script).not.toBeNull();
    expect(script).toContain("posthog");
    expect(script).toContain("phc_test123");
  });

  it("returns Plausible script", () => {
    const script = getAnalyticsScript({ provider: "plausible", id: "mysite.com" });
    expect(script).not.toBeNull();
    expect(script).toContain("plausible.io");
    expect(script).toContain("mysite.com");
  });

  it("returns null for invalid IDs (XSS prevention)", () => {
    const script = getAnalyticsScript({
      provider: "google",
      id: "'; alert('xss'); //",
    });
    expect(script).toBeNull();
  });

  it("returns null for empty ID", () => {
    const script = getAnalyticsScript({ provider: "google", id: "" });
    expect(script).toBeNull();
  });
});
