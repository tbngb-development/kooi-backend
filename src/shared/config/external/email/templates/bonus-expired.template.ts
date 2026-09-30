import {
  emailLayout,
  sectionPadding,
  heading,
  divider,
  infoBox,
  keyValueRow,
  COLORS,
} from "./email-layout";

export interface BonusExpiredTemplateInput {
  tenantName: string;
  expiredAmountPaisa: number;
  currency: string;
}

export function bonusExpiredEmailHtml(p: BonusExpiredTemplateInput): string {
  const expiredAmount = (p.expiredAmountPaisa / 100).toFixed(2);

  const content = sectionPadding(`
    ${heading(
      "Bonus credits expired",
      `The promotional bonus credits on your Kooi wallet have expired and been removed.`,
    )}

    <!-- Expired Amount Card -->
    <div style="margin:24px 0;background-color:${COLORS.warningLight};border:1px solid ${COLORS.warning}30;border-radius:12px;padding:24px;text-align:center;">
      <p style="margin:0 0 6px 0;font-size:12px;color:${COLORS.warning};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
        Expired Bonus
      </p>
      <p style="margin:0;font-size:36px;font-weight:800;color:${COLORS.warning};line-height:1.2;letter-spacing:-1px;">
        ₹${expiredAmount}
      </p>
    </div>

    <div style="border:1px solid ${COLORS.border}; border-radius:8px; overflow:hidden; margin-bottom:24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Organization", p.tenantName)}
        ${keyValueRow("Expired Amount", `<span style="color:${COLORS.warning};font-weight:700;">₹${expiredAmount}</span>`)}
        ${keyValueRow("Currency", p.currency)}
      </table>
    </div>

    ${divider()}

    ${infoBox(
      "<strong>Note:</strong> Your cash balance remains unaffected. You can continue making calls using your cash balance. Recharge anytime to top up.",
      "warning",
    )}
  `);

  return emailLayout({
    previewText: `Kooi bonus credits of ₹${expiredAmount} have expired`,
    content,
  });
}
