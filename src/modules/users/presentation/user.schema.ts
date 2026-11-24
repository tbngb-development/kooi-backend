import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().max(100).optional(),
  role: z.enum(["OWNER", "ADMIN", "USER"]).optional(),
});

export type UpdateUserBody = z.infer<typeof updateUserSchema>;
