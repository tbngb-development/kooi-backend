import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessClassifierExtractionUseCase } from "../../../src/modules/classifier/application/use-cases/process-classifier-extraction.use-case";
import { TestClassifierUseCase } from "../../../src/modules/classifier/application/use-cases/test-classifier.use-case";
import type { ClassifierRepository } from "../../../src/modules/classifier/application/interfaces/classifier-repository.interface";
import type { ClassifierProvider } from "../../../src/modules/classifier/application/interfaces/classifier-provider.interface";
import type { ClassifierDisposition } from "@prisma/client";
import { ValidationError } from "../../../src/shared/errors/validation.error";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import {
  ClassifierDispositionNotFoundError,
  ClassifierTranscriptMissingError,
} from "../../../src/modules/classifier/domain/errors/classifier.errors";

describe("Classifier Extraction & Test Lab Use Cases (Module 11)", () => {
  let mockRepo: { [K in keyof ClassifierRepository]: ReturnType<typeof vi.fn> };
  let mockProvider: { [K in keyof ClassifierProvider]: ReturnType<typeof vi.fn> };
  let mockLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const sampleDisposition: ClassifierDisposition = {
    id: "disp-1",
    slug: "interested",
    name: "Interested",
    displayName: "Lead Interest",
    question: "Is caller interested in purchasing?",
    questionType: "BOOLEAN",
    objectiveOptions: [{ value: "YES", condition: "Caller said yes" }],
    industryPackId: "pack-1",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      createDisposition: vi.fn(),
      updateDisposition: vi.fn(),
      deleteDisposition: vi.fn(),
      getDispositionById: vi.fn(),
      getDispositionBySlugAndIndustry: vi.fn(),
      listDispositions: vi.fn(),
      assignToAgent: vi.fn(),
      removeFromAgent: vi.fn(),
      listAgentClassifiers: vi.fn(),
      resolveForAgent: vi.fn(),
      createCallResult: vi.fn(),
      updateCallResult: vi.fn(),
      getCallResult: vi.fn(),
      listCallResults: vi.fn(),
      getCallTranscript: vi.fn(),
    };

    mockProvider = {
      evaluate: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  describe("ProcessClassifierExtractionUseCase", () => {
    let useCase: ProcessClassifierExtractionUseCase;

    beforeEach(() => {
      useCase = new ProcessClassifierExtractionUseCase(
        mockRepo as unknown as ClassifierRepository,
        mockProvider as unknown as ClassifierProvider,
        mockLogger as any,
      );
    });

    it("exits early without error when call transcript data is not found in database", async () => {
      mockRepo.getCallTranscript.mockResolvedValue(null);

      await useCase.execute("non-existent-call", "tenant-1");

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Call not found for classifier extraction",
        expect.objectContaining({ callId: "non-existent-call" }),
      );
      expect(mockRepo.createCallResult).not.toHaveBeenCalled();
      expect(mockProvider.evaluate).not.toHaveBeenCalled();
    });

    it("marks result SKIPPED when transcript is null or empty whitespace", async () => {
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript: "   ",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        platformAgentId: "agent-1",
        industryPackId: "pack-1",
      });

      await useCase.execute("call-1", "tenant-1");

      expect(mockRepo.createCallResult).toHaveBeenCalledWith({
        callId: "call-1",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        dispositionCount: 0,
        transcriptLength: 0,
      });

      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", {
        status: "SKIPPED",
        errorMessage: "No transcript available",
        processedAt: expect.any(Date),
      });

      expect(mockProvider.evaluate).not.toHaveBeenCalled();
    });

    it("marks result SKIPPED when call is not linked to a platform agent", async () => {
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript: "Hello, this is a valid call transcript.",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        platformAgentId: null, // No agent
        industryPackId: "pack-1",
      });

      await useCase.execute("call-1", "tenant-1");

      expect(mockRepo.createCallResult).toHaveBeenCalledWith({
        callId: "call-1",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        dispositionCount: 0,
        transcriptLength: "Hello, this is a valid call transcript.".length,
      });

      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", {
        status: "SKIPPED",
        errorMessage: "No platform agent linked to call",
        processedAt: expect.any(Date),
      });

      expect(mockProvider.evaluate).not.toHaveBeenCalled();
    });

    it("marks result SKIPPED when platform agent has zero classifier dispositions configured", async () => {
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript: "Hello, this is a valid call transcript.",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        platformAgentId: "agent-1",
        industryPackId: "pack-1",
      });
      mockRepo.resolveForAgent.mockResolvedValue([]); // Zero dispositions

      await useCase.execute("call-1", "tenant-1");

      expect(mockRepo.createCallResult).toHaveBeenCalledWith({
        callId: "call-1",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        dispositionCount: 0,
        transcriptLength: "Hello, this is a valid call transcript.".length,
      });

      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", {
        status: "SKIPPED",
        errorMessage: "No classifier dispositions configured for agent",
        processedAt: expect.any(Date),
      });

      expect(mockProvider.evaluate).not.toHaveBeenCalled();
    });

    it("successfully creates PROCESSING result, evaluates via provider, and stores COMPLETED results", async () => {
      const transcript = "User: Yes, I am definitely interested in buying your software.\nAgent: Wonderful!";
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript,
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        platformAgentId: "agent-1",
        industryPackId: "pack-1",
      });
      mockRepo.resolveForAgent.mockResolvedValue([sampleDisposition]);

      mockProvider.evaluate.mockResolvedValue({
        answers: {
          interested: { type: "noul", noul: 0.92 },
        },
        inputTokens: 120,
        outputTokens: 45,
        gatewayCost: "0.00015",
        rawResponse: { model: "jev-latest", answers: { interested: { type: "noul", noul: 0.92 } } },
      });

      await useCase.execute("call-1", "tenant-1");

      // 1. Pending result creation
      expect(mockRepo.createCallResult).toHaveBeenCalledWith({
        callId: "call-1",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        dispositionCount: 1,
        transcriptLength: transcript.length,
      });

      // 2. State transition to PROCESSING
      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", { status: "PROCESSING" });

      // 3. Provider evaluation call
      expect(mockProvider.evaluate).toHaveBeenCalledWith({
        state: transcript,
        questions: {
          interested: {
            type: "noul",
            instructions: "Is caller interested in purchasing? Caller said yes",
          },
        },
      });

      // 4. Completed state persistence
      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", {
        status: "COMPLETED",
        rawResponse: { model: "jev-latest", answers: { interested: { type: "noul", noul: 0.92 } } },
        results: {
          interested: {
            value: "YES",
            confidence: 0.92,
            questionType: "BOOLEAN",
            classifierDispositionId: "disp-1",
          },
        },
        inputTokens: 120,
        outputTokens: 45,
        gatewayCost: "0.00015",
        processedAt: expect.any(Date),
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Classifier extraction completed",
        expect.objectContaining({ callId: "call-1", tenantId: "tenant-1" }),
      );
    });

    it("marks result FAILED and rethrows error when provider evaluation fails upstream", async () => {
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript: "Valid transcript",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: "batch-1",
        platformAgentId: "agent-1",
        industryPackId: "pack-1",
      });
      mockRepo.resolveForAgent.mockResolvedValue([sampleDisposition]);

      const upstreamError = new Error("Upstream TypeSafe rate limit 429");
      mockProvider.evaluate.mockRejectedValue(upstreamError);

      await expect(useCase.execute("call-1", "tenant-1")).rejects.toThrow("Upstream TypeSafe rate limit 429");

      expect(mockRepo.updateCallResult).toHaveBeenCalledWith("call-1", {
        status: "FAILED",
        errorMessage: "Upstream TypeSafe rate limit 429",
        processedAt: expect.any(Date),
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Classifier extraction failed",
        upstreamError,
        expect.objectContaining({ callId: "call-1", error: "Upstream TypeSafe rate limit 429" }),
      );
    });
  });

  describe("TestClassifierUseCase", () => {
    let testUseCase: TestClassifierUseCase;

    beforeEach(() => {
      testUseCase = new TestClassifierUseCase(
        mockRepo as unknown as ClassifierRepository,
        mockProvider as unknown as ClassifierProvider,
      );
    });

    it("throws ValidationError when classifierDispositionIds is empty", async () => {
      await expect(
        testUseCase.execute({
          classifierDispositionIds: [],
          transcriptSource: "custom",
          customTranscript: "Some transcript",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ClassifierDispositionNotFoundError when disposition ID does not exist", async () => {
      mockRepo.getDispositionById.mockResolvedValue(null);

      await expect(
        testUseCase.execute({
          classifierDispositionIds: ["missing-disp"],
          transcriptSource: "custom",
          customTranscript: "Some transcript",
        }),
      ).rejects.toThrow(ClassifierDispositionNotFoundError);
    });

    it("throws ValidationError when transcriptSource is existing but callId is missing", async () => {
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);

      await expect(
        testUseCase.execute({
          classifierDispositionIds: ["disp-1"],
          transcriptSource: "existing",
          // callId omitted
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws NotFoundError when transcriptSource is existing but call does not exist", async () => {
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.getCallTranscript.mockResolvedValue(null);

      await expect(
        testUseCase.execute({
          classifierDispositionIds: ["disp-1"],
          transcriptSource: "existing",
          callId: "non-existent-call",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ClassifierTranscriptMissingError when existing call transcript is empty", async () => {
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.getCallTranscript.mockResolvedValue({
        transcript: "   ",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        batchId: null,
        platformAgentId: "agent-1",
        industryPackId: null,
      });

      await expect(
        testUseCase.execute({
          classifierDispositionIds: ["disp-1"],
          transcriptSource: "existing",
          callId: "call-no-transcript",
        }),
      ).rejects.toThrow(ClassifierTranscriptMissingError);
    });

    it("throws ValidationError when transcriptSource is custom but customTranscript is missing or whitespace", async () => {
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);

      await expect(
        testUseCase.execute({
          classifierDispositionIds: ["disp-1"],
          transcriptSource: "custom",
          customTranscript: "   ",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("successfully tests classifier with custom transcript and returns evaluation results", async () => {
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);
      mockProvider.evaluate.mockResolvedValue({
        answers: {
          interested: { type: "noul", noul: 0.88 },
        },
        inputTokens: 80,
        outputTokens: 25,
        gatewayCost: "0.00008",
        rawResponse: {},
      });

      const response = await testUseCase.execute({
        classifierDispositionIds: ["disp-1"],
        transcriptSource: "custom",
        customTranscript: "Customer: I would love to sign up right now.",
      });

      expect(response).toEqual({
        results: {
          interested: {
            value: "YES",
            confidence: 0.88,
            questionType: "BOOLEAN",
            classifierDispositionId: "disp-1",
          },
        },
        usage: {
          inputTokens: 80,
          outputTokens: 25,
          gatewayCost: "0.00008",
        },
      });
    });
  });
});
