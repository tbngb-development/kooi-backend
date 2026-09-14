import { PrismaExtractionRepository } from "./infrastructure/repositories/prisma-extraction.repository";
import { BolnaExtractionProviderImpl } from "./infrastructure/services/bolna-extraction.provider";
import { CreateCategoryUseCase } from "./application/use-cases/create-category.use-case";
import { UpdateCategoryUseCase } from "./application/use-cases/update-category.use-case";
import { DeleteCategoryUseCase } from "./application/use-cases/delete-category.use-case";
import { GetCategoryUseCase } from "./application/use-cases/get-category.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories.use-case";
import { SyncCategoriesFromBolnaUseCase } from "./application/use-cases/sync-categories-from-bolna.use-case";
import { CreateDispositionUseCase } from "./application/use-cases/create-disposition.use-case";
import { UpdateDispositionUseCase } from "./application/use-cases/update-disposition.use-case";
import { DeleteDispositionUseCase } from "./application/use-cases/delete-disposition.use-case";
import { GetDispositionUseCase } from "./application/use-cases/get-disposition.use-case";
import { ListDispositionsUseCase } from "./application/use-cases/list-dispositions.use-case";
import { SyncDispositionsFromBolnaUseCase } from "./application/use-cases/sync-dispositions-from-bolna.use-case";
import { ListBolnaCategoriesUseCase } from "./application/use-cases/list-bolna-categories.use-case";
import { ListBolnaDispositionsUseCase } from "./application/use-cases/list-bolna-dispositions.use-case";
import { ImportExtractionsFromBolnaUseCase } from "./application/use-cases/import-extractions-from-bolna.use-case";
import { AdminExtractionController } from "./presentation/admin-extraction.controller";

export interface ExtractionModule {
  adminController: AdminExtractionController;
}

export function buildExtractionModule(): ExtractionModule {
  const repository = new PrismaExtractionRepository();
  const bolnaProvider = new BolnaExtractionProviderImpl();

  return {
    adminController: new AdminExtractionController(
      new CreateCategoryUseCase(repository, bolnaProvider),
      new UpdateCategoryUseCase(repository, bolnaProvider),
      new DeleteCategoryUseCase(repository, bolnaProvider),
      new GetCategoryUseCase(repository),
      new ListCategoriesUseCase(repository),
      new SyncCategoriesFromBolnaUseCase(repository, bolnaProvider),
      new CreateDispositionUseCase(repository, bolnaProvider),
      new UpdateDispositionUseCase(repository, bolnaProvider),
      new DeleteDispositionUseCase(repository, bolnaProvider),
      new GetDispositionUseCase(repository),
      new ListDispositionsUseCase(repository),
      new SyncDispositionsFromBolnaUseCase(repository, bolnaProvider),
      new ListBolnaCategoriesUseCase(bolnaProvider),
      new ListBolnaDispositionsUseCase(bolnaProvider),
      new ImportExtractionsFromBolnaUseCase(repository, bolnaProvider),
    ),
  };
}
