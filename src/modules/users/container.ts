import { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository";
import { ListUsersUseCase } from "./application/use-cases/list-users.use-case";
import { UpdateUserUseCase } from "./application/use-cases/update-user.use-case";
import { DeleteUserUseCase } from "./application/use-cases/delete-user.use-case";
import { TenantUserController } from "./presentation/tenant-user.controller";
import { AdminUserController } from "./presentation/admin-user.controller";
import {
  DeactivateUserUseCase,
  ListAdminUsersUseCase,
} from "./application/use-cases/admin-users.use-cases";

export interface UserModule {
  tenantController: TenantUserController;
  adminController: AdminUserController;
}

export function buildUserModule(): UserModule {
  const repo = new PrismaUserRepository();

  return {
    tenantController: new TenantUserController(
      new ListUsersUseCase(repo),
      new UpdateUserUseCase(repo),
      new DeleteUserUseCase(repo),
    ),
    adminController: new AdminUserController(
      new ListAdminUsersUseCase(),
      new DeactivateUserUseCase(),
    ),
  };
}
