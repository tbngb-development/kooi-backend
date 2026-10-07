import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import { mapToCreateAgentPayload } from "../../infrastructure/mappers/agent-config.mapper";
import { generateSlug } from "../../../extractions/domain/rules/slug-generator";
import { extractPromptInputFields } from "../../../assistants/infrastructure/promptVariableExtractor";
import { DuplicatePlatformAgentSlugError } from "../../domain/errors/platform-agent.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { PlatformAgent } from "@prisma/client";

export interface CreateAgentFromScratchInput {
  bolnaApiKeyId: string;
  agentName: string;
  systemPrompt: string;
  welcomeMessage?: string;
  industryPackId?: string;
  category?: string;
  description?: string;
}

export class CreateAgentFromScratchUseCase {
  constructor(
    private readonly repository: PlatformAgentRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(input: CreateAgentFromScratchInput): Promise<PlatformAgent> {
    const slug = generateSlug(input.agentName);
    const existingSlug = await this.repository.findBySlug(slug);
    if (existingSlug) {
      throw new DuplicatePlatformAgentSlugError(slug);
    }

    // 1. Build standard default Bolna conversational agent configuration
    const defaultConfig: Record<string, unknown> = {
      agent_name: input.agentName,
      agent_type: "simple_llm_agent",
      agent_welcome_message:
        input.welcomeMessage ?? "Hello, how can I help you today?",
      tasks: [
        {
          task_type: "conversation",
          toolchain: {
            execution: "parallel",
            pipelines: [["transcriber", "llm", "synthesizer"]],
          },
          tools_config: {
            llm_agent: {
              agent_type: "simple_llm_agent",
              agent_flow_type: "streaming",
              llm_config: {
                provider: "openai",
                model: "gpt-4.1-mini",
                max_tokens: 250,
                temperature: 0.2,
                family: "openai",
                request_json: false,
              },
            },
            synthesizer: {
              provider: "elevenlabs",
              provider_config: {
                voice: "Angelica",
                voice_id: "IkSv4tkouLJ6kYsQA7XD",
                model: "eleven_turbo_v2_5",
                temperature: 0.5,
                similarity_boost: 0.5,
              },
              stream: true,
              buffer_size: 200,
              audio_format: "wav",
            },
            transcriber: {
              provider: "deepgram",
              model: "nova-3",
              language: "en",
              stream: true,
              encoding: "linear16",
              sampling_rate: 16000,
              endpointing: 250,
            },
            input: { provider: "vobiz", format: "wav" },
            output: { provider: "vobiz", format: "wav" },
          },
          task_config: {
            call_terminate: 120,
            hangup_after_silence: 12,
            hangup_after_LLMCall: true,
            check_if_user_online: true,
          },
        },
      ],
    };

    // 2. Map configuration to standard Bolna POST payload
    const createPayload = mapToCreateAgentPayload(defaultConfig, {
      agentName: input.agentName,
      welcomeMessage: input.welcomeMessage,
      systemPrompt: input.systemPrompt,
    });

    // 3. Create live agent on Bolna platform
    const bolnaResponse = await this.templateProvider.createAgent(
      createPayload,
      input.bolnaApiKeyId,
    );

    // 4. Extract required dynamic variables from prompt and welcome message
    const requiredVariables = extractPromptInputFields(
      input.systemPrompt,
      input.welcomeMessage ?? "",
    ).map((field) => ({
      name: field.key,
      label: field.label,
      required: true,
      isEditable: true,
    }));

    // 5. Persist PlatformAgent blueprint in KOOI database
    const platformAgent = await this.repository.create({
      bolnaId: bolnaResponse.agent_id,
      bolnaApiKeyId: input.bolnaApiKeyId,
      slug,
      name: input.agentName,
      category: input.category,
      description: input.description,
      industryPackId: input.industryPackId,
      defaultConfig: defaultConfig as any,
      systemPrompt: input.systemPrompt,
      welcomeMessage: input.welcomeMessage ?? null,
      requiredVariables: requiredVariables as any,
    });

    this.logger?.info("Created new PlatformAgent from scratch", {
      action: "platform_agent.create_from_scratch",
      platformAgentId: platformAgent.id,
      bolnaId: bolnaResponse.agent_id,
      slug,
    });

    return platformAgent;
  }
}
