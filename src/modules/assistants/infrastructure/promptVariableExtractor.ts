import { type BolnaAgentResponse } from "../../../shared/types/bolna.types";

type PromptInputField = {
  key: string;
  label: string;
};

export function extractPromptInputFields(
  systemPrompt: string,
  firstMessage: string,
): PromptInputField[] {
  const normalize = (value?: string | null): string =>
    typeof value === "string" ? value.trim() : "";

  const toLabel = (key: string): string =>
    key
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const extractPlaceholders = (text: string): string[] => {
    if (!text) return [];

    const matches = text.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g);
    const keys: string[] = [];

    for (const match of matches) {
      const key = match[1]?.trim();
      if (key) keys.push(key);
    }

    return keys;
  };

  const extractInputScope = (prompt: string): string => {
    if (!prompt) return "";

    // 1. Preferred: only scan CAMPAIGN VARIABLES section
    const campaignSectionMatch = prompt.match(
      /(?:^|\n)\s*(?:\d+\.\s*)?CAMPAIGN VARIABLES([\s\S]*?)(?=(?:\n\s*(?:\d+\.\s*)?PRIMARY OBJECTIVE\b)|$)/i,
    );

    if (campaignSectionMatch?.[1]?.trim()) {
      return campaignSectionMatch[1].trim();
    }

    // 2. Fallback: scan everything before PRIMARY OBJECTIVE
    // This usually contains only input variables, not output ones
    const beforePrimaryObjective = prompt
      .split(/\bPRIMARY OBJECTIVE\b/i)[0]
      ?.trim();
    return beforePrimaryObjective || "";
  };

  const promptScope = extractInputScope(normalize(systemPrompt));
  const allKeys = [
    ...extractPlaceholders(promptScope),
    ...extractPlaceholders(normalize(firstMessage)),
  ];

  const uniqueKeys = Array.from(new Set(allKeys));

  return uniqueKeys.map((key) => ({
    key,
    label: toLabel(key),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — extract prompt and first message cleanly from agent response
// ─────────────────────────────────────────────────────────────────────────────

export function getAgentSystemPrompt(agent: BolnaAgentResponse): string {
  return agent.agent_prompts?.task_1?.system_prompt?.trim() ?? "";
}

export function getAgentFirstMessage(agent: BolnaAgentResponse): string {
  return agent.agent_welcome_message?.trim() ?? "";
}
