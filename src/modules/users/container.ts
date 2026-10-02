import { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository";
import type { PasswordService } from "../auth/application/interfaces/password-service.interface";
import { ListUsersUseCase } from "./application/use-cases/list-users.use-case";
import { CreateUserUseCase } from "./application/use-cases/create-user.use-case";
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

export interface UserModuleDeps {
  passwordService: PasswordService;
}

export function buildUserModule(deps: UserModuleDeps): UserModule {
  const repo = new PrismaUserRepository();

  return {
    tenantController: new TenantUserController(
      new ListUsersUseCase(repo),
      new CreateUserUseCase(repo, deps.passwordService),
      new UpdateUserUseCase(repo),
      new DeleteUserUseCase(repo),
    ),
    adminController: new AdminUserController(
      new ListAdminUsersUseCase(),
      new DeactivateUserUseCase(),
    ),
  };
}
