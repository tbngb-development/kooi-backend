import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import { NotFoundError } from "../../../../shared/errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface DeletePhoneNumberResult {
  deleted: boolean;
  actionTaken: "HARD_DELETED" | "RELEASED_PRESERVED_FOR_AUDIT";
  message: string;
}

export class DeletePhoneNumberUseCase {
  constructor(
    private readonly repo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(id: string): Promise<DeletePhoneNumberResult> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Phone number with ID "${id}" not found`);
    }

    const callCount = await this.repo.countCallsByPhoneNumber(
      existing.phoneNumber,
    );

    if (callCount > 0) {
      // Historical calls exist on this phone number: preserve audit history by setting to RELEASED
      await this.repo.unassign(id);
      await this.repo.update(id, { status: "RELEASED" });

      this.logger?.info(
        "Phone number has historical calls; transitioned to RELEASED state instead of hard delete",
        {
          action: "phone_number.released_safe_delete",
          id,
          phoneNumber: existing.phoneNumber,
          associatedCallCount: callCount,
        },
      );

      return {
        deleted: false,
        actionTaken: "RELEASED_PRESERVED_FOR_AUDIT",
        message: `Phone number has ${callCount} associated call record(s). It has been unassigned and archived as RELEASED to preserve historical billing and audit data.`,
      };
    }

    // No calls exist on this number — safe to hard delete
    await this.repo.delete(id);

    this.logger?.info("Phone number permanently deleted (zero call history)", {
      action: "phone_number.hard_delete",
      id,
      phoneNumber: existing.phoneNumber,
    });

    return {
      deleted: true,
      actionTaken: "HARD_DELETED",
      message: "Phone number permanently deleted from inventory.",
    };
  }
}
