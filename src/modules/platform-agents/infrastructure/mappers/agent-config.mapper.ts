import type { BolnaCreateAgentPayload } from "../../../../shared/types/bolna.types";

const READ_ONLY_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "agent_status",
  "created_by",
  "restricted",
  "creation_source",
  "parent_agent_id",
  "source_agent_id",
  "dispositions",
  "gpt_assistants",
  "webhook_config",
  "webhook_headers",
  "custom_analytics",
  "ingest_lookup_key",
  "sip_header_variables",
  "inbound_phone_number",
  "switch_handoff_messages",
  "switch_tool_description",
  "agent_names",
  "mip_opt_out",
  "multilingual",
]);

export interface AgentConfigOverrides {
  agentName?: string;
  welcomeMessage?: string | null;
  systemPrompt?: string | null;
}

export function mapToCreateAgentPayload(
  defaultConfig: Record<string, unknown>,
  overrides: AgentConfigOverrides = {},
): BolnaCreateAgentPayload {
  const configCopy = { ...defaultConfig };

  // 1. Strip read-only metadata fields
  for (const field of READ_ONLY_FIELDS) {
    delete configCopy[field];
  }

  // 2. Extract prompts before nesting into agent_config
  const originalPrompts = configCopy.agent_prompts as
    | { task_1?: { system_prompt?: string } }
    | undefined;
  delete configCopy.agent_prompts;

  // 3. Resolve required & overridden values
  const agentName =
    overrides.agentName ||
    (configCopy.agent_name as string) ||
    "Imported Agent";

  const welcomeMessage =
    overrides.welcomeMessage !== undefined
      ? overrides.welcomeMessage
      : (configCopy.agent_welcome_message as string | null | undefined);

  const tasks = Array.isArray(configCopy.tasks)
    ? (configCopy.tasks as Array<Record<string, unknown>>)
    : [];

  const systemPrompt =
    overrides.systemPrompt ??
    originalPrompts?.task_1?.system_prompt ??
    "";

  // 4. Construct payload matching Bolna API structure
  return {
    agent_config: {
      ...configCopy,
      agent_name: agentName,
      ...(welcomeMessage !== undefined && { agent_welcome_message: welcomeMessage }),
      tasks,
    },
    agent_prompts: {
      task_1: {
        system_prompt: systemPrompt,
      },
    },
  };
}