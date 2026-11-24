import { describe, it, expect, beforeEach, vi } from "vitest";
import axios from "axios";
import { SarvamRecordingClient } from "../infrastructure/clients/sarvam-recording.client";
import {
  SarvamRecordingNotFoundError,
  SarvamRecordingRateLimitError,
  SarvamRecordingPermanentError,
  SarvamRecordingIneligibleError,
} from "../domain/errors/sarvam-recording.errors";
import { FetchSarvamRecordingUseCase } from "../application/use-cases/fetch-sarvam-recording.use-case";
import { ProcessSarvamWebhookUseCase } from "../../webhooks/application/use-cases/process-sarvam-webhook.use-case";
import type { ISarvamRecordingClient } from "../application/interfaces/sarvam-recording-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { ISarvamWebhookRepository } from "../../webhooks/application/interfaces/sarvam-webhook-repository.interface";
import type { SarvamLeadCorrelationService } from "../../webhooks/application/services/sarvam-lead-correlation.service";

vi.mock("axios");

describe("Sarvam Call Recording Retrieval", () => {
  describe("SarvamRecordingClient", () => {
    let client: SarvamRecordingClient;
    const mockedAxios = vi.mocked(axios);

    beforeEach(() => {
      vi.clearAllMocks();
      client = new SarvamRecordingClient();
    });

    it("should download binary WAV buffer with correct URL, headers, and responseType", async () => {
      const mockWavData = Buffer.from("RIFFmockwavdata");
      mockedAxios.get.mockResolvedValueOnce({
        data: mockWavData,
        headers: { "content-type": "audio/wav" },
        status: 200,
      });

      const result = await client.downloadRecordingWav({
        organizationId: "org-123",
        workspaceId: "ws-456",
        appId: "app-789",
        interactionId: "20261007/9f1c2a7e-4b3d-4e8a-a1f0-6c2d9b7e5a14",
        apiKey: "sk-sarvam-secret",
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://apps.sarvam.ai/api/analytics/v1/org-123/ws-456/app-789/recordings/20261007/9f1c2a7e-4b3d-4e8a-a1f0-6c2d9b7e5a14",
        {
          headers: { "X-API-Key": "sk-sarvam-secret" },
          responseType: "arraybuffer",
          timeout: 30000,
        },
      );
    });

    it("should throw SarvamRecordingNotFoundError on HTTP 404", async () => {
      mockedAxios.isAxiosError.mockReturnValueOnce(true);
      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404, headers: {} },
      });

      await expect(
        client.downloadRecordingWav({
          organizationId: "org-1",
          workspaceId: "ws-1",
          appId: "app-1",
          interactionId: "inter-404",
          apiKey: "key-1",
        }),
      ).rejects.toThrow(SarvamRecordingNotFoundError);
    });

    it("should throw SarvamRecordingRateLimitError on HTTP 429 with Retry-After", async () => {
      mockedAxios.isAxiosError.mockReturnValueOnce(true);
      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 429,
          headers: { "retry-after": "45" },
        },
      });

      try {
        await client.downloadRecordingWav({
          organizationId: "org-1",
          workspaceId: "ws-1",
          appId: "app-1",
          interactionId: "inter-429",
          apiKey: "key-1",
        });
        expect.unreachable("Should have thrown rate limit error");
      } catch (err) {
        expect(err).toBeInstanceOf(SarvamRecordingRateLimitError);
        expect((err as SarvamRecordingRateLimitError).retryAfterSeconds).toBe(
          45,
        );
      }
    });

    it("should throw SarvamRecordingPermanentError on 400, 401, 403, 422", async () => {
      const statuses = [400, 401, 403, 422];

      for (const status of statuses) {
        mockedAxios.isAxiosError.mockReturnValueOnce(true);
        mockedAxios.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status, headers: {} },
        });

        await expect(
          client.downloadRecordingWav({
            organizationId: "org-1",
            workspaceId: "ws-1",
            appId: "app-1",
            interactionId: "inter-err",
            apiKey: "key-1",
          }),
        ).rejects.toThrow(SarvamRecordingPermanentError);
      }
    });

    it("should throw retryable Error on 500 server error", async () => {
      mockedAxios.isAxiosError.mockReturnValueOnce(true);
      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500, headers: {} },
      });

      await expect(
        client.downloadRecordingWav({
          organizationId: "org-1",
          workspaceId: "ws-1",
          appId: "app-1",
          interactionId: "inter-500",
          apiKey: "key-1",
        }),
      ).rejects.toThrow(/upstream server error: HTTP 500/);
    });
  });

  describe("FetchSarvamRecordingUseCase", () => {
    let useCase: FetchSarvamRecordingUseCase;
    let mockClient: ISarvamRecordingClient;
    let mockEncryption: ISarvamApiKeyEncryptionService;
    let mockStorage: FileStorageProvider;
    let mockPrisma: any;
    let mockLogger: any;

    beforeEach(() => {
      mockClient = {
        downloadRecordingWav: vi.fn(),
      };
      mockEncryption = {
        encrypt: vi.fn((p) => `enc:${p}`),
        decrypt: vi.fn(() => "decrypted-sarvam-key"),
        maskKey: vi.fn(() => "sk-...1234"),
      };
      mockStorage = {
        uploadBuffer: vi.fn().mockResolvedValue("https://res.cloudinary.com/test/video/upload/recording.wav"),
      };
      mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      mockPrisma = {
        call: {
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        sarvamApiKey: {
          findUnique: vi.fn(),
        },
        sarvamAgent: {
          findUnique: vi.fn(),
        },
      };

      useCase = new FetchSarvamRecordingUseCase(
        mockClient,
        mockEncryption,
        mockStorage,
        mockPrisma,
        mockLogger,
      );
    });

    it("should successfully download WAV, upload to Cloudinary with resourceType video, and update DB", async () => {
      const mockCall = {
        id: "call-1",
        tenantId: "tenant-1",
        provider: "SARVAM",
        campaignId: "campaign-1",
        sarvamAgentId: "agent-1",
        callHistory: [
          {
            attempt_id: "att-1",
            interaction_id: "20261007/abc-123",
            completion_status: "completed",
            status: "COMPLETED",
          },
        ],
      };

      mockPrisma.call.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.sarvamApiKey.findUnique.mockResolvedValueOnce({
        organizationId: "org-test",
        workspaceId: "ws-test",
        apiKeyEncrypted: "encrypted-data",
        isActive: true,
      });
      mockPrisma.sarvamAgent.findUnique.mockResolvedValueOnce({
        id: "agent-1",
        appId: "sarvam-app-42",
      });

      const mockWavBuffer = Buffer.from("fake-wav-bytes");
      vi.mocked(mockClient.downloadRecordingWav).mockResolvedValueOnce(
        mockWavBuffer,
      );

      const result = await useCase.execute({
        callId: "call-1",
        source: "MANUAL",
        adminUserId: "admin-user-99",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("AVAILABLE");
      expect(result.recordingUrl).toBe(
        "https://res.cloudinary.com/test/video/upload/recording.wav",
      );

      // Verify Cloudinary upload with resourceType: "video"
      expect(mockStorage.uploadBuffer).toHaveBeenCalledWith(
        mockWavBuffer,
        "20261007_abc-123.wav",
        "kooi/recordings/sarvam/tenant-1",
        { resourceType: "video" },
      );

      // Verify atomic database update
      expect(mockPrisma.call.update).toHaveBeenCalledWith({
        where: { id: "call-1" },
        data: {
          callHistory: [
            expect.objectContaining({
              attempt_id: "att-1",
              interaction_id: "20261007/abc-123",
              recording_status: "AVAILABLE",
              recording_url:
                "https://res.cloudinary.com/test/video/upload/recording.wav",
              recording_source: "MANUAL",
            }),
          ],
          recording:
            "https://res.cloudinary.com/test/video/upload/recording.wav",
        },
      });

      // Verify structured audit log
      expect(mockLogger.info).toHaveBeenCalledWith(
        "[Audit] Platform Administrator successfully retrieved Sarvam call recording",
        expect.objectContaining({
          action: "SARVAM_RECORDING_MANUAL_REFETCH",
          callId: "call-1",
          tenantId: "tenant-1",
          interactionId: "20261007/abc-123",
          adminUserId: "admin-user-99",
          outcome: "SUCCESS",
        }),
      );
    });

    it("should be idempotent: skip download and upload when recording is already AVAILABLE", async () => {
      const mockCall = {
        id: "call-1",
        tenantId: "tenant-1",
        provider: "SARVAM",
        campaignId: "campaign-1",
        callHistory: [
          {
            attempt_id: "att-1",
            interaction_id: "20261007/abc-123",
            recording_status: "AVAILABLE",
            recording_url: "https://existing.recording.url/audio.wav",
          },
        ],
      };

      mockPrisma.call.findUnique.mockResolvedValueOnce(mockCall);

      const result = await useCase.execute({
        callId: "call-1",
        source: "AUTOMATIC",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("AVAILABLE");
      expect(result.recordingUrl).toBe(
        "https://existing.recording.url/audio.wav",
      );
      expect(mockClient.downloadRecordingWav).not.toHaveBeenCalled();
      expect(mockStorage.uploadBuffer).not.toHaveBeenCalled();
    });

    it("should preserve earlier attempt recordings when retrieving recording for a second attempt", async () => {
      const mockCall = {
        id: "call-1",
        tenantId: "tenant-1",
        provider: "SARVAM",
        campaignId: "campaign-1",
        sarvamAgentId: "agent-1",
        callHistory: [
          {
            attempt_id: "att-1",
            interaction_id: "20261007/first-attempt",
            recording_status: "AVAILABLE",
            recording_url: "https://storage/attempt-1.wav",
          },
          {
            attempt_id: "att-2",
            interaction_id: "20261007/second-attempt",
            recording_status: "NOT_REQUESTED",
          },
        ],
      };

      mockPrisma.call.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.sarvamApiKey.findUnique.mockResolvedValueOnce({
        organizationId: "org-test",
        workspaceId: "ws-test",
        apiKeyEncrypted: "enc",
        isActive: true,
      });
      mockPrisma.sarvamAgent.findUnique.mockResolvedValueOnce({
        id: "agent-1",
        appId: "sarvam-app-42",
      });

      vi.mocked(mockClient.downloadRecordingWav).mockResolvedValueOnce(
        Buffer.from("wav-attempt-2"),
      );
      vi.mocked(mockStorage.uploadBuffer).mockResolvedValueOnce(
        "https://storage/attempt-2.wav",
      );

      const result = await useCase.execute({
        callId: "call-1",
        attemptId: "att-2",
        source: "MANUAL",
      });

      expect(result.recordingUrl).toBe("https://storage/attempt-2.wav");

      // Verify att-1 recording was NOT overwritten
      expect(mockPrisma.call.update).toHaveBeenCalledWith({
        where: { id: "call-1" },
        data: {
          callHistory: [
            expect.objectContaining({
              attempt_id: "att-1",
              recording_url: "https://storage/attempt-1.wav",
              recording_status: "AVAILABLE",
            }),
            expect.objectContaining({
              attempt_id: "att-2",
              recording_url: "https://storage/attempt-2.wav",
              recording_status: "AVAILABLE",
            }),
          ],
          recording: "https://storage/attempt-2.wav",
        },
      });
    });

    it("should reject non-Sarvam calls with SarvamRecordingIneligibleError", async () => {
      mockPrisma.call.findUnique.mockResolvedValueOnce({
        id: "call-bolna",
        tenantId: "tenant-1",
        provider: "BOLNA",
      });

      await expect(
        useCase.execute({
          callId: "call-bolna",
          source: "MANUAL",
        }),
      ).rejects.toThrow(SarvamRecordingIneligibleError);
    });

    it("should track failure state in attempt history and emit warning audit log", async () => {
      const mockCall = {
        id: "call-1",
        tenantId: "tenant-1",
        provider: "SARVAM",
        campaignId: "campaign-1",
        sarvamAgentId: "agent-1",
        callHistory: [
          {
            attempt_id: "att-1",
            interaction_id: "20261007/not-ready",
          },
        ],
      };

      mockPrisma.call.findUnique.mockResolvedValueOnce(mockCall);
      mockPrisma.sarvamApiKey.findUnique.mockResolvedValueOnce({
        organizationId: "org-test",
        workspaceId: "ws-test",
        apiKeyEncrypted: "enc",
        isActive: true,
      });
      mockPrisma.sarvamAgent.findUnique.mockResolvedValueOnce({
        id: "agent-1",
        appId: "sarvam-app-42",
      });

      vi.mocked(mockClient.downloadRecordingWav).mockRejectedValueOnce(
        new SarvamRecordingNotFoundError("20261007/not-ready"),
      );

      await expect(
        useCase.execute({
          callId: "call-1",
          source: "MANUAL",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(SarvamRecordingNotFoundError);

      expect(mockPrisma.call.update).toHaveBeenCalledWith({
        where: { id: "call-1" },
        data: {
          callHistory: [
            expect.objectContaining({
              attempt_id: "att-1",
              recording_status: "PENDING",
              recording_attempts: 1,
            }),
          ],
        },
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[Audit] Platform Administrator manual Sarvam recording retrieval failed",
        expect.objectContaining({
          action: "SARVAM_RECORDING_MANUAL_REFETCH",
          callId: "call-1",
          outcome: "FAILED",
        }),
      );
    });
  });

  describe("ProcessSarvamWebhookUseCase - Automatic Recording Trigger", () => {
    let correlationService: SarvamLeadCorrelationService;
    let webhookRepo: ISarvamWebhookRepository;
    let mockQueue: any;
    let useCase: ProcessSarvamWebhookUseCase;

    beforeEach(() => {
      mockQueue = {
        add: vi.fn().mockResolvedValue({ id: "job-1" }),
      };

      correlationService = {
        correlate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            tenantId: "tenant-1",
            campaign: { id: "campaign-1", sarvamAgentId: "agent-1" },
            batch: { id: "batch-1" },
            lead: { id: "lead-1" },
          },
        }),
      } as unknown as SarvamLeadCorrelationService;

      webhookRepo = {
        executeInAdvisoryLock: vi.fn((key, cb) => {
          const txRepo = {
            findAggregateCall: vi.fn().mockResolvedValue(null),
            createAggregateCall: vi
              .fn()
              .mockResolvedValue({ id: "created-call-123" }),
            updateAggregateCall: vi.fn(),
            updateLeadStatus: vi.fn(),
            findSarvamAgentForTenant: vi.fn().mockResolvedValue(null),
          };
          return cb(txRepo);
        }),
      } as unknown as ISarvamWebhookRepository;

      useCase = new ProcessSarvamWebhookUseCase(
        correlationService,
        webhookRepo,
        undefined,
        "test-secret",
        mockQueue,
      );
    });

    it("should enqueue automatic recording retrieval job when completed, connected, and has interaction_id", async () => {
      const payload: any = {
        app_id: "app-1",
        app_version: 1,
        attempt_id: "att-101",
        campaign_id: "camp-1",
        cohort_id: "coh-1",
        completion_status: "completed",
        connectivity_status: "connected",
        interaction_id: "20261007/valid-interaction",
        user_identifier: "uid-1",
        user_phone_number: "+919876543210",
        retry_attempt: 0,
        metadata: { secret: "test-secret" },
      };

      const result = await useCase.execute(payload);

      expect(result.status).toBe("SUCCESS");
      expect(mockQueue.add).toHaveBeenCalledWith(
        "fetch-recording",
        {
          callId: "created-call-123",
          tenantId: "tenant-1",
          attemptId: "att-101",
          interactionId: "20261007/valid-interaction",
          source: "AUTOMATIC",
        },
        expect.objectContaining({
          jobId: "sarvam-recording:20261007/valid-interaction",
          attempts: 5,
        }),
      );
    });

    it("should NOT enqueue recording job when call did not connect", async () => {
      const payload: any = {
        app_id: "app-1",
        app_version: 1,
        attempt_id: "att-102",
        campaign_id: "camp-1",
        cohort_id: "coh-1",
        completion_status: "failed",
        connectivity_status: "no_answer",
        interaction_id: "20261007/no-answer",
        user_identifier: "uid-2",
        user_phone_number: "+919876543210",
        retry_attempt: 0,
        metadata: { secret: "test-secret" },
      };

      await useCase.execute(payload);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
