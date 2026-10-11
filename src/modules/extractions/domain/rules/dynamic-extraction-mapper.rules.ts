export interface AgentDispositionLookupItem {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  isObjective: boolean;
  isSubjective: boolean;
  objectiveOptions?: Array<{
    value: string;
    condition: string;
    sortOrder?: number;
    sub_options?: unknown[];
  }> | null;
}

export interface DynamicExtractionEntry {
  localDispositionId: string | null;
  localDispositionDisplayName: string | null;
  localDispositionSlug: string | null;
  subjective: string | null;
  objective: string | null;
  sortOrder?: number | null;
  isObjective: boolean;
  isSubjective: boolean;
  confidence: number | null;
  confidenceLabel: string | null;
  reasoning: {
    subjective: string | null;
    objective: string | null;
  };
  validation: string | null;
}

export type DynamicExtractionMap = Record<
  string,
  Record<string, DynamicExtractionEntry>
>;

export interface MappedOverviewEntry {
  dispositionId: string;
  dispositionSlug: string;
  categoryName: string;
  objectiveValue: string;
  confidence: number;
  sortOrder: number;
}

export interface MappedInsightEntry {
  dispositionId: string;
  dispositionSlug: string;
  categoryName: string;
  subjectiveValue: string;
  normalizedValue: string;
  confidence: number;
}

export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.5;
export const INVALID_EXTRACTION_SENTINELS = new Set(["NO_DATA"]);

/**
 * Builds a fast lookup map for agent dispositions indexed by lowercase name and slug.
 */
export function buildDispositionLookupMap(
  dispositions: AgentDispositionLookupItem[],
): Map<string, AgentDispositionLookupItem> {
  const map = new Map<string, AgentDispositionLookupItem>();
  for (const disp of dispositions) {
    map.set(disp.name.toLowerCase(), disp);
    map.set(disp.slug.toLowerCase(), disp);
  }
  return map;
}

/**
 * Pure transformation that parses raw Bolna dynamic extraction JSON into
 * structured DynamicExtractionMap using resolved agent dispositions.
 */
export function mapDynamicExtractions(
  extractedData: Record<string, unknown>,
  dispositionLookup: Map<string, AgentDispositionLookupItem>,
): {
  dynamicResult: DynamicExtractionMap;
  primaryDispositionId: string | null;
} {
  const dynamicResult: DynamicExtractionMap = {};
  let primaryDispositionId: string | null = null;

  for (const [categoryName, dispositions] of Object.entries(extractedData)) {
    if (typeof dispositions !== "object" || dispositions === null) continue;

    const categoryResult: Record<string, DynamicExtractionEntry> = {};

    for (const [dispName, value] of Object.entries(
      dispositions as Record<string, Record<string, unknown>>,
    )) {
      if (typeof value !== "object" || value === null) continue;

      const localDisp =
        dispositionLookup.get(dispName.toLowerCase()) ??
        dispositionLookup.get(dispName);

      let sortOrder: number | null = null;
      if (
        localDisp?.isObjective &&
        value.objective != null &&
        localDisp.objectiveOptions &&
        Array.isArray(localDisp.objectiveOptions)
      ) {
        const cleanObj = String(value.objective).trim().toLowerCase();
        const matchedIdx = localDisp.objectiveOptions.findIndex(
          (opt) => opt.value?.trim().toLowerCase() === cleanObj,
        );
        if (matchedIdx !== -1) {
          const matchedOpt = localDisp.objectiveOptions[matchedIdx];
          sortOrder =
            typeof matchedOpt.sortOrder === "number"
              ? matchedOpt.sortOrder
              : matchedIdx;
        }
      }

      const entry: DynamicExtractionEntry = {
        localDispositionId: localDisp?.id ?? null,
        localDispositionSlug: localDisp?.slug ?? null,
        localDispositionDisplayName: localDisp?.displayName ?? null,
        subjective: (value.subjective as string) ?? null,
        objective: (value.objective as string) ?? null,
        sortOrder,
        isObjective: localDisp?.isObjective ?? false,
        isSubjective: localDisp?.isSubjective ?? false,
        confidence: (value.confidence as number) ?? null,
        confidenceLabel: (value.confidence_label as string) ?? null,
        reasoning: {
          subjective: (value.reasoning_subjective as string) ?? null,
          objective: (value.reasoning_objective as string) ?? null,
        },
        validation: (value.validation as string) ?? null,
      };

      categoryResult[dispName] = entry;

      if (!primaryDispositionId && localDisp && value.objective != null) {
        const slugLower = localDisp.slug.toLowerCase();
        if (
          slugLower.includes("disposition") ||
          slugLower.includes("outcome")
        ) {
          primaryDispositionId = localDisp.id;
        }
      }
    }

    dynamicResult[categoryName] = categoryResult;
  }

  if (!primaryDispositionId) {
    for (const dispositions of Object.values(dynamicResult)) {
      for (const result of Object.values(dispositions)) {
        if (result.localDispositionId && result.objective != null) {
          primaryDispositionId = result.localDispositionId;
          break;
        }
      }
      if (primaryDispositionId) break;
    }
  }

  return { dynamicResult, primaryDispositionId };
}

