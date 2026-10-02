export interface EmailLayoutOptions {
  previewText?: string;
  content: string;
}

// ── Direct Brand Assets ──────────────────────────────────────────────
// Original SVG: https://res.cloudinary.com/dl9qoovat/image/upload/v1789448030/kooi_logo_ed2jeb.svg
// Transformed to PNG on-the-fly for 100% email client compatibility (Gmail/Outlook block raw SVG)
export const BRAND_LOGO_URL =
  "https://res.cloudinary.com/dl9qoovat/image/upload/f_png,q_auto,w_500/v1789448030/kooi_logo_ed2jeb.png";

// ── Brand Colors (Dark Canvas + Emerald Accents) ─────────────────────
const COLORS = {
  primary: "#16A34A", // --color-brand-500
  primaryDark: "#15803D", // --color-brand-600
  primaryLight: "#F0FDF4", // --color-brand-50
  background: "#0B0F17", // Dark obsidian outer canvas (makes logo pop)
  headerBg: "#090D16", // Deep dark header background
  card: "#FFFFFF", // Crisp white card body for readability
  surface: "#F8FAFC", // Light neutral for nested tables
  border: "#E2E8F0", // Clean divider line
  textBase: "#0F172A", // Dark charcoal for high contrast body text
  textSecondary: "#334155", // Neutral grey for secondary text
  textMuted: "#64748B", // Muted grey for captions and footer
  success: "#16A34A",
  successLight: "#F0FDF4",
  warning: "#D97706",
  warningLight: "#FFFBEB",
  danger: "#DC2626",
  dangerLight: "#FEF2F2",
} as const;

export { COLORS };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { escapeHtml };

/**
 * User-centric Date & Time formatter.
 * Converts ISO/UTC strings or Date objects into readable strings: "15 Sep 2026, 03:30 PM"
 */
export function formatUserDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return "N/A";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return String(dateInput);

  return date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function emailLayout(options: EmailLayoutOptions): string {
  const { previewText = "", content } = options;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Kooi Notification</title>
  <!--[if mso]>
  <style>body,table,td{font-family:Arial,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;color:${COLORS.textBase};font-size:16px;line-height:1.6;">

  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.background};">${escapeHtml(previewText)}</div>` : ""}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${COLORS.background};padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;">

          <!-- Brand Header / Dark Logo Banner -->
          <tr>
            <td align="center" style="padding:12px 0 28px 0;text-align:center;">
              <a href="https://kooi.ai" target="_blank" style="text-decoration:none;display:inline-block;">
                <img src="${BRAND_LOGO_URL}" 
                     alt="Kooi" 
                     height="40" 
                     style="display:block;height:40px;max-height:40px;width:auto;border:0;outline:none;text-decoration:none;margin:0 auto;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td style="background-color:${COLORS.card};border-radius:14px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 16px 0 16px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:${COLORS.textMuted};line-height:1.5;font-weight:500;">
                This is an automated operational notification from Kooi.
              </p>
              <p style="margin:0;font-size:12px;color:${COLORS.textMuted};line-height:1.5;">
                Need assistance? <a href="mailto:support@kooi.ai" style="color:${COLORS.primary};text-decoration:none;font-weight:600;">Contact Support</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Reusable Layout Components ───────────────────────────────────────

export function sectionPadding(inner: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr><td style="padding:36px 32px;">${inner}</td></tr>
  </table>`;
}

export function heading(text: string, subtext?: string): string {
  return `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${COLORS.textBase};line-height:1.3;letter-spacing:-0.5px;">
      ${escapeHtml(text)}
    </h1>
    ${subtext ? `<p style="margin:0;font-size:15px;color:${COLORS.textSecondary};line-height:1.5;">${escapeHtml(subtext)}</p>` : ""}
  `;
}

export function bodyText(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;color:${COLORS.textSecondary};line-height:1.6;">${text}</p>`;
}

export function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${COLORS.primary};" align="center">
          <a href="${url}" target="_blank"
             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;line-height:1.4;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function divider(): string {
  return `<hr style="margin:24px 0;border:none;border-top:1px solid ${COLORS.border};" />`;
}

export function infoBox(
  text: string,
  variant: "info" | "warning" | "success" | "danger" = "info",
): string {
  const styles = {
    info: { bg: COLORS.primaryLight, color: COLORS.primaryDark },
    warning: { bg: COLORS.warningLight, color: COLORS.warning },
    success: { bg: COLORS.successLight, color: COLORS.success },
    danger: { bg: COLORS.dangerLight, color: COLORS.danger },
  };
  const s = styles[variant];

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">
      <tr>
        <td style="background-color:${s.bg};border-radius:8px;padding:14px 18px;">
          <p style="margin:0;font-size:14px;color:${s.color};line-height:1.5;font-weight:500;">
           ${text}
          </p>
        </td>
      </tr>
    </table>
  `;
}

export function keyValueRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 16px;font-size:14px;color:${COLORS.textMuted};width:140px;vertical-align:top;font-weight:500;">${escapeHtml(label)}</td>
      <td style="padding:10px 16px;font-size:15px;color:${COLORS.textBase};font-weight:600;text-align:right;">${value}</td>
    </tr>
  `;
}
