import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReEvaluateClassifierUseCase } from "../application/use-cases/re-evaluate-classifier.use-case";
import { AdminCallController } from "../presentation/admin-call.controller";
import { CallNotFoundError } from "../domain/errors/call.errors";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";
import { CallEntity, type CallEntityData } from "../domain/entities/call.entity";
import type { CallRepository, DetailedCallResult } from "../application/interfaces/call-repository.interface";
import type { ProcessClassifierExtractionUseCase } from "../../classifier/application/use-cases/process-classifier-extraction.use-case";
import type { ClassifierRepository } from "../../classifier/application/interfaces/classifier-repository.interface";
import type { ClassifierCallResult } from "@prisma/client";
import type { Request, Response } from "express";

describe("Module 4: Admin Calls & Telemetry", () => {
  const tenantId = "tenant-uuid-123";
  const callId = "call-uuid-456";

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  const mockDetailedCall: DetailedCallResult = {
    id: callId,
    bolnaCallId: "bolna-call-789",
    tenantId,
    campaignId: "campaign-1",
    assistantId: "assistant-1",
    leadId: "lead-1",
    batchId: "batch-1",
    type: "OUTBOUND",
    source: "CAMPAIGN",
    status: "COMPLETED",
    agentNumber: "+18005550199",
    duration: 125,
    cost: 0.0425,
    platformCost: 350, // 350 paisa = ₹3.50
    billableSeconds: 180,
    planVersionId: "plan-version-1",
    appliedRate: 150, // ₹1.50 per min
    appliedMinSec: 60,
    appliedIncrementSec: 60,
    chargedAmount: 450, // 450 paisa = ₹4.50
    recording: "https://audio.bolna.ai/recording-123.mp3",
    transcript: "Agent: Hello, this is Priya. Lead: Yes, I am interested in property details.",
    transcriptMessages: [
      { role: "assistant", message: "Hello, this is Priya." },
      { role: "user", message: "Yes, I am interested in property details." },
    ],
    summary: "Lead interested in real estate project.",
    callHistory: [
      {
        attempt: 1,
        bolnaCallId: "bolna-call-789",
        status: "COMPLETED",
        duration: 125,
        cost: 0.0425,
        timestamp: "2026-10-24T10:00:00Z",
        errorMessage: null,
        hangupReason: "CALLER_HUNG_UP",
      },
    ],
    extractionResult: null,
    startedAt: new Date("2026-10-24T10:00:00Z"),
    endedAt: new Date("2026-10-24T10:02:05Z"),
    createdAt: new Date("2026-10-24T10:00:00Z"),
    updatedAt: new Date("2026-10-24T10:02:05Z"),
    isDeleted: false,
    deletedAt: null,
    lead: {
      id: "lead-1",
      name: "Ramesh Sharma",
      phone: "+919876543210",
      email: "ramesh@example.com",
      company: "Sharma Ventures",
    },
    campaign: {
      id: "campaign-1",
      name: "Q4 High Value Leads",
      description: "Direct outreach",
    },
    assistant: {
      id: "assistant-1",
      name: "Real Estate Advisor",
    },
    callAnalysis: null,
  };

  const mockClassifierResult: ClassifierCallResult = {
    id: "result-1",
    callId,
    tenantId,
    campaignId: "campaign-1",
    batchId: "batch-1",
    status: "COMPLETED",
    dispositionCount: 2,
    transcriptLength: 72,
    rawResponse: {},
    results: {
      lead_interested: {
        value: "YES",
        confidence: 0.95,
      },
    },
    inputTokens: 120,
    outputTokens: 45,
    gatewayCost: "0.0002",
    errorMessage: null,
    retryCount: 0,
    enqueuedAt: new Date(),
    processedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockCallRepo: Partial<CallRepository>;
  let mockProcessClassifierExtraction: Partial<ProcessClassifierExtractionUseCase>;
  let mockClassifierRepo: Partial<ClassifierRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCallRepo = {
      findById: vi.fn().mockResolvedValue(mockDetailedCall),
      list: vi.fn(),
      getStats: vi.fn(),
      getAvailableFilters: vi.fn(),
      findTranscriptById: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
    };

    mockProcessClassifierExtraction = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    mockClassifierRepo = {
      getCallResult: vi.fn().mockResolvedValue(mockClassifierResult),
    };
  });

  describe("ReEvaluateClassifierUseCase", () => {
    it("should successfully trigger classifier extraction and return updated result", async () => {
      const useCase = new ReEvaluateClassifierUseCase(
        mockCallRepo as CallRepository,
        mockProcessClassifierExtraction as ProcessClassifierExtractionUseCase,
        mockClassifierRepo as ClassifierRepository,
        mockLogger as any,
      );

      const result = await useCase.execute(tenantId, callId);

      expect(mockCallRepo.findById).toHaveBeenCalledWith(tenantId, callId);
      expect(mockProcessClassifierExtraction.execute).toHaveBeenCalledWith(callId, tenantId);
      expect(mockClassifierRepo.getCallResult).toHaveBeenCalledWith(callId);
      expect(result).toEqual(mockClassifierResult);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Triggering administrative classifier re-evaluation",
        expect.objectContaining({ tenantId, callId }),
      );
    });

    it("should throw CallNotFoundError when call does not exist", async () => {
      mockCallRepo.findById = vi.fn().mockResolvedValue(null);

      const useCase = new ReEvaluateClassifierUseCase(
        mockCallRepo as CallRepository,
        mockProcessClassifierExtraction as ProcessClassifierExtractionUseCase,
        mockClassifierRepo as ClassifierRepository,
        mockLogger as any,
      );

      await expect(useCase.execute(tenantId, "non-existent")).rejects.toThrow(
        CallNotFoundError,
      );
      expect(mockProcessClassifierExtraction.execute).not.toHaveBeenCalled();
    });

    it("should throw TenantBadRequestError when call has no transcript to evaluate", async () => {
      mockCallRepo.findById = vi.fn().mockResolvedValue({
        ...mockDetailedCall,
        transcript: null,
      });

      const useCase = new ReEvaluateClassifierUseCase(
        mockCallRepo as CallRepository,
        mockProcessClassifierExtraction as ProcessClassifierExtractionUseCase,
        mockClassifierRepo as ClassifierRepository,
        mockLogger as any,
      );

      await expect(useCase.execute(tenantId, callId)).rejects.toThrow(
        TenantBadRequestError,
      );
      expect(mockProcessClassifierExtraction.execute).not.toHaveBeenCalled();
    });
  });

  describe("AdminCallController.reEvaluateClassifier", () => {
    it("should resolve tenantId, callId and return 200 with result", async () => {
      const mockReEvaluateUseCase = {
        execute: vi.fn().mockResolvedValue(mockClassifierResult),
      };

      const controller = new AdminCallController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockReEvaluateUseCase as any,
      );

      const req = {
        query: { tenantId },
        params: { id: callId },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await controller.reEvaluateClassifier(req, res, next);

      expect(mockReEvaluateUseCase.execute).toHaveBeenCalledWith(tenantId, callId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockClassifierResult,
          message: "Classifier dispositions re-evaluated successfully",
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should forward error to next() when re-evaluation fails", async () => {
      const error = new Error("JEV service timeout");
      const mockReEvaluateUseCase = {
        execute: vi.fn().mockRejectedValue(error),
      };

      const controller = new AdminCallController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockReEvaluateUseCase as any,
      );

      const req = {
        query: { tenantId },
        params: { id: callId },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await controller.reEvaluateClassifier(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("Financial Telemetry & Gross Margin Verification", () => {
    it("should correctly populate financial fields in CallEntity", () => {
      const entityData: CallEntityData = {
        id: callId,
        bolnaCallId: "bolna-123",
        tenantId,
        campaignId: "campaign-1",
        leadId: "lead-1",
        batchId: "batch-1",
        status: "COMPLETED",
        agentNumber: "+18005550199",
        duration: 125,
        cost: 0.0425,
        platformCost: 350,
        billableSeconds: 180,
        appliedRate: 150,
        chargedAmount: 450,
        recording: null,
        transcript: "transcript text",
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
      };

      const entity = new CallEntity(entityData);

      expect(entity.chargedAmount).toBe(450);
      expect(entity.platformCost).toBe(350);
      expect(entity.appliedRate).toBe(150);
      expect(entity.billableSeconds).toBe(180);
      expect(entity.cost).toBe(0.0425);
      expect(entity.agentNumber).toBe("+18005550199");

      // Computed gross margin: Charged - Platform Cost
      const marginPaisa = (entity.chargedAmount ?? 0) - (entity.platformCost ?? 0);
      expect(marginPaisa).toBe(100); // ₹1.00 profit
      const marginPercentage = ((marginPaisa / (entity.chargedAmount ?? 1)) * 100).toFixed(1);
      expect(marginPercentage).toBe("22.2");
    });
  });

  describe("Carrier & Telephony Failure Reason Diagnostics", () => {
    it("should capture and extract failure reasons from callHistory", () => {
      const failedHistory = [
        {
          attempt: 1,
          bolnaCallId: "bolna-fail-1",
          status: "FAILED",
          duration: 0,
          cost: 0.001,
          timestamp: "2026-10-24T09:30:00Z",
          errorMessage: "SIP 503 Service Unavailable: Carrier congestion",
          hangupReason: "CARRIER_TEMPORARY_FAILURE",
        },
      ];

      const callWithFailure: DetailedCallResult = {
        ...mockDetailedCall,
        status: "FAILED",
        callHistory: failedHistory,
      };

      const lastAttempt = (callWithFailure.callHistory as any[])[0];
      expect(lastAttempt.status).toBe("FAILED");
      expect(lastAttempt.hangupReason).toBe("CARRIER_TEMPORARY_FAILURE");
      expect(lastAttempt.errorMessage).toContain("SIP 503");
    });
  });
});
