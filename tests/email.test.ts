import { describe, it, expect } from "vitest";
import { escapeHtml, emailWrapper } from "../src/email/index";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands and quotes", () => {
    expect(escapeHtml('Tom & "Jerry"')).toBe("Tom &amp; &quot;Jerry&quot;");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("emailWrapper", () => {
  it("wraps body in an HTML email layout", () => {
    const html = emailWrapper("<p>Hello</p>", "My App");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("My App");
  });

  it("escapes the footer text", () => {
    const html = emailWrapper("<p>Body</p>", "Tom & Jerry's");
    expect(html).toContain("Tom &amp; Jerry&#39;s");
  });
});
