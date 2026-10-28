import type { Logger } from "../../shared/logging/logger.interface";
import { ResendContactEmailService } from "./infrastructure/resend-contact-email.service";
import { SubmitContactFormUseCase } from "./application/use-cases/submit-contact-form.use-case";
import { PublicContactController } from "./presentation/public-contact.controller";
import { TenantContactController } from "./presentation/tenant-contact.controller";

export interface ContactModule {
  publicController: PublicContactController;
  tenantController: TenantContactController;
  submitContactForm: SubmitContactFormUseCase;
}

export function buildContactModule(logger: Logger): ContactModule {
  const emailService = new ResendContactEmailService(
    logger.child({ module: "contact-email" }),
  );
  const submitContactForm = new SubmitContactFormUseCase(
    emailService,
    logger.child({ module: "contact-usecase" }),
  );
  const publicController = new PublicContactController(submitContactForm);
  const tenantController = new TenantContactController(submitContactForm);

  return {
    publicController,
    tenantController,
    submitContactForm,
  };
}
