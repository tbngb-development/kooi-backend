export interface EmailLayoutOptions {
  previewText?: string;
  content: string;
}

const COLORS = {
  primary: "#16A34A",
  primaryDark: "#15803D",
  primaryLight: "#F0FDF4",
  background: "#FFFFFF",
  card: "#FFFFFF",
  surface: "#F9FAFB",
  border: "#E5E7EB",
  textBase: "#000000",
  textSecondary: "#374151",
  textMuted: "#6B7280",
  success: "#16A34A",
  successLight: "#F0FDF4",
  warning: "#CA8A04",
  warningLight: "#FEFCE8",
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

export function emailLayout(options: EmailLayoutOptions): string {
  const { previewText = "", content } = options;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title></title>
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

          <!-- Brand Header -->
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <span style="font-size:26px;font-weight:800;color:${COLORS.textBase};letter-spacing:-1px;">Kooi</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:${COLORS.card};border-radius:12px;border:1px solid ${COLORS.border};overflow:hidden;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 0 0 0;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;color:${COLORS.textMuted};line-height:1.5;">
                This is an automated message from Kooi.
              </p>
              <p style="margin:0;font-size:13px;color:${COLORS.textMuted};line-height:1.5;">
                If you have questions, reply to this email or contact support.
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

// ── Reusable Components ──────────────────────────────────────────────

export function sectionPadding(inner: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr><td style="padding:36px 32px;">${inner}</td></tr>
  </table>`;
}

export function heading(text: string, subtext?: string): string {
  return `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:${COLORS.textBase};line-height:1.3;">
      ${escapeHtml(text)}
    </h1>
    ${subtext ? `<p style="margin:0;font-size:16px;color:${COLORS.textSecondary};line-height:1.5;">${escapeHtml(subtext)}</p>` : ""}
  `;
}

export function bodyText(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:16px;color:${COLORS.textSecondary};line-height:1.6;">${text}</p>`;
}

export function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${COLORS.primary};">
          <a href="${url}" target="_blank"
             style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;line-height:1.4;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function divider(): string {
  return `<hr style="margin:28px 0;border:none;border-top:1px solid ${COLORS.border};" />`;
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
        <td style="background-color:${s.bg};border-radius:8px;padding:16px 18px;">
          <p style="margin:0;font-size:15px;color:${s.color};line-height:1.5;">
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
      <td style="padding:10px 0;font-size:15px;color:${COLORS.textMuted};width:140px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;font-size:16px;color:${COLORS.textBase};font-weight:500;">${value}</td>
    </tr>
  `;
}
