import {
  emailLayout,
  sectionPadding,
  heading,
  bodyText,
  ctaButton,
  divider,
  infoBox,
  keyValueRow,
  formatUserDateTime,
  COLORS,
  escapeHtml,
} from "./email-layout";

export interface InviteTenantTemplateInput {
  tenantName: string;
  planName: string;
  inviteUrl: string;
  expiresAt: string;
  onboardingFee: number; // paisa
  discountPercent: number;
  discountAmount: number; // paisa
  payableAmount: number; // paisa
  includedBalance: number; // paisa
  perMinuteRate: number; // paisa
  skipPayment: boolean;
}

function paisaToInr(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function inviteTenantEmailHtml(
  params: InviteTenantTemplateInput,
): string {
  const formattedExpiry = formatUserDateTime(params.expiresAt);

  // eslint-disable-next-line no-useless-assignment
  let pricingRows = "";

  if (params.skipPayment) {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="text-decoration:line-through;color:${COLORS.textMuted};">${paisaToInr(params.onboardingFee)}</span> <span style="color:${COLORS.success};font-weight:700;margin-left:6px;">WAIVED</span>`)}
    `;
  } else if (params.discountPercent > 0) {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="text-decoration:line-through;color:${COLORS.textMuted};">${paisaToInr(params.onboardingFee)}</span>`)}
      ${keyValueRow("Discount", `<span style="color:${COLORS.success};font-weight:700;">${params.discountPercent}% off (-${paisaToInr(params.discountAmount)})</span>`)}
      ${keyValueRow("You Pay", `<span style="color:${COLORS.primaryDark};font-weight:800;font-size:16px;">${paisaToInr(params.payableAmount)}</span>`)}
    `;
  } else {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="font-weight:700;">${paisaToInr(params.onboardingFee)}</span>`)}
    `;
  }

  pricingRows += `
    ${keyValueRow("Per Minute Rate", `${paisaToInr(params.perMinuteRate)}/min`)}
    ${keyValueRow("Included Balance", `<span style="color:${COLORS.success};font-weight:700;">${paisaToInr(params.includedBalance)} credit</span>`)}
  `;

  const paymentBadge = params.skipPayment
    ? `<div style="margin:20px 0;padding:12px 16px;background-color:${COLORS.successLight};border-radius:8px;text-align:center;border:1px solid ${COLORS.success}30;">
         <span style="color:${COLORS.success};font-weight:700;font-size:13px;">✓ Free Workspace — Pre-activated</span>
       </div>`
    : "";

  const content = sectionPadding(`
    ${heading(
      "You've been invited!",
      `You have been invited to join ${params.tenantName} on the Kooi platform.`,
    )}

    <div style="margin:24px 0; border:1px solid ${COLORS.border}; border-radius:10px; overflow:hidden;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Organization", params.tenantName)}
        ${keyValueRow("Plan", `<span style="color:${COLORS.primary};font-weight:700;">${escapeHtml(params.planName)}</span>`)}
        ${pricingRows}
        ${keyValueRow("Expires At", formattedExpiry)}
      </table>
    </div>

    ${paymentBadge}

    <div style="text-align:center;">
      ${ctaButton(
        params.skipPayment
          ? "Accept & Activate Workspace"
          : "Accept Invite & Create Account",
        params.inviteUrl,
      )}
    </div>

    ${divider()}

    ${bodyText("Or copy and paste this link into your web browser:")}
    <p style="margin:0 0 16px 0;font-size:13px;color:${COLORS.primaryDark};word-break:break-all;line-height:1.5;font-family:monospace;background-color:${COLORS.primaryLight};padding:10px 12px;border-radius:6px;border:1px dashed ${COLORS.primary}40;">
      ${escapeHtml(params.inviteUrl)}
    </p>

    ${infoBox(
      `This invitation will expire on <strong>${formattedExpiry}</strong>. Contact your workspace administrator if you need a replacement link.`,
      "warning",
    )}
  `);

  return emailLayout({
    previewText: `Join ${params.tenantName} on Kooi`,
    content,
  });
}
