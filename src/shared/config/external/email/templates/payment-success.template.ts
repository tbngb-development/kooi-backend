import {
  emailLayout,
  sectionPadding,
  heading,
  bodyText,
  divider,
  infoBox,
  keyValueRow,
  formatUserDateTime,
  COLORS,
  escapeHtml,
} from "./email-layout";

export interface PaymentSuccessTemplateInput {
  tenantName: string;
  amountPaisa: number;
  kind: string;
  orderId?: string;
  paymentId?: string;
  date?: string;
}

export function paymentSuccessEmailHtml(
  p: PaymentSuccessTemplateInput,
): string {
  const amount = (p.amountPaisa / 100).toFixed(2);
  const formattedDate = formatUserDateTime(p.date ?? new Date());

  const content = sectionPadding(`
    <!-- Success Badge -->
    <div style="text-align:center;margin:0 0 16px 0;">
      <div style="display:inline-block;width:56px;height:56px;background-color:${COLORS.successLight};border:2px solid ${COLORS.success};border-radius:50%;line-height:54px;text-align:center;">
        <span style="font-size:26px;color:${COLORS.success};font-weight:bold;">✓</span>
      </div>
    </div>

    <div style="text-align:center;">
      ${heading(
        "Payment Successful",
        "Your payment has been processed and your wallet balance is updated.",
      )}
    </div>

    <!-- Amount Card -->
    <div style="margin:24px 0;background-color:${COLORS.successLight};border:1px solid ${COLORS.success}30;border-radius:12px;padding:24px;text-align:center;">
      <p style="margin:0 0 6px 0;font-size:12px;color:${COLORS.success};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
        Amount Paid
      </p>
      <p style="margin:0;font-size:38px;font-weight:800;color:${COLORS.success};line-height:1.2;letter-spacing:-1px;">
        ₹${amount}
      </p>
    </div>

    <!-- Details Table -->
    <div style="border:1px solid ${COLORS.border}; border-radius:10px; overflow:hidden; margin-bottom:24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
             style="background-color:${COLORS.surface};">
        ${keyValueRow("Organization", p.tenantName)}
        ${keyValueRow("Payment Type", `<span style="color:${COLORS.primary};font-weight:700;">${escapeHtml(p.kind)}</span>`)}
        ${keyValueRow("Date & Time", formattedDate)}
        ${p.orderId ? keyValueRow("Order ID", `<span style="font-family:monospace;font-size:13px;font-weight:600;">${escapeHtml(p.orderId)}</span>`) : ""}
        ${p.paymentId ? keyValueRow("Payment ID", `<span style="font-family:monospace;font-size:13px;font-weight:600;">${escapeHtml(p.paymentId)}</span>`) : ""}
      </table>
    </div>

    ${divider()}

    ${infoBox(
      "Your wallet balance has been credited immediately. You can view all complete transaction receipts inside your portal dashboard.",
      "success",
    )}

    ${bodyText("If you did not authorize this payment, please contact our support team immediately.")}
  `);

  return emailLayout({
    previewText: `Kooi payment of ₹${amount} was successful`,
    content,
  });
}
