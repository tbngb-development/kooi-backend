import { describe, it, expect } from "vitest";
import {
  extractTemplateVariables,
  resolveWelcomeMessage,
  validateAssistantVariables,
} from "../assistant-variable.rules";
import { AssistantVariableValidationError } from "../../errors/assistant.errors";
import type { RequiredVariable } from "../../../../../shared/types/bolna.types";

describe("assistant-variable.rules", () => {
  describe("extractTemplateVariables", () => {
    it("should extract variables from ${var}, {{var}}, and {var} syntaxes", () => {
      const template = "Hi, I am ${agentName} from {{builderName}} in {city}.";
      const result = extractTemplateVariables(template);
      expect(result).toEqual(expect.arrayContaining(["agentName", "builderName", "city"]));
      expect(result.length).toBe(3);
    });

    it("should deduplicate variable names", () => {
      const template = "${name} is {{name}} and {name}";
      const result = extractTemplateVariables(template);
      expect(result).toEqual(["name"]);
    });

    it("should return empty array for empty string", () => {
      expect(extractTemplateVariables("")).toEqual([]);
    });
  });

  describe("resolveWelcomeMessage", () => {
    const fallback = "Hi there, how can I help?";

    it("should return fallback when welcomeConfig is undefined", () => {
      expect(resolveWelcomeMessage(undefined, {}, fallback)).toBe(fallback);
    });

    it("should return defaultValue when type is 'default'", () => {
      const config = {
        type: "default" as const,
        defaultValue: "Default welcome greeting",
      };
      expect(resolveWelcomeMessage(config, { agentName: "Sara" }, fallback)).toBe(
        "Default welcome greeting",
      );
    });

    it("should return custom interpolated message when all variables are non-empty", () => {
      const config = {
        type: "custom" as const,
        defaultValue: "Default welcome greeting",
        customValue: "Hi, this is ${agentName} from ${builderName}. How may I help you?",
      };
      const variables = {
        agentName: "Sara",
        builderName: "Sobha Developers",
      };
      const result = resolveWelcomeMessage(config, variables, fallback);
      expect(result).toBe("Hi, this is Sara from Sobha Developers. How may I help you?");
    });

    it("should fallback to defaultValue when any referenced variable is missing", () => {
      const config = {
        type: "custom" as const,
        defaultValue: "Default welcome greeting",
        customValue: "Hi, this is ${agentName} from ${builderName}. How may I help you?",
      };
      const variables = {
        agentName: "Sara",
      };
      const result = resolveWelcomeMessage(config, variables, fallback);
      expect(result).toBe("Default welcome greeting");
    });

    it("should fallback to defaultValue when any referenced variable is empty string", () => {
      const config = {
        type: "custom" as const,
        defaultValue: "Default welcome greeting",
        customValue: "Hi, this is ${agentName} from ${builderName}. How may I help you?",
      };
      const variables = {
        agentName: "Sara",
        builderName: "   ",
      };
      const result = resolveWelcomeMessage(config, variables, fallback);
      expect(result).toBe("Default welcome greeting");
    });

    it("should interpolate {{var}} and {var} template styles as well", () => {
      const config = {
        type: "custom" as const,
        defaultValue: "Default welcome greeting",
        customValue: "Hello {{name}}, welcome to {project}!",
      };
      const variables = {
        name: "John",
        project: "Skyline Towers",
      };
      const result = resolveWelcomeMessage(config, variables, fallback);
      expect(result).toBe("Hello John, welcome to Skyline Towers!");
    });
  });

  describe("validateAssistantVariables", () => {
    const requiredVars: RequiredVariable[] = [
      {
        name: "agentName",
        label: "Agent Name",
        required: true,
        isEditable: true,
        inputType: "text",
        defaultValue: "Sara",
      },
      {
        name: "companyName",
        label: "Company Name",
        required: true,
        isEditable: true,
        inputType: "text",
        defaultValue: null,
      },
      {
        name: "system_token",
        label: "System Token",
        required: true,
        isEditable: false,
        inputType: "text",
        defaultValue: "fixed_val",
      },
      {
        name: "notes",
        label: "Notes",
        required: false,
        isEditable: true,
        inputType: "textarea",
        defaultValue: null,
      },
    ];

    it("should reject inbound config when agent type is OUTBOUND", () => {
      expect(() =>
        validateAssistantVariables("OUTBOUND", requiredVars, {
          inbound: { variables: { companyName: "Acme" } },
        }),
      ).toThrow(AssistantVariableValidationError);
    });

    it("should reject outbound config when agent type is INBOUND", () => {
      expect(() =>
        validateAssistantVariables("INBOUND", requiredVars, {
          outbound: { variables: { companyName: "Acme" } },
        }),
      ).toThrow(AssistantVariableValidationError);
    });

    it("should allow both inbound and outbound configs when agent type is BOTH", () => {
      const result = validateAssistantVariables("BOTH", requiredVars, {
        inbound: {
          variables: { companyName: "Acme Inbound" },
          welcomeMessage: { type: "default", defaultValue: "Hello Inbound" },
        },
        outbound: {
          variables: { companyName: "Acme Outbound" },
          welcomeMessage: { type: "default", defaultValue: "Hello Outbound" },
        },
      });

      expect(result.inbound?.variables?.companyName).toBe("Acme Inbound");
      // agentName has default "Sara" and should be auto-filled
      expect(result.inbound?.variables?.agentName).toBe("Sara");
      // system_token is non-editable and should be stripped
      expect(result.inbound?.variables?.system_token).toBeUndefined();

      expect(result.outbound?.variables?.companyName).toBe("Acme Outbound");
      expect(result.outbound?.variables?.agentName).toBe("Sara");
    });

    it("should throw error if required editable variable with no default is missing", () => {
      expect(() =>
        validateAssistantVariables("OUTBOUND", requiredVars, {
          outbound: {
            variables: { agentName: "Custom Agent" }, // missing companyName
          },
        }),
      ).toThrow(/Missing required variables for outbound: companyName/);
    });

    it("should auto-fill defaultValue for required variable when left empty", () => {
      const result = validateAssistantVariables("OUTBOUND", requiredVars, {
        outbound: {
          variables: { companyName: "Sobha", agentName: "" },
        },
      });

      expect(result.outbound?.variables?.agentName).toBe("Sara");
      expect(result.outbound?.variables?.companyName).toBe("Sobha");
    });
  });
});
