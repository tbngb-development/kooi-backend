import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreatePhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/create-phone-number.use-case";
import { ListPhoneNumbersUseCase } from "../../../src/modules/phone-numbers/application/use-cases/list-phone-numbers.use-case";
import { GetPhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/get-phone-number.use-case";
import { UpdatePhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/update-phone-number.use-case";
import { AssignPhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/assign-phone-number.use-case";
import { UnassignPhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/unassign-phone-number.use-case";
import { DeletePhoneNumberUseCase } from "../../../src/modules/phone-numbers/application/use-cases/delete-phone-number.use-case";
import { GetTenantAssistantsUseCase } from "../../../src/modules/phone-numbers/application/use-cases/get-tenant-assistants.use-case";
import type { IPhoneNumberRepository } from "../../../src/modules/phone-numbers/application/interfaces/phone-number-repository.interface";
import type { PhoneNumberDetailDto } from "../../../src/modules/phone-numbers/application/dto/phone-number.dto";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../src/shared/errors";

describe("PhoneNumber Use Cases", () => {
  let mockRepo: IPhoneNumberRepository;

  const samplePhone: PhoneNumberDetailDto = {
    id: "phone-123",
    phoneNumber: "+919876543210",
    friendlyName: "Bangalore Support",
    provider: "BOLNA",
    status: "ACTIVE",
    capabilities: "BOTH",
    tenantId: null,
    assistantId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(samplePhone),
      findById: vi.fn().mockResolvedValue(samplePhone),
      findByPhoneNumber: vi.fn().mockResolvedValue(null),
      findFirstByTenantId: vi.fn().mockResolvedValue(samplePhone),
      findByTenantId: vi.fn().mockResolvedValue([samplePhone]),
      list: vi.fn().mockResolvedValue({
        phoneNumbers: [samplePhone],
        total: 1,
        stats: { total: 1, assigned: 0, available: 1, active: 1 },
      }),
      update: vi.fn().mockResolvedValue(samplePhone),
      assign: vi.fn().mockResolvedValue({
        ...samplePhone,
        tenantId: "tenant-1",
        assistantId: "asst-1",
      }),
      unassign: vi.fn().mockResolvedValue(samplePhone),
      delete: vi.fn().mockResolvedValue(undefined),
      countCallsByPhoneNumber: vi.fn().mockResolvedValue(0),
      getTenantInboundAssistants: vi.fn().mockResolvedValue([
        {
          id: "asst-1",
          name: "Inbound Receptionist",
          platformAgentName: "Sara",
          platformAgentType: "INBOUND",
        },
      ]),
      checkTenantExists: vi.fn().mockResolvedValue(true),
      checkAssistantBelongsToTenant: vi.fn().mockResolvedValue(true),
    };
  });

  describe("CreatePhoneNumberUseCase", () => {
    it("should successfully normalize and create a phone number", async () => {
      const useCase = new CreatePhoneNumberUseCase(mockRepo);
      const result = await useCase.execute({
        phoneNumber: "9876543210",
        friendlyName: "Bangalore Support",
      });

      expect(mockRepo.findByPhoneNumber).toHaveBeenCalledWith("+919876543210");
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedPhone: "+919876543210",
          friendlyName: "Bangalore Support",
        }),
      );
      expect(result.id).toBe("phone-123");
    });

    it("should throw ConflictError if phone number already exists", async () => {
      vi.mocked(mockRepo.findByPhoneNumber).mockResolvedValueOnce(samplePhone);
      const useCase = new CreatePhoneNumberUseCase(mockRepo);

      await expect(
        useCase.execute({ phoneNumber: "+919876543210" }),
      ).rejects.toThrow(ConflictError);
    });

    it("should throw ValidationError if phone format is invalid", async () => {
      const useCase = new CreatePhoneNumberUseCase(mockRepo);
      await expect(
        useCase.execute({ phoneNumber: "invalid-number" }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("AssignPhoneNumberUseCase", () => {
    it("should assign phone number to an existing tenant and assistant", async () => {
      const useCase = new AssignPhoneNumberUseCase(mockRepo);
      const result = await useCase.execute("phone-123", {
        tenantId: "tenant-1",
        assistantId: "asst-1",
      });

      expect(mockRepo.checkTenantExists).toHaveBeenCalledWith("tenant-1");
      expect(mockRepo.checkAssistantBelongsToTenant).toHaveBeenCalledWith(
        "asst-1",
        "tenant-1",
      );
      expect(mockRepo.assign).toHaveBeenCalledWith("phone-123", {
        tenantId: "tenant-1",
        assistantId: "asst-1",
      });
      expect(result.tenantId).toBe("tenant-1");
    });

    it("should throw NotFoundError if tenant does not exist", async () => {
      vi.mocked(mockRepo.checkTenantExists).mockResolvedValueOnce(false);
      const useCase = new AssignPhoneNumberUseCase(mockRepo);

      await expect(
        useCase.execute("phone-123", { tenantId: "non-existent-tenant" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if assistant does not belong to tenant", async () => {
      vi.mocked(mockRepo.checkAssistantBelongsToTenant).mockResolvedValueOnce(
        false,
      );
      const useCase = new AssignPhoneNumberUseCase(mockRepo);

      await expect(
        useCase.execute("phone-123", {
          tenantId: "tenant-1",
          assistantId: "foreign-asst",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("UnassignPhoneNumberUseCase", () => {
    it("should unassign phone number from tenant", async () => {
      const useCase = new UnassignPhoneNumberUseCase(mockRepo);
      await useCase.execute("phone-123");
      expect(mockRepo.unassign).toHaveBeenCalledWith("phone-123");
    });
  });

  describe("DeletePhoneNumberUseCase (Audit-Safe Deletion)", () => {
    it("should hard delete phone number if zero calls are associated", async () => {
      vi.mocked(mockRepo.countCallsByPhoneNumber).mockResolvedValueOnce(0);
      const useCase = new DeletePhoneNumberUseCase(mockRepo);

      const result = await useCase.execute("phone-123");
      expect(mockRepo.delete).toHaveBeenCalledWith("phone-123");
      expect(result.deleted).toBe(true);
      expect(result.actionTaken).toBe("HARD_DELETED");
    });

    it("should transition status to RELEASED and unassign if historical calls exist", async () => {
      vi.mocked(mockRepo.countCallsByPhoneNumber).mockResolvedValueOnce(15);
      const useCase = new DeletePhoneNumberUseCase(mockRepo);

      const result = await useCase.execute("phone-123");
      expect(mockRepo.delete).not.toHaveBeenCalled();
      expect(mockRepo.unassign).toHaveBeenCalledWith("phone-123");
      expect(mockRepo.update).toHaveBeenCalledWith("phone-123", {
        status: "RELEASED",
      });
      expect(result.deleted).toBe(false);
      expect(result.actionTaken).toBe("RELEASED_PRESERVED_FOR_AUDIT");
    });
  });

  describe("GetTenantAssistantsUseCase", () => {
    it("should return inbound-capable assistants for the tenant", async () => {
      const useCase = new GetTenantAssistantsUseCase(mockRepo);
      const assistants = await useCase.execute("tenant-1");
      expect(assistants).toHaveLength(1);
      expect(assistants[0].name).toBe("Inbound Receptionist");
    });
  });
});
