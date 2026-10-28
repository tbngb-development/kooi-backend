import {
  emailLayout,
  sectionPadding,
  heading,
  infoBox,
  COLORS,
  escapeHtml,
} from "./email-layout";

export interface TenantMobileVerificationTemplateInput {
  otp: string;
  phone: string;
  tenantName: string;
  ttlMinutes: number;
}

export function tenantMobileVerificationTemplate(
  input: TenantMobileVerificationTemplateInput,
): {
  subject: string;
  html: string;
} {
  const { otp, phone, tenantName, ttlMinutes } = input;
  const subject = `Verify workspace identity for ${tenantName} - KOOI`;

  const content = sectionPadding(`
    ${heading(
      "Workspace Identity Verification",
      `A request was made to verify the mobile number for <strong>${escapeHtml(
        tenantName,
      )}</strong>. Use the verification code below to confirm this mobile identity.`,
    )}

    <div style="margin:24px 0; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; text-align:center;">
      <span style="font-size:12px; color:${COLORS.textMuted}; font-weight:600; text-transform:uppercase; letter-spacing:1px;">
        Mobile Number To Verify:
      </span>
      <div style="font-size:15px; font-weight:700; color:${COLORS.textBase}; margin-top:4px; letter-spacing:0.5px;">
        ${escapeHtml(phone)}
      </div>
    </div>

    <div style="margin:32px 0; text-align:center;">
      <p style="margin:0 0 12px 0;font-size:12px;color:${COLORS.textMuted};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
        Verification Code
      </p>
      <div style="background-color:${COLORS.primaryLight};border:2px solid ${COLORS.primary}60;border-radius:12px;padding:24px;display:inline-block;min-width:240px;box-sizing:border-box;">
        <span style="font-size:38px;font-weight:800;letter-spacing:8px;color:${COLORS.primaryDark};font-family:'Courier New',Courier,monospace;">
          ${escapeHtml(otp)}
        </span>
      </div>
      <p style="margin:14px 0 0 0;font-size:13px;color:${COLORS.textMuted};font-weight:500;">
        Valid for exactly ${ttlMinutes} minutes
      </p>
    </div>

    ${infoBox(
      "If you or a workspace administrator did not request this verification, please contact support immediately.",
      "warning",
    )}

    <p style="margin:20px 0 0 0;font-size:13px;color:${COLORS.textMuted};line-height:1.5;text-align:center;">
      To keep your account secure, never share this verification code with anyone.
    </p>
  `);

  return {
    subject,
    html: emailLayout({
      previewText: `Your KOOI workspace verification code is ${otp}`,
      content,
    }),
  };
}
