import { type TenantRole } from "@prisma/client";

export interface UpdateUserInput {
  name?: string;
  role?: TenantRole;
}
