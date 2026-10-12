import { describe, it, expect } from "vitest";
import {
  buildDispositionLookupMap,
  mapDynamicExtractions,
  extractOverviewEntries,
  extractInsightEntries,
  type AgentDispositionLookupItem,
  type DynamicExtractionMap,
} from "../../../src/modules/extractions/domain/rules/dynamic-extraction-mapper.rules";

describe("Dynamic Extraction Mapper Rules (Module 11)", () => {
  const sampleDispositions: AgentDispositionLookupItem[] = [
    {
      id: "disp-qualification",
      slug: "lead-qualification-status",
      name: "Qualification Status",
      displayName: "Qualification",
      isObjective: true,
      isSubjective: false,
      objectiveOptions: [
        { value: "Hot Lead", condition: "Ready to purchase immediately", sortOrder: 0 },
        { value: "Warm Lead", condition: "Considering options", sortOrder: 1 },
        { value: "Cold Lead", condition: "Not interested", sortOrder: 2 },
      ],
    },
    {
      id: "disp-budget",
      slug: "customer-budget",
      name: "Customer Budget",
      displayName: "Budget",
      isObjective: true,
      isSubjective: false,
      objectiveOptions: [
        { value: "50k - 100k", condition: "Between 50k and 100k", sortOrder: 0 },
        { value: "100k+", condition: "Above 100k", sortOrder: 1 },
      ],
    },
    {
      id: "disp-feedback",
      slug: "caller-general-feedback",
      name: "Caller General Feedback",
      displayName: "Feedback",
      isObjective: false,
      isSubjective: true,
    },
    {
      id: "disp-hybrid",
      slug: "call-outcome",
      name: "Call Outcome",
      displayName: "Outcome",
      isObjective: true,
      isSubjective: true,
      objectiveOptions: [
        { value: "Sale Closed", condition: "Closed", sortOrder: 0 },
      ],
    },
  ];

  describe("buildDispositionLookupMap", () => {
    it("indexes dispositions by both lowercase name and lowercase slug", () => {
      const map = buildDispositionLookupMap(sampleDispositions);

      // Lookup by name
      expect(map.get("qualification status")?.id).toBe("disp-qualification");
      expect(map.get("customer budget")?.id).toBe("disp-budget");

      // Lookup by slug
      expect(map.get("lead-qualification-status")?.id).toBe("disp-qualification");
      expect(map.get("caller-general-feedback")?.id).toBe("disp-feedback");
    });
  });

  describe("mapDynamicExtractions", () => {
    const lookupMap = buildDispositionLookupMap(sampleDispositions);

    it("maps raw Bolna dynamic extraction JSON to structured DynamicExtractionMap", () => {
      const rawExtractedData = {
        "Sales Qualification": {
          "Qualification Status": {
            objective: "Hot Lead",
            confidence: 0.95,
            confidence_label: "HIGH",
            reasoning_objective: "Customer asked for invoice immediately.",
            validation: "PASSED",
          },
        },
        "Feedback": {
          "Caller General Feedback": {
            subjective: "Very satisfied with quick AI response time.",
            confidence: 0.88,
            confidence_label: "HIGH",
            reasoning_subjective: "Customer complimented the AI speed.",
          },
        },
      };

      const { dynamicResult, primaryDispositionId } = mapDynamicExtractions(
        rawExtractedData,
        lookupMap,
      );

      // Verify Qualification Status entry
      const qualEntry = dynamicResult["Sales Qualification"]["Qualification Status"];
      expect(qualEntry).toBeDefined();
      expect(qualEntry.localDispositionId).toBe("disp-qualification");
      expect(qualEntry.localDispositionSlug).toBe("lead-qualification-status");
      expect(qualEntry.objective).toBe("Hot Lead");
      expect(qualEntry.sortOrder).toBe(0);
      expect(qualEntry.isObjective).toBe(true);
      expect(qualEntry.isSubjective).toBe(false);
      expect(qualEntry.confidence).toBe(0.95);
      expect(qualEntry.confidenceLabel).toBe("HIGH");
      expect(qualEntry.reasoning.objective).toBe("Customer asked for invoice immediately.");
      expect(qualEntry.validation).toBe("PASSED");

      // Verify Feedback entry
      const feedbackEntry = dynamicResult["Feedback"]["Caller General Feedback"];
      expect(feedbackEntry).toBeDefined();
      expect(feedbackEntry.localDispositionId).toBe("disp-feedback");
      expect(feedbackEntry.subjective).toBe("Very satisfied with quick AI response time.");
      expect(feedbackEntry.isObjective).toBe(false);
      expect(feedbackEntry.isSubjective).toBe(true);

      // Primary disposition resolves to objective disposition
      expect(primaryDispositionId).toBe("disp-qualification");
    });

    it("identifies primaryDispositionId based on slug matching 'outcome' or 'disposition'", () => {
      const rawExtractedData = {
        General: {
          "Call Outcome": {
            objective: "Sale Closed",
            confidence: 0.99,
          },
        },
      };

      const { primaryDispositionId } = mapDynamicExtractions(rawExtractedData, lookupMap);
      expect(primaryDispositionId).toBe("disp-hybrid");
    });

    it("handles unknown dispositions gracefully with null local IDs", () => {
      const rawExtractedData = {
        Custom: {
          "Unmapped Question": {
            objective: "Unknown Value",
            confidence: 0.7,
          },
        },
      };

      const { dynamicResult, primaryDispositionId } = mapDynamicExtractions(
        rawExtractedData,
        lookupMap,
      );

      const entry = dynamicResult["Custom"]["Unmapped Question"];
      expect(entry.localDispositionId).toBeNull();
      expect(entry.localDispositionSlug).toBeNull();
      expect(entry.isObjective).toBe(false);
      expect(primaryDispositionId).toBeNull();
    });
  });

  describe("extractOverviewEntries", () => {
    it("extracts only valid objective entries with confidence > 0.5 and non-sentinel values", () => {
      const dynamicMap: DynamicExtractionMap = {
        Qualification: {
          ValidHotLead: {
            localDispositionId: "disp-1",
            localDispositionSlug: "lead-status",
            localDispositionDisplayName: "Lead Status",
            isObjective: true,
            isSubjective: false,
            objective: "Hot Lead",
            subjective: null,
            confidence: 0.85,
            confidenceLabel: "HIGH",
            sortOrder: 0,
            reasoning: { subjective: null, objective: "Clear intent" },
            validation: null,
          },
          LowConfidenceLead: {
            localDispositionId: "disp-2",
            localDispositionSlug: "budget",
            localDispositionDisplayName: "Budget",
            isObjective: true,
            isSubjective: false,
            objective: "100k+",
            subjective: null,
            confidence: 0.4, // <= 0.5 threshold
            confidenceLabel: "LOW",
            sortOrder: 1,
            reasoning: { subjective: null, objective: null },
            validation: null,
          },
          SentinelNoData: {
            localDispositionId: "disp-3",
            localDispositionSlug: "timeline",
            localDispositionDisplayName: "Timeline",
            isObjective: true,
            isSubjective: false,
            objective: "NO_DATA", // Sentinel
            subjective: null,
            confidence: 0.9,
            confidenceLabel: "HIGH",
            sortOrder: 2,
            reasoning: { subjective: null, objective: null },
            validation: null,
          },
          SubjectiveOnly: {
            localDispositionId: "disp-4",
            localDispositionSlug: "notes",
            localDispositionDisplayName: "Notes",
            isObjective: false, // Not objective
            isSubjective: true,
            objective: null,
            subjective: "Some notes",
            confidence: 0.9,
            confidenceLabel: "HIGH",
            sortOrder: null,
            reasoning: { subjective: null, objective: null },
            validation: null,
          },
        },
      };

      const overview = extractOverviewEntries(dynamicMap);

      expect(overview).toHaveLength(1);
      expect(overview[0]).toEqual({
        dispositionId: "disp-1",
        dispositionSlug: "lead-status",
        categoryName: "Qualification",
        objectiveValue: "Hot Lead",
        confidence: 0.85,
        sortOrder: 0,
      });
    });
  });

  describe("extractInsightEntries", () => {
    it("extracts valid subjective entries, normalizes text, and deduplicates identical dispositions", () => {
      const dynamicMap: DynamicExtractionMap = {
        CategoryA: {
          Feedback1: {
            localDispositionId: "disp-feedback-1",
            localDispositionSlug: "user-feedback",
            localDispositionDisplayName: "Feedback",
            isObjective: false,
            isSubjective: true,
            objective: null,
            subjective: "  Extremely positive feedback on pricing   ",
            confidence: 0.9,
            confidenceLabel: "HIGH",
            sortOrder: null,
            reasoning: { subjective: "Client was happy", objective: null },
            validation: null,
          },
        },
        CategoryB: {
          DuplicateFeedback: {
            localDispositionId: "disp-feedback-1", // duplicate disposition ID
            localDispositionSlug: "user-feedback",
            localDispositionDisplayName: "Feedback",
            isObjective: false,
            isSubjective: true,
            objective: null,
            subjective: "Secondary note",
            confidence: 0.8,
            confidenceLabel: "HIGH",
            sortOrder: null,
            reasoning: { subjective: null, objective: null },
            validation: null,
          },
          LowConfidenceFeedback: {
            localDispositionId: "disp-feedback-2",
            localDispositionSlug: "other-notes",
            localDispositionDisplayName: "Notes",
            isObjective: false,
            isSubjective: true,
            objective: null,
            subjective: "Ignored note",
            confidence: 0.3, // <= 0.5
            confidenceLabel: "LOW",
            sortOrder: null,
            reasoning: { subjective: null, objective: null },
            validation: null,
          },
        },
      };

      const insights = extractInsightEntries(dynamicMap);

      expect(insights).toHaveLength(1);
      expect(insights[0]).toEqual({
        dispositionId: "disp-feedback-1",
        dispositionSlug: "user-feedback",
        categoryName: "CategoryA",
        subjectiveValue: "Extremely positive feedback on pricing",
        normalizedValue: "extremely positive feedback on pricing",
        confidence: 0.9,
      });
    });
  });
});
