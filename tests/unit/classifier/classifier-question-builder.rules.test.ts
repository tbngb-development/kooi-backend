import { describe, it, expect } from "vitest";
import { ProcessClassifierExtractionUseCase } from "../../../src/modules/classifier/application/use-cases/process-classifier-extraction.use-case";
import type { ClassifierDisposition } from "@prisma/client";
import type { ClassifierRepository } from "../../../src/modules/classifier/application/interfaces/classifier-repository.interface";
import type { ClassifierProvider } from "../../../src/modules/classifier/application/interfaces/classifier-provider.interface";

describe("Classifier Question Builder & Answer Parser Rules (Module 11)", () => {
  const dummyRepo = {} as ClassifierRepository;
  const dummyProvider = {} as ClassifierProvider;
  const useCase = new ProcessClassifierExtractionUseCase(dummyRepo, dummyProvider);

  // Access private methods for pure unit rule verification
  const buildQuestions = (dispositions: ClassifierDisposition[]) =>
    (useCase as any).buildQuestions(dispositions);

  const parseAnswers = (
    answers: Record<string, any>,
    dispositions: ClassifierDisposition[],
  ) => (useCase as any).parseAnswers(answers, dispositions);

  describe("buildQuestions", () => {
    it("builds a noul question for BOOLEAN disposition", () => {
      const dispositions: ClassifierDisposition[] = [
        {
          id: "disp-1",
          slug: "interested-in-demo",
          name: "Interested in Demo",
          displayName: "Demo Interest",
          question: "Did the lead express clear interest in scheduling a product demo?",
          questionType: "BOOLEAN",
          objectiveOptions: [
            { value: "Yes", condition: "The lead agreed or asked for a demo session" },
          ],
          industryPackId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const questions = buildQuestions(dispositions);

      expect(questions).toEqual({
        interested_in_demo: {
          type: "noul",
          instructions:
            "Did the lead express clear interest in scheduling a product demo? The lead agreed or asked for a demo session",
        },
      });
    });

    it("builds a choice question with criteria dictionary for CHOICE disposition", () => {
      const dispositions: ClassifierDisposition[] = [
        {
          id: "disp-2",
          slug: "budget-tier",
          name: "Budget Tier",
          displayName: "Budget Range",
          question: "What is the prospect's estimated annual budget?",
          questionType: "CHOICE",
          objectiveOptions: [
            { value: "Under 10L", condition: "Lead mentioned budget under 10 lakhs" },
            { value: "10L to 50L", condition: "Lead mentioned budget between 10 and 50 lakhs" },
            { value: "Above 50L", condition: "Lead mentioned enterprise budget above 50 lakhs" },
          ],
          industryPackId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const questions = buildQuestions(dispositions);

      expect(questions).toEqual({
        budget_tier: {
          type: "choice",
          instructions: "What is the prospect's estimated annual budget?",
          criteria: {
            "Under 10L": "Lead mentioned budget under 10 lakhs",
            "10L to 50L": "Lead mentioned budget between 10 and 50 lakhs",
            "Above 50L": "Lead mentioned enterprise budget above 50 lakhs",
          },
        },
      });
    });

    it("builds decomposed noul sub-questions for MULTI_CHOICE disposition", () => {
      const dispositions: ClassifierDisposition[] = [
        {
          id: "disp-3",
          slug: "feature-interests",
          name: "Feature Interests",
          displayName: "Features",
          question: "Which capabilities was the caller inquiring about?",
          questionType: "MULTI_CHOICE",
          objectiveOptions: [
            { value: "Voice AI", condition: "Caller asked about autonomous calling" },
            { value: "CRM Sync", condition: "Caller asked about Hubspot or Salesforce" },
          ],
          industryPackId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const questions = buildQuestions(dispositions);

      expect(questions).toEqual({
        feature_interests__voice_ai: {
          type: "noul",
          instructions:
            "Which capabilities was the caller inquiring about? Specifically: Caller asked about autonomous calling",
        },
        feature_interests__crm_sync: {
          type: "noul",
          instructions:
            "Which capabilities was the caller inquiring about? Specifically: Caller asked about Hubspot or Salesforce",
        },
      });
    });

    it("normalizes dashes to underscores in disposition keys", () => {
      const dispositions: ClassifierDisposition[] = [
        {
          id: "disp-4",
          slug: "lead-purchase-intent-level",
          name: "Lead Purchase Intent Level",
          displayName: "Purchase Intent",
          question: "Is caller ready to buy?",
          questionType: "BOOLEAN",
          objectiveOptions: [{ value: "Ready", condition: "Caller confirmed purchase readiness" }],
          industryPackId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const questions = buildQuestions(dispositions);
      expect(Object.keys(questions)).toEqual(["lead_purchase_intent_level"]);
    });
  });

  describe("parseAnswers", () => {
    const booleanDisp: ClassifierDisposition = {
      id: "disp-bool",
      slug: "is-qualified",
      name: "Is Qualified",
      displayName: "Qualified",
      question: "Is qualified?",
      questionType: "BOOLEAN",
      objectiveOptions: [{ value: "QUALIFIED", condition: "Prospect is qualified" }],
      industryPackId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const choiceDisp: ClassifierDisposition = {
      id: "disp-choice",
      slug: "timeline",
      name: "Timeline",
      displayName: "Purchase Timeline",
      question: "Purchase timeline?",
      questionType: "CHOICE",
      objectiveOptions: [
        { value: "IMMEDIATE", condition: "Within 1 week" },
        { value: "FUTURE", condition: "Beyond 1 month" },
      ],
      industryPackId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const multiChoiceDisp: ClassifierDisposition = {
      id: "disp-multi",
      slug: "tech-stack",
      name: "Tech Stack",
      displayName: "Technology Stack",
      question: "What tech stack?",
      questionType: "MULTI_CHOICE",
      objectiveOptions: [
        { value: "PostgreSQL", condition: "Uses Postgres" },
        { value: "Redis", condition: "Uses Redis caching" },
        { value: "Kafka", condition: "Uses Kafka event streaming" },
      ],
      industryPackId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("parses affirmative BOOLEAN answer when noul >= 0.5", () => {
      const answers = {
        is_qualified: { type: "noul", noul: 0.85 },
      };

      const result = parseAnswers(answers, [booleanDisp]);

      expect(result["is-qualified"]).toEqual({
        value: "QUALIFIED",
        confidence: 0.85,
        questionType: "BOOLEAN",
        classifierDispositionId: "disp-bool",
      });
    });

    it("parses negative BOOLEAN answer when noul < 0.5 (sets value null and confidence 1 - noul)", () => {
      const answers = {
        is_qualified: { type: "noul", noul: 0.15 },
      };

      const result = parseAnswers(answers, [booleanDisp]);

      expect(result["is-qualified"]).toEqual({
        value: null,
        confidence: 0.85, // 1 - 0.15
        questionType: "BOOLEAN",
        classifierDispositionId: "disp-bool",
      });
    });

    it("handles missing or malformed BOOLEAN answer safely", () => {
      const answers = {
        is_qualified: { type: "choice", choice: "invalid" },
      };

      const result = parseAnswers(answers, [booleanDisp]);

      expect(result["is-qualified"]).toEqual({
        value: null,
        confidence: null,
        questionType: "BOOLEAN",
        classifierDispositionId: "disp-bool",
      });
    });

    it("parses valid CHOICE answer with selected value and confidence", () => {
      const answers = {
        timeline: { type: "choice", choice: "IMMEDIATE", confidence: 0.92 },
      };

      const result = parseAnswers(answers, [choiceDisp]);

      expect(result.timeline).toEqual({
        value: "IMMEDIATE",
        confidence: 0.92,
        questionType: "CHOICE",
        classifierDispositionId: "disp-choice",
      });
    });

    it("handles missing or malformed CHOICE answer with null fallback", () => {
      const answers = {};

      const result = parseAnswers(answers, [choiceDisp]);

      expect(result.timeline).toEqual({
        value: null,
        confidence: null,
        questionType: "CHOICE",
        classifierDispositionId: "disp-choice",
      });
    });

    it("parses MULTI_CHOICE answers aggregating options that meet >= 0.5 threshold", () => {
      const answers = {
        tech_stack__postgresql: { type: "noul", noul: 0.95 },
        tech_stack__redis: { type: "noul", noul: 0.82 },
        tech_stack__kafka: { type: "noul", noul: 0.2 }, // below threshold
      };

      const result = parseAnswers(answers, [multiChoiceDisp]);

      expect(result["tech-stack"]).toEqual({
        value: ["PostgreSQL", "Redis"],
        confidence: {
          PostgreSQL: 0.95,
          Redis: 0.82,
        },
        questionType: "MULTI_CHOICE",
        classifierDispositionId: "disp-multi",
      });
    });

    it("returns null value and null confidence when no MULTI_CHOICE options reach >= 0.5", () => {
      const answers = {
        tech_stack__postgresql: { type: "noul", noul: 0.3 },
        tech_stack__redis: { type: "noul", noul: 0.1 },
        tech_stack__kafka: { type: "noul", noul: 0.4 },
      };

      const result = parseAnswers(answers, [multiChoiceDisp]);

      expect(result["tech-stack"]).toEqual({
        value: null,
        confidence: null,
        questionType: "MULTI_CHOICE",
        classifierDispositionId: "disp-multi",
      });
    });
  });
});
