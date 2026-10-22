import { PrismaPhoneNumberRepository } from "./infrastructure/repositories/prisma-phone-number.repository";
import type { IPhoneNumberRepository } from "./application/interfaces/phone-number-repository.interface";
import { CreatePhoneNumberUseCase } from "./application/use-cases/create-phone-number.use-case";
import { ListPhoneNumbersUseCase } from "./application/use-cases/list-phone-numbers.use-case";
import { GetPhoneNumberUseCase } from "./application/use-cases/get-phone-number.use-case";
import { UpdatePhoneNumberUseCase } from "./application/use-cases/update-phone-number.use-case";
import { AssignPhoneNumberUseCase } from "./application/use-cases/assign-phone-number.use-case";
import { UnassignPhoneNumberUseCase } from "./application/use-cases/unassign-phone-number.use-case";
import { DeletePhoneNumberUseCase } from "./application/use-cases/delete-phone-number.use-case";
import { GetTenantPhoneNumberUseCase } from "./application/use-cases/get-tenant-phone-number.use-case";
import { ListTenantPhoneNumbersUseCase } from "./application/use-cases/list-tenant-phone-numbers.use-case";
import { GetTenantAssistantsUseCase } from "./application/use-cases/get-tenant-assistants.use-case";
import { AdminPhoneNumberController } from "./presentation/admin-phone-number.controller";
import { TenantPhoneNumberController } from "./presentation/tenant-phone-number.controller";
import type { Logger } from "../../shared/logging/logger.interface";

export interface PhoneNumberModuleDeps {
  logger?: Logger;
}

export interface PhoneNumberModule {
  repository: IPhoneNumberRepository;
  adminController: AdminPhoneNumberController;
  tenantController: TenantPhoneNumberController;
}

export function buildPhoneNumberModule(
  deps?: PhoneNumberModuleDeps,
): PhoneNumberModule {
  const repository = new PrismaPhoneNumberRepository();
  const log = deps?.logger?.child({ module: "phone-numbers" });

  const createPhoneNumberUseCase = new CreatePhoneNumberUseCase(
    repository,
    log,
  );
  const listPhoneNumbersUseCase = new ListPhoneNumbersUseCase(repository);
  const getPhoneNumberUseCase = new GetPhoneNumberUseCase(repository);
  const updatePhoneNumberUseCase = new UpdatePhoneNumberUseCase(
    repository,
    log,
  );
  const assignPhoneNumberUseCase = new AssignPhoneNumberUseCase(
    repository,
    log,
  );
  const unassignPhoneNumberUseCase = new UnassignPhoneNumberUseCase(
    repository,
    log,
  );
  const deletePhoneNumberUseCase = new DeletePhoneNumberUseCase(
    repository,
    log,
  );
  const getTenantPhoneNumberUseCase = new GetTenantPhoneNumberUseCase(
    repository,
  );
  const listTenantPhoneNumbersUseCase = new ListTenantPhoneNumbersUseCase(
    repository,
  );
  const getTenantAssistantsUseCase = new GetTenantAssistantsUseCase(repository);

  const adminController = new AdminPhoneNumberController(
    createPhoneNumberUseCase,
    listPhoneNumbersUseCase,
    getPhoneNumberUseCase,
    updatePhoneNumberUseCase,
    assignPhoneNumberUseCase,
    unassignPhoneNumberUseCase,
    deletePhoneNumberUseCase,
    getTenantAssistantsUseCase,
  );

  const tenantController = new TenantPhoneNumberController(
    getTenantPhoneNumberUseCase,
    listTenantPhoneNumbersUseCase,
  );

  return {
    repository,
    adminController,
    tenantController,
  };
}
