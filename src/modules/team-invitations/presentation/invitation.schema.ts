import { z } from "zod";

const emailSchema = z.email("Invalid email format").toLowerCase().trim();

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["OWNER", "ADMIN", "USER"]),
});

export const listInvitationsQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]).optional(),
});

export const previewInvitationQuerySchema = z.object({
  token: z.string().min(1, "Token is required"),
});

/**
 * A new user must provide their own name and password. An authenticated user
 * accepts with the token alone; the controller supplies the session identity.
 */
export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1, "Token is required"),
    name: z.string().min(1, "Name is required").max(100).trim().optional(),
    password: z.string().min(1, "Password is required").max(128).optional(),
  })
  .refine(
    (body) => Boolean(body.name) === Boolean(body.password),
    { message: "Provide both name and password to create a new account" },
  );

export type CreateInvitationBody = z.infer<typeof createInvitationSchema>;
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;
export type PreviewInvitationQuery = z.infer<typeof previewInvitationQuerySchema>;
export type AcceptInvitationBody = z.infer<typeof acceptInvitationSchema>;
