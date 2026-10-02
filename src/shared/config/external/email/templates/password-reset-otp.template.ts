import {
  emailLayout,
  sectionPadding,
  heading,
  infoBox,
  COLORS,
  escapeHtml,
} from "./email-layout";

export interface PasswordResetOtpTemplateInput {
  recipientName: string;
  otp: string;
  ttlMinutes: number;
}

export function passwordResetOtpTemplate(
  input: PasswordResetOtpTemplateInput,
): { subject: string; html: string } {
  const { recipientName, otp, ttlMinutes } = input;
  const subject = "Your Kooi verification code";

  const content = sectionPadding(`
    ${heading(
      "Reset your password",
      `Hi ${recipientName}, we received a request to authorize a password reset for your Kooi account.`,
    )}

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
      "If you didn't initiate this action, please ignore this email. Your password is secure and remains unchanged.",
      "info",
    )}

    <p style="margin:20px 0 0 0;font-size:13px;color:${COLORS.textMuted};line-height:1.5;text-align:center;">
      To keep your account secure, never share this verification code with anyone.
    </p>
  `);

  return {
    subject,
    html: emailLayout({
      previewText: `Your Kooi password reset verification code is ${otp}`,
      content,
    }),
  };
}
