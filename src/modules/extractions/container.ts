import { PrismaExtractionRepository } from "./infrastructure/repositories/prisma-extraction.repository";
import { PrismaBolnaApiKeyRepository } from "../bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";
import { BolnaExtractionProviderImpl } from "./infrastructure/services/bolna-extraction.provider";

// Use Cases
import { CreateCategoryUseCase } from "./application/use-cases/create-category.use-case";
import { GetCategoryUseCase } from "./application/use-cases/get-category.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories.use-case";
import { UpdateCategoryUseCase } from "./application/use-cases/update-category.use-case";
import { DeleteCategoryUseCase } from "./application/use-cases/delete-category.use-case";
import { CreateDispositionUseCase } from "./application/use-cases/create-disposition.use-case";
import { GetDispositionUseCase } from "./application/use-cases/get-disposition.use-case";
import { ListDispositionsUseCase } from "./application/use-cases/list-dispositions.use-case";
import { UpdateDispositionUseCase } from "./application/use-cases/update-disposition.use-case";
import { DeleteDispositionUseCase } from "./application/use-cases/delete-disposition.use-case";
import { PreviewBolnaCategoriesUseCase } from "./application/use-cases/preview-bolna-categories.use-case";
import { PreviewBolnaDispositionsUseCase } from "./application/use-cases/preview-bolna-dispositions.use-case";
import { AttachIndustriesToCategoryUseCase } from "./application/use-cases/attach-industries-to-category.use-case";
import { DetachIndustryFromCategoryUseCase } from "./application/use-cases/detach-industry-from-category.use-case";
import { AttachIndustriesToDispositionUseCase } from "./application/use-cases/attach-industries-to-disposition.use-case";
import { DetachIndustryFromDispositionUseCase } from "./application/use-cases/detach-industry-from-disposition.use-case";
import { AttachDispositionsToCategoryUseCase } from "./application/use-cases/attach-dispositions-to-category.use-case";
import { DetachDispositionFromCategoryUseCase } from "./application/use-cases/detach-disposition-from-category.use-case";

import { AdminExtractionController } from "./presentation/admin-extraction.controller";

export interface ExtractionModule {
  adminController: AdminExtractionController;
}

export function buildExtractionModule(): ExtractionModule {
  const repository = new PrismaExtractionRepository();
  const apiKeyRepository = new PrismaBolnaApiKeyRepository();
  const bolnaProvider = new BolnaExtractionProviderImpl(apiKeyRepository);

  return {
    adminController: new AdminExtractionController(
      new CreateCategoryUseCase(repository),
      new UpdateCategoryUseCase(repository),
      new DeleteCategoryUseCase(repository),
      new GetCategoryUseCase(repository),
      new ListCategoriesUseCase(repository),
      new CreateDispositionUseCase(repository),
      new UpdateDispositionUseCase(repository),
      new DeleteDispositionUseCase(repository),
      new GetDispositionUseCase(repository),
      new ListDispositionsUseCase(repository),
      new AttachIndustriesToCategoryUseCase(repository),
      new DetachIndustryFromCategoryUseCase(repository),
      new AttachDispositionsToCategoryUseCase(repository),
      new DetachDispositionFromCategoryUseCase(repository),
      new AttachIndustriesToDispositionUseCase(repository),
      new DetachIndustryFromDispositionUseCase(repository),
      new PreviewBolnaCategoriesUseCase(bolnaProvider),
      new PreviewBolnaDispositionsUseCase(bolnaProvider),
    ),
  };
}
