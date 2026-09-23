import z from "zod";

export const createOwnerInviteSchema = z
  .object({
    email: z.string().email(),
    tenantName: z.string().min(1).max(100),
    planId: z.string().uuid(),
    expiryDays: z.number().int().min(1).max(7).optional(), // ← min changed to 1
    skipPayment: z.boolean().optional().default(false), // ← NEW
    discountPercent: z.number().int().min(0).max(100).optional().default(0), // ← NEW
    creditIncludedBalance: z.boolean().optional().default(true), // ← NEW
  })
  .refine(
    (data) => {
      // If discount is 100%, skipPayment must be true (or will be forced server-side)
      if (data.discountPercent === 100 && !data.skipPayment) {
        return false;
      }
      return true;
    },
    {
      message: "100% discount requires skipPayment to be enabled",
      path: ["skipPayment"],
    },
  );

export const acceptOwnerInviteSchema = z.object({
  token: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  termsAccepted: z.literal(true, {
    message: "You must accept the Terms & Conditions to continue.",
  }),
  termsVersion: z.string().min(1).max(20),
});
