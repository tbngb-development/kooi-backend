import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateClassifierDispositionUseCase } from "../../../src/modules/classifier/application/use-cases/create-classifier-disposition.use-case";
import { UpdateClassifierDispositionUseCase } from "../../../src/modules/classifier/application/use-cases/update-classifier-disposition.use-case";
import { DeleteClassifierDispositionUseCase } from "../../../src/modules/classifier/application/use-cases/delete-classifier-disposition.use-case";
import { GetClassifierDispositionUseCase } from "../../../src/modules/classifier/application/use-cases/get-classifier-disposition.use-case";
import { ListClassifierDispositionsUseCase } from "../../../src/modules/classifier/application/use-cases/list-classifier-dispositions.use-case";
import { AssignClassifierToAgentUseCase } from "../../../src/modules/classifier/application/use-cases/assign-classifier-to-agent.use-case";
import { RemoveClassifierFromAgentUseCase } from "../../../src/modules/classifier/application/use-cases/remove-classifier-from-agent.use-case";
import { ListAgentClassifiersUseCase } from "../../../src/modules/classifier/application/use-cases/list-agent-classifiers.use-case";
import { GetClassifierCallResultUseCase } from "../../../src/modules/classifier/application/use-cases/get-classifier-call-result.use-case";
import { ListClassifierCallResultsUseCase } from "../../../src/modules/classifier/application/use-cases/list-classifier-call-results.use-case";
import type { ClassifierRepository } from "../../../src/modules/classifier/application/interfaces/classifier-repository.interface";
import type { ClassifierDisposition, ClassifierCallResult } from "@prisma/client";
import {
  ClassifierDuplicateSlugError,
  ClassifierDispositionNotFoundError,
} from "../../../src/modules/classifier/domain/errors/classifier.errors";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";

