import { describe, it, expect, vi } from "vitest";
import { GetAssistantUseCase } from "../application/use-cases/get-assistant.use-case";
import type { AssistantRepository } from "../application/interfaces/assistant-repository.interface";

describe("GetAssistantUseCase — variable options exposure", () => {
  it("exposes select inputType and options to the frontend", async () => {
    const repository = {
      findByIdWithPlatformAgent: vi.fn().mockResolvedValue({
        id: "assistant-id",
        name: "Assistant",
        platformAgent: {
          systemPrompt: "",
          welcomeMessage: "",
          requiredVariables: [
            {
              name: "bhk_type",
              label: "BHK Type",
              required: true,
              isEditable: true,
              inputType: "select",
              options: ["1 BHK", "2 BHK"],
              defaultValue: null,
            },
          ],
        },
      }),
    } as unknown as AssistantRepository;

    const output = await new GetAssistantUseCase(repository).execute(
      "tenant-id",
      "assistant-id",
    );

    expect(output.variables[0]).toEqual({
      key: "bhk_type",
      label: "BHK Type",
      required: true,
      isEditable: true,
      inputType: "select",
      options: ["1 BHK", "2 BHK"],
      defaultValue: null,
    });
  });
});
