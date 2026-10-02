import {
  emailLayout,
  sectionPadding,
  heading,
  divider,
  infoBox,
  keyValueRow,
  COLORS,
} from "./email-layout";

export interface LowBalanceTemplateInput {
  tenantName: string;
  balancePaisa: number;
  thresholdPaisa: number;
}

export function lowBalanceEmailHtml(p: LowBalanceTemplateInput): string {
  const balance = (p.balancePaisa / 100).toFixed(2);
  const threshold = (p.thresholdPaisa / 100).toFixed(2);
  const percentage =
    p.thresholdPaisa > 0
      ? Math.round((p.balancePaisa / p.thresholdPaisa) * 100)
      : 0;

  const barColor = percentage <= 25 ? COLORS.danger : COLORS.warning;
  const barWidth = Math.min(Math.max(percentage, 4), 100);

  const content = sectionPadding(`
    ${heading(
      "Low wallet balance alert",
      `The wallet balance for your organization ${p.tenantName} has dipped below safety threshold limit.`,
    )}

    <!-- Balance Card -->
    <div style="margin:24px 0;background-color:${COLORS.dangerLight};border:1px solid ${COLORS.danger}30;border-radius:12px;padding:24px;text-align:center;">
      <p style="margin:0 0 6px 0;font-size:12px;color:${COLORS.danger};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
        Current Balance
      </p>
      <p style="margin:0;font-size:36px;font-weight:800;color:${COLORS.danger};line-height:1.2;letter-spacing:-1px;">
        ₹${balance}
      </p>
    </div>

    <!-- Progress Bar -->
    <div style="margin:0 0 24px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="font-size:13px;color:${COLORS.textSecondary};padding-bottom:8px;font-weight:600;">
            Remaining Balance safety status
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLORS.border};border-radius:6px;height:10px;overflow:hidden;">
            <div style="background-color:${barColor};width:${barWidth}%;height:10px;border-radius:6px;"></div>
          </td>
        </tr>
        <tr>
          <td style="font-size:12px;color:${COLORS.textMuted};padding-top:6px;text-align:right;font-weight:500;">
            Threshold Limit: ₹${threshold}
          </td>
        </tr>
      </table>
    </div>

    <div style="border:1px solid ${COLORS.border}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Organization", p.tenantName)}
        ${keyValueRow("Current Balance", `<span style="color:${COLORS.danger};font-weight:700;">₹${balance}</span>`)}
        ${keyValueRow("Threshold Trigger", `₹${threshold}`)}
      </table>
    </div>

    ${divider()}

    ${infoBox(
      "<strong>Action Required:</strong> Running campaigns & calling agents will automatically halt if balance reaches ₹0.00. Recharge to ensure service continuity.",
      "danger",
    )}
  `);

  return emailLayout({
    previewText: `CRITICAL: Kooi wallet balance is ₹${balance} (threshold ₹${threshold})`,
    content,
  });
}
