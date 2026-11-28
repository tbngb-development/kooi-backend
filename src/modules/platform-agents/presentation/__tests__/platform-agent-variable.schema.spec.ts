import { describe, it, expect } from "vitest";
import {
  updateExtractionConfigSchema,
  updatePlatformAgentVariableSchema,
} from "../platform-agent.schema";

const selectVariable = {
  name: "bhk_type",
  label: "BHK Type",
  required: true,
  isEditable: true,
  inputType: "select",
  defaultValue: "2 BHK",
  options: ["1 BHK", "2 BHK", "3 BHK"],
};

describe("Platform agent variable schemas — select input type", () => {
  describe("updateExtractionConfigSchema", () => {
    it("accepts a select variable with predefined options", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [selectVariable],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requiredVariables?.[0]).toMatchObject({
          inputType: "select",
          options: ["1 BHK", "2 BHK", "3 BHK"],
        });
      }
    });

    it("rejects a select variable with no options", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [{ ...selectVariable, options: [] }],
      });

      expect(result.success).toBe(false);
    });

    it("rejects the reserved 'Other' value as a predefined option", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [
          { ...selectVariable, options: ["1 BHK", "Other"] },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("rejects the frontend 'Other' sentinel as a predefined option", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [
          { ...selectVariable, options: ["2 BHK", "__other__"] },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("rejects duplicate options (case-insensitive)", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [
          { ...selectVariable, options: ["2 BHK", "2 bhk"] },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("rejects a default value that is not one of the options", () => {
      const result = updateExtractionConfigSchema.safeParse({
        requiredVariables: [
          { ...selectVariable, defaultValue: "4 BHK" },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe("updatePlatformAgentVariableSchema", () => {
    it("accepts inputType select with options", () => {
      const result = updatePlatformAgentVariableSchema.safeParse({
        inputType: "select",
        options: ["North", "South"],
      });

      expect(result.success).toBe(true);
    });

    it("rejects select without any options", () => {
      const result = updatePlatformAgentVariableSchema.safeParse({
        inputType: "select",
      });

      expect(result.success).toBe(false);
    });
  });
});
