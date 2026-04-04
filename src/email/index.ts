// ---------------------------------------------------------------------------
// Email — provider-agnostic email sending
// ---------------------------------------------------------------------------
// Supports Resend and SendGrid out of the box via direct fetch calls.
// No SDK dependencies. Add new providers by extending the switch.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailProvider = "resend" | "sendgrid";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export interface EmailConfig {
  provider: EmailProvider;
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Send an email via a configured provider (Resend or SendGrid).
 * Uses direct fetch — no SDK dependency.
 *
 * @example
 * const result = await sendEmail(
 *   { provider: "resend", apiKey: "re_xxxxx" },
 *   {
 *     to: "user@example.com",
 *     from: "noreply@myapp.com",
 *     subject: "Welcome!",
 *     html: "<h1>Hello</h1>",
 *   },
 * );
 */
export async function sendEmail(
  config: EmailConfig,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  try {
    switch (config.provider) {
      case "resend":
        return await sendViaResend(config.apiKey, options);
      case "sendgrid":
        return await sendViaSendGrid(config.apiKey, options);
      default:
        return {
          success: false,
          error: `Unknown email provider: ${config.provider}`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[whop-kit] Email send failed:", message);
    return { success: false, error: message };
  }
}

async function sendViaResend(
  apiKey: string,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (res.ok) return { success: true };

  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  return {
    success: false,
    error: data.message || `Resend error (${res.status})`,
  };
}

async function sendViaSendGrid(
  apiKey: string,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: options.from },
      subject: options.subject,
      content: [{ type: "text/html", value: options.html }],
    }),
  });

  if (res.ok || res.status === 202) return { success: true };

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const errors = data.errors as Array<{ message?: string }> | undefined;
  return {
    success: false,
    error: errors?.[0]?.message || `SendGrid error (${res.status})`,
  };
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters to prevent XSS in email templates */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap email body content in a standard HTML email layout.
 * Inline CSS for maximum email client compatibility.
 *
 * @param body - The inner HTML content
 * @param footerText - Text shown in the footer (e.g. app name)
 */
export function emailWrapper(body: string, footerText: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:32px">
        <tr><td>${body}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:12px;color:#a1a1aa">${escapeHtml(footerText)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
