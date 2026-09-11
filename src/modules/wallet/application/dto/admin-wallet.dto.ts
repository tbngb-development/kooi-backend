export interface AdjustWalletInput {
  tenantId: string;
  amount: number; // positive integer in paisa
  type: "CREDIT" | "DEBIT" | "BONUS" | "ADJUSTMENT" | "REFUND";
  targetBalance?: "CASH" | "BONUS";
  description: string;
  bonusExpiresAt?: string | null;
}