/**
 * Extracts qualified objective entries for overview metrics materialization.
 */
export function extractOverviewEntries(
  dynamicResult: DynamicExtractionMap,
): MappedOverviewEntry[] {
  const objectiveEntries: MappedOverviewEntry[] = [];

  for (const [categoryName, dispositions] of Object.entries(dynamicResult)) {
    for (const [_dispName, entry] of Object.entries(dispositions)) {
      if (
        entry.isObjective &&
        entry.localDispositionId &&
        entry.localDispositionSlug &&
        entry.objective !== null &&
        entry.objective.trim() !== "" &&
        !INVALID_EXTRACTION_SENTINELS.has(entry.objective.trim()) &&
        entry.confidence &&
        entry.confidence > EXTRACTION_CONFIDENCE_THRESHOLD
      ) {
        objectiveEntries.push({
          dispositionId: entry.localDispositionId,
          dispositionSlug: entry.localDispositionSlug,
          categoryName,
          objectiveValue: entry.objective.trim(),
          confidence: entry.confidence,
          sortOrder: entry.sortOrder ?? 0,
        });
      }
    }
  }

  return objectiveEntries;
}

/**
 * Extracts qualified subjective entries for insight metrics materialization with deduplication.
 */
export function extractInsightEntries(
  dynamicResult: DynamicExtractionMap,
): MappedInsightEntry[] {
  const subjectiveEntries: MappedInsightEntry[] = [];
  const seenDispositions = new Set<string>();

  for (const [categoryName, dispositions] of Object.entries(dynamicResult)) {
    for (const [_dispName, entry] of Object.entries(dispositions)) {
      if (
        entry.isSubjective &&
        entry.localDispositionId &&
        entry.localDispositionSlug &&
        entry.subjective !== null &&
        entry.subjective.trim() !== "" &&
        !INVALID_EXTRACTION_SENTINELS.has(entry.subjective.trim()) &&
        entry.confidence &&
        entry.confidence > EXTRACTION_CONFIDENCE_THRESHOLD
      ) {
        if (seenDispositions.has(entry.localDispositionId)) continue;
        seenDispositions.add(entry.localDispositionId);

        const raw = entry.subjective.trim();
        subjectiveEntries.push({
          dispositionId: entry.localDispositionId,
          dispositionSlug: entry.localDispositionSlug,
          categoryName: categoryName.trim().replace(/\s+/g, " "),
          subjectiveValue: raw,
          normalizedValue: raw.toLowerCase().replace(/\s+/g, " "),
          confidence: entry.confidence,
        });
      }
    }
  }

  return subjectiveEntries;
}
