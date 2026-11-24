import {
  emailLayout,
  sectionPadding,
  heading,
  divider,
  infoBox,
  keyValueRow,
  COLORS,
} from "./email-layout";
import { paisaToRupeesFixed } from "../../../../utils/money";

export interface WalletBlockedTemplateInput {
  tenantId: string;
  tenantName?: string | null;
  balancePaisa: number;
  incidentId: string;
  reason?: string;
  providerFailures: number;
}

function detailsTable(p: WalletBlockedTemplateInput): string {
  return `
    <div style="border:1px solid ${COLORS.border}; border-radius:8px; overflow:hidden; margin:24px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Workspace", p.tenantName || p.tenantId)}
        ${keyValueRow("Tenant ID", p.tenantId)}
        ${keyValueRow("Balance at detection", `₹${paisaToRupeesFixed(p.balancePaisa)}`)}
        ${keyValueRow("Incident", p.incidentId)}
        ${p.reason ? keyValueRow("Reason", p.reason) : ""}
      </table>
    </div>
  `;
}

/** Tenant-facing notice that execution is blocked until the wallet is recharged. */
export function walletBlockedEmailHtml(p: WalletBlockedTemplateInput): string {
  const content = sectionPadding(`
    ${heading(
      "Wallet balance exhausted — calling paused",
      "Your KOOI workspace has been blocked because the available wallet balance reached zero.",
    )}

    <div style="margin:24px 0;background-color:${COLORS.dangerLight};border:1px solid ${COLORS.danger}30;border-radius:12px;padding:24px;text-align:center;">
      <p style="margin:0;font-size:15px;font-weight:700;color:${COLORS.danger};">
        Balance at detection: ₹${paisaToRupeesFixed(p.balancePaisa)}
      </p>
    </div>

    ${divider()}

    ${infoBox(
      "<strong>What happens next:</strong> all campaign and batch execution for this workspace is paused. Recharge your wallet to restore service. Running campaigns are not resumed automatically.",
      "danger",
    )}
  `);

  return emailLayout({
    previewText: `KOOI wallet exhausted for ${p.tenantName || p.tenantId}`,
    content,
  });
}

/** Internal copy with operational identifiers for the platform admin. */
export function walletBlockedAdminEmailHtml(
  p: WalletBlockedTemplateInput,
): string {
  const content = sectionPadding(`
    ${heading(
      "Credit enforcement — workspace blocked",
      "A tenant wallet reached zero and tenant-wide execution was blocked.",
    )}

    ${detailsTable(p)}

    ${infoBox(
      `Provider stop failures in this attempt: <strong>${p.providerFailures}</strong>. A failure leaves the incident open for retry; local execution remains blocked either way.`,
      p.providerFailures > 0 ? "warning" : "info",
    )}

    ${divider()}

    ${infoBox(
      "Internal operational notification — do not forward to the tenant.",
      "info",
    )}
  `);

  return emailLayout({
    previewText: `Credit enforcement blocked ${p.tenantName || p.tenantId}`,
    content,
  });
}
