import {
  emailLayout,
  sectionPadding,
  heading,
  bodyText,
  ctaButton,
  divider,
  infoBox,
  keyValueRow,
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
  // ── Pricing rows ───────────────────────────────────────────────
  // eslint-disable-next-line no-useless-assignment
  let pricingRows = "";

  if (params.skipPayment) {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="text-decoration:line-through;color:${COLORS.textMuted};">${paisaToInr(params.onboardingFee)}</span> <span style="color:${COLORS.success};font-weight:700;">WAIVED</span>`)}
    `;
  } else if (params.discountPercent > 0) {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="text-decoration:line-through;color:${COLORS.textMuted};">${paisaToInr(params.onboardingFee)}</span>`)}
      ${keyValueRow("Discount", `<span style="color:${COLORS.success};font-weight:600;">${params.discountPercent}% off (${paisaToInr(params.discountAmount)})</span>`)}
      ${keyValueRow("You Pay", `<span style="color:${COLORS.primary};font-weight:700;font-size:16px;">${paisaToInr(params.payableAmount)}</span>`)}
    `;
  } else {
    pricingRows = `
      ${keyValueRow("Onboarding Fee", `<span style="font-weight:700;">${paisaToInr(params.onboardingFee)}</span>`)}
    `;
  }

  pricingRows += `
    ${keyValueRow("Per Minute Rate", `${paisaToInr(params.perMinuteRate)}/min`)}
    ${keyValueRow("Included Balance", `<span style="color:${COLORS.success};font-weight:600;">${paisaToInr(params.includedBalance)} credit</span>`)}
  `;

  // ── Payment badge ──────────────────────────────────────────────
  const paymentBadge = params.skipPayment
    ? `<div style="margin:16px 0;padding:12px 16px;background-color:#ecfdf5;border-radius:8px;text-align:center;">
         <span style="color:#059669;font-weight:700;font-size:14px;">✓ No Payment Required — Your workspace is pre-activated</span>
       </div>`
    : "";

  const content = sectionPadding(`
    ${heading(
      "You've been invited!",
      `You've been invited to join ${params.tenantName} on the Kooi platform.`,
    )}

    <div style="margin:28px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};border-radius:8px;padding:4px 0;">
        ${keyValueRow("Organization", params.tenantName)}
        ${keyValueRow("Plan", `<span style="color:${COLORS.primary};font-weight:600;">${escapeHtml(params.planName)}</span>`)}
        ${pricingRows}
        ${keyValueRow("Expires", params.expiresAt)}
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

    ${bodyText("Or copy and paste this link into your browser:")}
    <p style="margin:0 0 16px 0;font-size:14px;color:${COLORS.primary};word-break:break-all;line-height:1.5;">
      ${escapeHtml(params.inviteUrl)}
    </p>

    ${infoBox(
      "This invitation will expire on " +
        escapeHtml(params.expiresAt) +
        ". After that, you'll need a new invite.",
      "warning",
    )}
  `);

  return emailLayout({
    previewText: `Join ${params.tenantName} on Kooi`,
    content,
  });
}