describe("Classifier Dispositions, Agent Assignments & Results Use Cases (Module 11)", () => {
  let mockRepo: { [K in keyof ClassifierRepository]: ReturnType<typeof vi.fn> };

  const sampleDisposition: ClassifierDisposition = {
    id: "disp-1",
    slug: "budget-check",
    name: "Budget Check",
    displayName: "Budget",
    question: "Is budget sufficient?",
    questionType: "BOOLEAN",
    objectiveOptions: [{ value: "YES", condition: "Budget >= 50k" }],
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
  });

  describe("Disposition CRUD", () => {
    it("CreateClassifierDispositionUseCase throws ClassifierDuplicateSlugError if slug exists in industry pack", async () => {
      const useCase = new CreateClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionBySlugAndIndustry.mockResolvedValue(sampleDisposition);

      await expect(
        useCase.execute({
          slug: "budget-check",
          name: "Budget Check",
          displayName: "Budget",
          question: "Is budget sufficient?",
          questionType: "BOOLEAN",
          objectiveOptions: [{ value: "YES", condition: "Budget >= 50k" }],
          industryPackId: "pack-1",
        }),
      ).rejects.toThrow(ClassifierDuplicateSlugError);
    });

    it("CreateClassifierDispositionUseCase successfully creates a disposition", async () => {
      const useCase = new CreateClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionBySlugAndIndustry.mockResolvedValue(null);
      mockRepo.createDisposition.mockResolvedValue(sampleDisposition);

      const created = await useCase.execute({
        slug: "budget-check",
        name: "Budget Check",
        displayName: "Budget",
        question: "Is budget sufficient?",
        questionType: "BOOLEAN",
        objectiveOptions: [{ value: "YES", condition: "Budget >= 50k" }],
        industryPackId: "pack-1",
      });

      expect(created).toEqual(sampleDisposition);
      expect(mockRepo.createDisposition).toHaveBeenCalled();
    });

    it("UpdateClassifierDispositionUseCase throws ClassifierDispositionNotFoundError when disposition does not exist", async () => {
      const useCase = new UpdateClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(null);

      await expect(useCase.execute("non-existent-id", { name: "Updated" })).rejects.toThrow(
        ClassifierDispositionNotFoundError,
      );
    });

    it("UpdateClassifierDispositionUseCase successfully updates disposition", async () => {
      const useCase = new UpdateClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.updateDisposition.mockResolvedValue({ ...sampleDisposition, name: "Updated Budget" });

      const updated = await useCase.execute("disp-1", { name: "Updated Budget" });
      expect(updated.name).toBe("Updated Budget");
      expect(mockRepo.updateDisposition).toHaveBeenCalledWith("disp-1", { name: "Updated Budget" });
    });

    it("GetClassifierDispositionUseCase throws ClassifierDispositionNotFoundError if not found", async () => {
      const useCase = new GetClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(null);

      await expect(useCase.execute("missing-id")).rejects.toThrow(ClassifierDispositionNotFoundError);
    });

    it("GetClassifierDispositionUseCase returns disposition when found", async () => {
      const useCase = new GetClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);

      const result = await useCase.execute("disp-1");
      expect(result).toEqual(sampleDisposition);
    });

    it("ListClassifierDispositionsUseCase delegates to repository with filters", async () => {
      const useCase = new ListClassifierDispositionsUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.listDispositions.mockResolvedValue({ items: [sampleDisposition], total: 1 });

      const result = await useCase.execute({ isActive: true, industryPackId: "pack-1" });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockRepo.listDispositions).toHaveBeenCalledWith({ isActive: true, industryPackId: "pack-1" });
    });

    it("DeleteClassifierDispositionUseCase throws ClassifierDispositionNotFoundError if not found", async () => {
      const useCase = new DeleteClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(null);

      await expect(useCase.execute("non-existent")).rejects.toThrow(ClassifierDispositionNotFoundError);
    });

    it("DeleteClassifierDispositionUseCase delegates delete to repository", async () => {
      const useCase = new DeleteClassifierDispositionUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.deleteDisposition.mockResolvedValue(undefined);

      await useCase.execute("disp-1");
      expect(mockRepo.deleteDisposition).toHaveBeenCalledWith("disp-1");
    });
  });

  describe("Agent Assignment Use Cases", () => {
    it("AssignClassifierToAgentUseCase delegates assignment to repository", async () => {
      const useCase = new AssignClassifierToAgentUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.assignToAgent.mockResolvedValue(undefined);

      await useCase.execute("agent-1", ["disp-1", "disp-2"]);
      expect(mockRepo.assignToAgent).toHaveBeenCalledWith("agent-1", ["disp-1", "disp-2"]);
    });

    it("RemoveClassifierFromAgentUseCase delegates removal to repository", async () => {
      const useCase = new RemoveClassifierFromAgentUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.removeFromAgent.mockResolvedValue(undefined);

      await useCase.execute("agent-1", ["disp-1"]);
      expect(mockRepo.removeFromAgent).toHaveBeenCalledWith("agent-1", ["disp-1"]);
    });

    it("ListAgentClassifiersUseCase delegates retrieval to repository", async () => {
      const useCase = new ListAgentClassifiersUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.listAgentClassifiers.mockResolvedValue([sampleDisposition]);

      const result = await useCase.execute("agent-1");
      expect(result).toEqual([sampleDisposition]);
      expect(mockRepo.listAgentClassifiers).toHaveBeenCalledWith("agent-1");
    });
  });

  describe("Call Results Use Cases", () => {
    const sampleCallResult: ClassifierCallResult = {
      id: "res-1",
      callId: "call-1",
      tenantId: "tenant-alpha",
      campaignId: "camp-1",
      batchId: "batch-1",
      status: "COMPLETED",
      dispositionCount: 1,
      transcriptLength: 100,
      rawResponse: {},
      results: { "budget-check": { value: "YES" } },
      inputTokens: 50,
      outputTokens: 20,
      gatewayCost: "0.0001",
      errorMessage: null,
      retryCount: 0,
      enqueuedAt: new Date(),
      processedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("GetClassifierCallResultUseCase throws NotFoundError when result does not exist", async () => {
      const useCase = new GetClassifierCallResultUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getCallResult.mockResolvedValue(null);

      await expect(useCase.execute("non-existent-call")).rejects.toThrow(NotFoundError);
    });

    it("GetClassifierCallResultUseCase throws NotFoundError when tenantId does not match (strict IDOR)", async () => {
      const useCase = new GetClassifierCallResultUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getCallResult.mockResolvedValue(sampleCallResult); // belongs to tenant-alpha

      // tenant-beta attempts to view tenant-alpha's call result
      await expect(useCase.execute("call-1", "tenant-beta")).rejects.toThrow(NotFoundError);
    });

    it("GetClassifierCallResultUseCase returns result when tenantId matches or when admin (tenantId undefined)", async () => {
      const useCase = new GetClassifierCallResultUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.getCallResult.mockResolvedValue(sampleCallResult);

      const tenantResult = await useCase.execute("call-1", "tenant-alpha");
      expect(tenantResult).toEqual(sampleCallResult);

      const adminResult = await useCase.execute("call-1"); // platform admin without tenant scoping
      expect(adminResult).toEqual(sampleCallResult);
    });

    it("ListClassifierCallResultsUseCase delegates paginated query to repository", async () => {
      const useCase = new ListClassifierCallResultsUseCase(mockRepo as unknown as ClassifierRepository);
      mockRepo.listCallResults.mockResolvedValue({ items: [sampleCallResult], total: 1 });

      const result = await useCase.execute({
        tenantId: "tenant-alpha",
        status: "COMPLETED",
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockRepo.listCallResults).toHaveBeenCalledWith({
        tenantId: "tenant-alpha",
        campaignId: undefined,
        batchId: undefined,
        status: "COMPLETED",
        page: 1,
        limit: 20,
      });
    });
  });
});
