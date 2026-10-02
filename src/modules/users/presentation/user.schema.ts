import { z } from "zod";

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
  name: z.string().min(1, "Name is required").max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  role: z.enum(["OWNER", "ADMIN", "USER"]).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().max(100).optional(),
  role: z.enum(["OWNER", "ADMIN", "USER"]).optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
