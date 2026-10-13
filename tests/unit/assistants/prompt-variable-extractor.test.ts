import { describe, it, expect } from "vitest";
import {
  extractPromptInputFields,
  getAgentSystemPrompt,
  getAgentFirstMessage,
} from "../../../src/modules/assistants/infrastructure/promptVariableExtractor";
import type { BolnaAgentResponse } from "../../../src/shared/types/bolna.types";

describe("Prompt Variable Extractor (Module 6 - Assistants)", () => {
  it("extracts placeholders from CAMPAIGN VARIABLES section and formats keys into title labels", () => {
    const systemPrompt = `
You are an AI sales development representative for Real Estate.

1. CAMPAIGN VARIABLES
- Customer name: {customer_name}
- Project location: {project_location}
- Budget range: {budget_range}

2. PRIMARY OBJECTIVE
Qualify whether {customer_name} is interested in purchasing property.
`;
    const firstMessage = "Hello {customer_name}, I am calling regarding your inquiry for {project_location}.";

    const fields = extractPromptInputFields(systemPrompt, firstMessage);

    expect(fields).toEqual([
      { key: "customer_name", label: "Customer Name" },
      { key: "project_location", label: "Project Location" },
      { key: "budget_range", label: "Budget Range" },
    ]);
  });

  it("deduplicates placeholder tokens appearing in both systemPrompt and firstMessage", () => {
    const systemPrompt = `
CAMPAIGN VARIABLES
{lead_name} is looking for a car.
`;
    const firstMessage = "Hi {lead_name}, is this a good time?";

    const fields = extractPromptInputFields(systemPrompt, firstMessage);

    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ key: "lead_name", label: "Lead Name" });
  });

  it("falls back to scanning content before PRIMARY OBJECTIVE when CAMPAIGN VARIABLES header is omitted", () => {
    const systemPrompt = `
Role: Qualification agent.
Target company: {company_name}
Industry vertical: {industry}

PRIMARY OBJECTIVE
Ask for meeting schedule.
`;
    const firstMessage = "Hello, calling about {company_name}.";

    const fields = extractPromptInputFields(systemPrompt, firstMessage);

    expect(fields).toEqual([
      { key: "company_name", label: "Company Name" },
      { key: "industry", label: "Industry" },
    ]);
  });

  it("formats snake_case tokens into Title Case cleanly", () => {
    const systemPrompt = "CAMPAIGN VARIABLES: {first_name} {user_id} {preferred_property_type}";
    const firstMessage = "";

    const fields = extractPromptInputFields(systemPrompt, firstMessage);

    expect(fields).toEqual([
      { key: "first_name", label: "First Name" },
      { key: "user_id", label: "User Id" },
      { key: "preferred_property_type", label: "Preferred Property Type" },
    ]);
  });

  it("returns an empty array when prompt and welcome message have no placeholders", () => {
    const systemPrompt = "You are a customer service assistant with no dynamic variables.";
    const firstMessage = "Hello, how can I help you today?";

    const fields = extractPromptInputFields(systemPrompt, firstMessage);

    expect(fields).toEqual([]);
  });

  it("handles empty or null string inputs safely without throwing", () => {
    expect(extractPromptInputFields("", "")).toEqual([]);
    expect(extractPromptInputFields(null as unknown as string, undefined as unknown as string)).toEqual([]);
  });

  it("extracts system prompt and first message helpers from BolnaAgentResponse", () => {
    const mockAgent: BolnaAgentResponse = {
      agent_prompts: {
        task_1: {
          system_prompt: "  System prompt content  ",
        },
      },
      agent_welcome_message: "  Welcome message content  ",
    } as any;

    expect(getAgentSystemPrompt(mockAgent)).toBe("System prompt content");
    expect(getAgentFirstMessage(mockAgent)).toBe("Welcome message content");
  });

  it("safely handles missing nested prompts in BolnaAgentResponse", () => {
    const mockAgent: BolnaAgentResponse = {} as any;

    expect(getAgentSystemPrompt(mockAgent)).toBe("");
    expect(getAgentFirstMessage(mockAgent)).toBe("");
  });
});
