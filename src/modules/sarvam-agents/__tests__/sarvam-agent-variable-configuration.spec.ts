import { describe, it, expect } from "vitest";
import { validateSarvamAgentVariables } from "../domain/rules/sarvam-agent-config.rules";
import { validateSarvamCampaignVariables } from "../domain/rules/sarvam-variable.rules";
import { ValidationError } from "../../../shared/errors/validation.error";
import { SarvamAgentInvalidOverrideError } from "../domain/errors/sarvam-agent.errors";
import type { SarvamAgentVariable } from "../domain/types/sarvam-agent.types";

describe("Sarvam Agent Dynamic Variables Configuration Suite", () => {
  describe("validateSarvamAgentVariables (Admin Configuration)", () => {
    it("accepts valid string variables with 'text' and 'textarea' inputType", () => {
      const result = validateSarvamAgentVariables([
        {
          key: "customer_name",
          dataType: "string",
          inputType: "text",
          required: true,
          defaultValue: "John Doe",
        },
        {
          key: "notes",
          dataType: "string",
          inputType: "textarea",
          required: false,
          defaultValue: "",
        },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("customer_name");
      expect(result[0].dataType).toBe("string");
      expect(result[0].inputType).toBe("text");
      expect(result[0].required).toBe(true);
      expect(result[0].defaultValue).toBe("John Doe");
      expect(result[1].key).toBe("notes");
      expect(result[1].inputType).toBe("textarea");
      expect(result[1].required).toBe(false);
    });

    it("defaults dataType to 'string' and inputType to 'text' when omitted", () => {
      const result = validateSarvamAgentVariables([
        {
          key: "city",
        },
      ]);

      expect(result[0].dataType).toBe("string");
      expect(result[0].inputType).toBe("text");
      expect(result[0].defaultValue).toBe("");
    });

    it("rejects unsupported inputType 'select'", () => {
      expect(() =>
        validateSarvamAgentVariables([
          {
            key: "invalid_input",
            dataType: "string",
            inputType: "select" as any,
          },
        ]),
      ).toThrow(ValidationError);
    });

    it("rejects non-string dataType", () => {
      expect(() =>
        validateSarvamAgentVariables([
          {
            key: "invalid_type",
            dataType: "number" as any,
            inputType: "text",
          },
        ]),
      ).toThrow(ValidationError);
    });

    it("rejects duplicate variable keys", () => {
      expect(() =>
        validateSarvamAgentVariables([
          { key: "city", inputType: "text" },
          { key: "city", inputType: "text" },
        ]),
      ).toThrow(SarvamAgentInvalidOverrideError);
    });

    it("rejects invalid characters in variable key", () => {
      expect(() =>
        validateSarvamAgentVariables([
          { key: "customer name", inputType: "text" },
        ]),
      ).toThrow(ValidationError);
    });
  });

  describe("validateSarvamCampaignVariables (Campaign Creation & Persistence)", () => {
    const definitions: SarvamAgentVariable[] = [
      {
        key: "customer_name",
        dataType: "string",
        inputType: "text",
        required: true,
        defaultValue: "",
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "property_type",
        dataType: "string",
        inputType: "text",
        required: true,
        defaultValue: "Apartment",
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "notes",
        dataType: "string",
        inputType: "textarea",
        required: false,
        defaultValue: "",
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    it("succeeds when all required variables are validly provided", () => {
      const input = {
        customer_name: " Alice Smith ",
        property_type: "Villa",
      };

      const result = validateSarvamCampaignVariables(definitions, input);
      expect(result.missing).toHaveLength(0);
      expect(result.invalidValues).toHaveLength(0);
      expect(result.cleaned).toEqual({
        customer_name: "Alice Smith",
        property_type: "Villa",
      });
    });

    it("flags missing required variables when no default is available", () => {
      const input = {};

      // property_type has defaultValue 'Apartment', but customer_name has no default
      const result = validateSarvamCampaignVariables(definitions, input);
      expect(result.missing).toContain("customer_name");
      expect(result.cleaned.property_type).toBe("Apartment");
    });

    it("applies tenant overrides for missing required variables", () => {
      const input = {};
      const tenantOverrides = {
        customer_name: "Tenant Default Name",
      };

      const result = validateSarvamCampaignVariables(
        definitions,
        input,
        tenantOverrides,
      );
      expect(result.missing).toHaveLength(0);
      expect(result.cleaned.customer_name).toBe("Tenant Default Name");
      expect(result.cleaned.property_type).toBe("Apartment");
    });

    it("allows optional variables to be omitted without errors", () => {
      const input = {
        customer_name: "David",
        property_type: "Apartment",
      };

      const result = validateSarvamCampaignVariables(definitions, input);
      expect(result.missing).toHaveLength(0);
      expect(result.invalidValues).toHaveLength(0);
      expect(result.cleaned.notes).toBeUndefined();
    });
  });
});
