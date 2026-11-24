import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuickDialCallUseCase } from "../application/use-cases/quick-dial-call.use-case";
import { InitiateOutboundCallUseCase } from "../application/use-cases/initiate-outbound-call.use-case";
import { CallEntity } from "../domain/entities/call.entity";
import { AppError } from "../../../shared/errors/app.error";
import type { IBolnaClientFactory } from "../../../shared/config/external/bolna/bolna-client.factory";
import type { ICallWalletGuard } from "../../wallet/application/guards/call-wallet.guard";
import type { AssistantRepository } from "../../assistants/application/interfaces/assistant-repository.interface";
import type { LeadRepository } from "../../leads/application/interfaces/lead-repository.interface";
import type { CallRepository } from "../application/interfaces/call-repository.interface";
import type { IPhoneNumberRepository } from "../../phone-numbers/application/interfaces/phone-number-repository.interface";
import type { ITenantVoiceProviderService } from "../../tenants/application/services/tenant-voice-provider.service";
import type { BolnaClient } from "../../../shared/config/external/bolna/bolna.client";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

describe("Call Provider Snapshot & Guards", () => {
  let mockBolnaClient: Partial<BolnaClient>;
  let mockBolnaClientFactory: IBolnaClientFactory;
  let mockCallWalletGuard: ICallWalletGuard;
  let mockAssistantRepo: AssistantRepository;
  let mockLeadRepo: LeadRepository;
  let mockCallRepo: CallRepository;
  let mockPhoneNumberRepo: IPhoneNumberRepository;
  let mockVoiceProviderService: ITenantVoiceProviderService;

  beforeEach(() => {
    mockBolnaClient = {
      calls: {
        create: vi.fn().mockResolvedValue({
          execution_id: "exec-bolna-123",
          status: "queued",
        }),
      } as any,
    } as any;

    mockBolnaClientFactory = {
      forTenant: vi.fn().mockResolvedValue(mockBolnaClient),
      getClient: vi.fn().mockResolvedValue(mockBolnaClient),
    } as unknown as IBolnaClientFactory;

    mockCallWalletGuard = {
      assertSufficientBalance: vi.fn().mockResolvedValue(undefined),
    } as unknown as ICallWalletGuard;

    mockAssistantRepo = {
      findByIdWithPlatformAgent: vi.fn().mockResolvedValue({
        id: "asst-1",
        tenantId: "tenant-1",
        platformAgent: {
          id: "pa-1",
          bolnaId: "agent-bolna-xyz",
          isActive: true,
          type: "OUTBOUND",
        },
      } as any),
      findById: vi.fn(),
    } as unknown as AssistantRepository;

    mockLeadRepo = {
      findOrCreateByPhone: vi.fn().mockResolvedValue({
        id: "lead-1",
        tenantId: "tenant-1",
        phone: "+919876543210",
      } as any),
      createQuickDialLead: vi.fn().mockResolvedValue({
        id: "lead-1",
        tenantId: "tenant-1",
        phone: "+919876543210",
      } as any),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as LeadRepository;

    mockCallRepo = {
      createQuickDialCallRecord: vi.fn().mockResolvedValue({
        id: "call-1",
        tenantId: "tenant-1",
        provider: "BOLNA",
        bolnaCallId: "exec-bolna-123",
        status: "QUEUED",
      } as any),
      create: vi.fn(),
      findById: vi.fn(),
    } as unknown as CallRepository;

    mockPhoneNumberRepo = {
      findActiveByAssistantId: vi.fn().mockResolvedValue({
        id: "phone-1",
        phoneNumber: "+911122334455",
      } as any),
    } as unknown as IPhoneNumberRepository;

    mockVoiceProviderService = {
      resolveActiveProvider: vi.fn().mockResolvedValue({
        provider: "BOLNA",
        credential: { id: "cred-1", isActive: true, provider: "BOLNA" },
      }),
      validateSwitchEligibility: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe("CallEntity", () => {
    it("instantiates correctly with provider and Sarvam identifier fields", () => {
      const call = new CallEntity({
        id: "call-sarvam-1",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        leadId: "lead-1",
        batchId: null,
        provider: "SARVAM",
        bolnaCallId: null,
        sarvamAttemptId: "att-123",
        sarvamInteractionId: "int-456",
        sarvamUserIdentifier: "usr-789",
        status: "COMPLETED",
        duration: 45,
        cost: 0.5,
        platformCost: 0.3,
        billableSeconds: 60,
        recording: null,
        transcript: "Hello",
        transcriptMessages: null,
        summary: null,
        callHistory: null,
        extractionResult: null,
        startedAt: new Date(),
        endedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
      });

      expect(call.id).toBe("call-sarvam-1");
      expect(call.provider).toBe("SARVAM");
      expect(call.bolnaCallId).toBeNull();
      expect(call.sarvamAttemptId).toBe("att-123");
      expect(call.sarvamInteractionId).toBe("int-456");
      expect(call.sarvamUserIdentifier).toBe("usr-789");
    });
  });

  describe("QuickDialCallUseCase", () => {
    it("fails fast with 400 when active provider is SARVAM in Phase 1", async () => {
      vi.mocked(mockVoiceProviderService.resolveActiveProvider).mockResolvedValueOnce({
        provider: "SARVAM",
        credential: { id: "sarvam-cred-1", isActive: true, provider: "SARVAM" },
      });

      const useCase = new QuickDialCallUseCase(
        mockBolnaClientFactory,
        mockCallWalletGuard,
        mockAssistantRepo,
        mockLeadRepo,
        mockCallRepo,
        mockPhoneNumberRepo,
        mockVoiceProviderService,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          assistantId: "asst-1",
          phone: "+919876543210",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Voice provider SARVAM call execution is not yet supported in Phase 1.",
        code: "VOICE_PROVIDER_NOT_SUPPORTED",
      });

      // Verify no external client or wallet call was made
      expect(mockBolnaClient.calls?.create).not.toHaveBeenCalled();
      expect(mockCallWalletGuard.assertSufficientBalance).not.toHaveBeenCalled();
    });

    it("snapshots BOLNA provider and executes call successfully", async () => {
      const useCase = new QuickDialCallUseCase(
        mockBolnaClientFactory,
        mockCallWalletGuard,
        mockAssistantRepo,
        mockLeadRepo,
        mockCallRepo,
        mockPhoneNumberRepo,
        mockVoiceProviderService,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        assistantId: "asst-1",
        phone: "+919876543210",
        name: "John Doe",
      });

      expect(result.callId).toBe("call-1");
      expect(result.status).toBe("queued");
      expect(mockCallRepo.createQuickDialCallRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          provider: "BOLNA",
          bolnaCallId: "exec-bolna-123",
        }),
      );
    });
  });

  describe("InitiateOutboundCallUseCase", () => {
    it("fails fast with 400 when active provider is SARVAM in Phase 1", async () => {
      vi.mocked(mockVoiceProviderService.resolveActiveProvider).mockResolvedValueOnce({
        provider: "SARVAM",
        credential: { id: "sarvam-cred-1", isActive: true, provider: "SARVAM" },
      });

      const useCase = new InitiateOutboundCallUseCase(
        mockBolnaClientFactory,
        mockCallWalletGuard,
        mockAssistantRepo,
        mockLeadRepo,
        mockCallRepo,
        mockVoiceProviderService,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          assistantId: "asst-1",
          phoneNumber: "+919876543210",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Voice provider SARVAM call execution is not yet supported in Phase 1.",
        code: "VOICE_PROVIDER_NOT_SUPPORTED",
      });

      expect(mockBolnaClient.calls?.create).not.toHaveBeenCalled();
      expect(mockCallWalletGuard.assertSufficientBalance).not.toHaveBeenCalled();
    });

    it("snapshots BOLNA provider and initiates outbound call successfully", async () => {
      const useCase = new InitiateOutboundCallUseCase(
        mockBolnaClientFactory,
        mockCallWalletGuard,
        mockAssistantRepo,
        mockLeadRepo,
        mockCallRepo,
        mockVoiceProviderService,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        assistantId: "asst-1",
        phoneNumber: "+919876543210",
      });

      expect(result.callId).toBe("call-1");
      expect(result.status).toBe("queued");
      expect(mockCallRepo.createQuickDialCallRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          provider: "BOLNA",
          bolnaCallId: "exec-bolna-123",
        }),
      );
    });
  });
});
