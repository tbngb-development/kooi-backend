import type { TenantRole } from "@prisma/client";
import {
  COLORS,
  bodyText,
  ctaButton,
  divider,
  emailLayout,
  escapeHtml,
  formatUserDateTime,
  heading,
  infoBox,
  keyValueRow,
  sectionPadding,
} from "../../../../shared/config/external/email/templates/email-layout";

export interface TeamInviteEmailInput {
  inviteUrl: string;
  tenantName: string;
  inviterName: string;
  role: TenantRole;
  expiresAt: string | Date;
}

export interface TeamInviteEmailContent {
  subject: string;
  html: string;
  text: string;
  acceptUrl: string;
}

/** Builds both the HTML and plain-text team invitation email. */
export function buildTeamInviteEmail(
  input: TeamInviteEmailInput,
): TeamInviteEmailContent {
  const formattedExpiry = formatUserDateTime(input.expiresAt);
  const safeTenant = escapeHtml(input.tenantName);
  const safeInviter = escapeHtml(input.inviterName);
  const safeRole = escapeHtml(input.role);

  const content = sectionPadding(`
    ${heading(
      "You're invited to join a workspace",
      `${input.inviterName} invited you to collaborate in ${input.tenantName}.`,
    )}

    <div style="margin:24px 0; border:1px solid ${COLORS.border}; border-radius:10px; overflow:hidden;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Workspace", `<span style="font-weight:700;">${safeTenant}</span>`)}
        ${keyValueRow("Invited by", safeInviter)}
        ${keyValueRow("Your role", safeRole)}
        ${keyValueRow("Expires", formattedExpiry)}
      </table>
    </div>

    <div style="text-align:center;">
      ${ctaButton("Accept invitation", input.inviteUrl)}
    </div>

    ${divider()}

    ${bodyText("Or copy and paste this link into your web browser:")}
    <p style="margin:0 0 16px 0;font-size:13px;color:${COLORS.primaryDark};word-break:break-all;line-height:1.5;font-family:monospace;background-color:${COLORS.primaryLight};padding:10px 12px;border-radius:6px;border:1px dashed ${COLORS.primary}40;">
      ${escapeHtml(input.inviteUrl)}
    </p>

    ${infoBox(
      `This invitation expires on <strong>${formattedExpiry}</strong>. Ask your workspace administrator for a new link if it has expired.`,
      "warning",
    )}
  `);

  const text = [
    `You're invited to join ${input.tenantName} on Kooi.`,
    `${input.inviterName} invited you as ${input.role}.`,
    "",
    `Accept your invitation: ${input.inviteUrl}`,
    "",
    `This invitation expires on ${formattedExpiry}.`,
  ].join("\n");

  return {
    subject: `You're invited to join ${input.tenantName} on Kooi`,
    html: emailLayout({ previewText: `Join ${input.tenantName} on Kooi`, content }),
    text,
    acceptUrl: input.inviteUrl,
  };
}
