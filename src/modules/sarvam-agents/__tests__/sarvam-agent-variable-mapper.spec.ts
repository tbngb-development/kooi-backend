import { describe, it, expect } from "vitest";
import { SarvamAgentMapper } from "../application/mappers/sarvam-agent.mapper";

describe("SarvamAgentMapper.parseAgentVariables — select support", () => {
  const mapper = new SarvamAgentMapper();

  it("preserves the select inputType and its predefined options", () => {
    const result = mapper.parseAgentVariables([
      {
        key: "bhk_type",
        dataType: "string",
        inputType: "select",
        options: ["1 BHK", "2 BHK", "3 BHK"],
        required: true,
        defaultValue: "2 BHK",
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ]);

    expect(result[0]).toMatchObject({
      key: "bhk_type",
      inputType: "select",
      options: ["1 BHK", "2 BHK", "3 BHK"],
    });
  });

  it("trims and drops invalid options", () => {
    const result = mapper.parseAgentVariables([
      {
        key: "city",
        inputType: "select",
        options: [" North ", "", 42, null, "South"],
      },
    ]);

    expect(result[0].options).toEqual(["North", "South"]);
  });

  it("falls back to text for unknown input types", () => {
    const result = mapper.parseAgentVariables([
      { key: "city", inputType: "dropdown" },
    ]);

    expect(result[0].inputType).toBe("text");
    expect(result[0].options).toBeUndefined();
  });

  it("exposes select options in tenant detail variables", () => {
    const result = mapper.toTenantDetailDTO({
      id: "agent-id",
      name: "Sarvam Agent",
      appId: "app",
      appVersion: 1,
      attemptsPerSecond: null,
      gender: null,
      type: "OUTBOUND",
      agentVariables: [
        {
          key: "bhk_type",
          dataType: "string",
          inputType: "select",
          options: ["1 BHK", "2 BHK"],
          required: true,
          defaultValue: "1 BHK",
          isTenantVisible: true,
          isTenantEditable: true,
        },
      ],
      welcomeMessage: null,
      audioUrl: null,
      audioRecordings: null,
      retryConfig: null,
      allowedSchedule: null,
      allowTenantVisible: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    expect(result.variables[0]).toMatchObject({
      key: "bhk_type",
      inputType: "select",
      options: ["1 BHK", "2 BHK"],
      effectiveValue: "1 BHK",
    });
  });
});
