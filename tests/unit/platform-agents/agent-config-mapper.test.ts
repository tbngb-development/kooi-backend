import { describe, it, expect } from "vitest";
import { mapToCreateAgentPayload } from "../../../src/modules/platform-agents/infrastructure/mappers/agent-config.mapper";

describe("Agent Config Mapper (Module 6 - Platform Agents)", () => {
  it("strips read-only metadata fields from agent_config payload", () => {
    const rawConfig = {
      id: "agent-123",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      agent_status: "ACTIVE",
      created_by: "user-456",
      restricted: false,
      creation_source: "DASHBOARD",
      parent_agent_id: "parent-789",
      source_agent_id: "src-101",
      dispositions: ["Interested", "Not Interested"],
      gpt_assistants: ["asst_abc"],
      webhook_config: { url: "https://example.com/webhook" },
      webhook_headers: { Authorization: "Bearer secret" },
      custom_analytics: {},
      ingest_lookup_key: "key_xyz",
      sip_header_variables: {},
      inbound_phone_number: "+1234567890",
      switch_handoff_messages: [],
      switch_tool_description: "handoff tool",
      agent_names: ["Test Agent"],
      mip_opt_out: false,
      multilingual: false,
      // Valid operational fields
      agent_name: "Original Name",
      agent_welcome_message: "Hello from agent",
      agent_prompts: {
        task_1: {
          system_prompt: "You are a sales rep.",
        },
      },
      tasks: [{ task_type: "conversation" }],
      llm_model: "gpt-4o-mini",
    };

    const payload = mapToCreateAgentPayload(rawConfig);

    // Verify read-only fields are stripped from agent_config
    const agentConfig = payload.agent_config as Record<string, unknown>;
    expect(agentConfig.id).toBeUndefined();
    expect(agentConfig.created_at).toBeUndefined();
    expect(agentConfig.updated_at).toBeUndefined();
    expect(agentConfig.agent_status).toBeUndefined();
    expect(agentConfig.webhook_config).toBeUndefined();
    expect(agentConfig.webhook_headers).toBeUndefined();
    expect(agentConfig.dispositions).toBeUndefined();
    expect(agentConfig.inbound_phone_number).toBeUndefined();

    // Verify operational fields remain
    expect(agentConfig.llm_model).toBe("gpt-4o-mini");
    expect(agentConfig.agent_name).toBe("Original Name");
    expect(agentConfig.agent_welcome_message).toBe("Hello from agent");
    expect(agentConfig.tasks).toEqual([{ task_type: "conversation" }]);

    // Verify prompts properly extracted to agent_prompts
    expect(payload.agent_prompts).toEqual({
      task_1: {
        system_prompt: "You are a sales rep.",
      },
    });
  });

  it("applies overrides for agentName, welcomeMessage, and systemPrompt", () => {
    const rawConfig = {
      agent_name: "Old Name",
      agent_welcome_message: "Old Welcome",
      agent_prompts: {
        task_1: {
          system_prompt: "Old Prompt",
        },
      },
    };

    const payload = mapToCreateAgentPayload(rawConfig, {
      agentName: "Overridden Name",
      welcomeMessage: "New Custom Greeting",
      systemPrompt: "New Custom Instructions",
    });

    expect(payload.agent_config.agent_name).toBe("Overridden Name");
    expect(payload.agent_config.agent_welcome_message).toBe("New Custom Greeting");
    expect(payload.agent_prompts.task_1.system_prompt).toBe("New Custom Instructions");
  });

  it("handles null welcomeMessage override cleanly", () => {
    const rawConfig = {
      agent_name: "Agent With Null Welcome",
      agent_welcome_message: "Existing Welcome",
    };

    const payload = mapToCreateAgentPayload(rawConfig, {
      welcomeMessage: null,
    });

    expect(payload.agent_config.agent_welcome_message).toBeNull();
  });

  it("falls back to 'Imported Agent' if agent_name is absent", () => {
    const rawConfig = {};

    const payload = mapToCreateAgentPayload(rawConfig);

    expect(payload.agent_config.agent_name).toBe("Imported Agent");
    expect(payload.agent_prompts.task_1.system_prompt).toBe("");
    expect(payload.agent_config.tasks).toEqual([]);
  });
});
