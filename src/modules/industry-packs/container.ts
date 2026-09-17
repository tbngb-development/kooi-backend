import { PrismaIndustryPackRepository } from "./infrastructure/repositories/prisma-industry-pack.repository";
import { CreateIndustryPackUseCase } from "./application/use-cases/create-industry-pack.use-case";
import { UpdateIndustryPackUseCase } from "./application/use-cases/update-industry-pack.use-case";
import { DeleteIndustryPackUseCase } from "./application/use-cases/delete-industry-pack.use-case";
import { GetIndustryPackUseCase } from "./application/use-cases/get-industry-pack.use-case";
import { ListIndustryPacksUseCase } from "./application/use-cases/list-industry-packs.use-case";
import { AssignAgentToPackUseCase } from "./application/use-cases/assign-agent-to-pack.use-case";
import { RemoveAgentFromPackUseCase } from "./application/use-cases/remove-agent-from-pack.use-case";
import { AdminIndustryPackController } from "./presentation/admin-industry-pack.controller";

export interface IndustryPackModule {
  adminController: AdminIndustryPackController;
}

export function buildIndustryPackModule(): IndustryPackModule {
  const repository = new PrismaIndustryPackRepository();

  return {
    adminController: new AdminIndustryPackController(
      new CreateIndustryPackUseCase(repository),
      new UpdateIndustryPackUseCase(repository),
      new DeleteIndustryPackUseCase(repository),
      new GetIndustryPackUseCase(repository),
      new ListIndustryPacksUseCase(repository),
      new AssignAgentToPackUseCase(repository),
      new RemoveAgentFromPackUseCase(repository),
    ),
  };
}