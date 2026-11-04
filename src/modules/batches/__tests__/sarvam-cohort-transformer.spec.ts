import { describe, it, expect } from "vitest";
import { SarvamCohortTransformer } from "../infrastructure/sarvam-cohort-transformer";
import type { SarvamAgentVariable } from "../../sarvam-agents/domain/types/sarvam-agent.types";
import type { LeadRow } from "../../leads/infrastructure/leadParser";

describe("SarvamCohortTransformer", () => {
  const transformer = new SarvamCohortTransformer();

  const dummyVariables: SarvamAgentVariable[] = [
    {
      key: "customer_name",
      defaultValue: "",
      isTenantVisible: true,
      isTenantEditable: true,
    },
    {
      key: "account_number",
      defaultValue: "",
      isTenantVisible: true,
      isTenantEditable: true,
    },
    {
      key: "city",
      defaultValue: "Mumbai",
      isTenantVisible: true,
      isTenantEditable: true,
    },
  ];

  it("identifies missing required variables that have no default, override, or campaign value", () => {
    const leads: LeadRow[] = [
      {
        phone: "9876543210",
        name: "Aarav Sharma",
      },
    ];

    const result = transformer.transform(leads, dummyVariables, {}, {});

    // customer_name is covered by lead.name
    // city has defaultValue "Mumbai"
    // account_number has no default, no override, no campaign value, and is not in leads
    expect(result.missingRequiredVariables).toContain("account_number");
    expect(result.missingRequiredVariables).not.toContain("customer_name");
    expect(result.missingRequiredVariables).not.toContain("city");
  });

  it("resolves missing required variable when supplied via campaign variables", () => {
    const leads: LeadRow[] = [
      {
        phone: "9876543210",
        name: "Aarav Sharma",
      },
    ];

    const result = transformer.transform(
      leads,
      dummyVariables,
      {},
      { account_number: "ACC-999" },
    );

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.matchedVariables).toContain("account_number");
  });

  it("generates correct CSV headers and transformation JSON matching official schema", () => {
    const leads: LeadRow[] = [
      {
        phone: "+91 9876543210",
        name: "Priya Patel",
        account_number: "ACC-12345",
        unrelated_col: "ignored_value",
      },
      {
        phone: "9123456789",
        name: "Rahul Roy",
        account_number: "ACC-67890",
        city: "Delhi",
      },
      {
        phone: "+1 2025550123", // Non-Indian, should be filtered
        name: "John Doe",
        account_number: "ACC-00000",
      },
    ];

    const result = transformer.transform(leads, dummyVariables, {}, {});

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.totalLeads).toBe(2);

    // Unmatched column "unrelated_col" should NOT be in matchedVariables
    expect(result.matchedVariables).not.toContain("unrelated_col");
    expect(result.matchedVariables).toContain("customer_name");
    expect(result.matchedVariables).toContain("account_number");
    expect(result.matchedVariables).toContain("city");

    // CSV structure check
    const csvString = result.transformedCsvBuffer.toString("utf-8");
    const lines = csvString.trim().split("\n");
    expect(lines[0]).toBe("contact_number,customer_name,account_number,city");

    expect(lines[1]).toContain("+919876543210");
    expect(lines[1]).toContain("Priya Patel");
    expect(lines[1]).toContain("ACC-12345");
    expect(lines[1]).toContain("Mumbai"); // default for city

    expect(lines[2]).toContain("+919123456789");
    expect(lines[2]).toContain("Rahul Roy");
    expect(lines[2]).toContain("ACC-67890");
    expect(lines[2]).toContain("Delhi");

    // Transformation JSON schema check
    const json = result.transformationJson;
    expect(json.phone_number).toEqual({
      column_name: "contact_number",
      required: true,
      formatting_functions: [],
      country_code: "IN",
    });
    expect(json.user_identifier).toBeNull();
    expect(json.app_variables.customer_name).toEqual({
      column_name: "customer_name",
      required: false,
      formatting_functions: [],
    });
    expect(json.app_variables.account_number).toEqual({
      column_name: "account_number",
      required: false,
      formatting_functions: [],
    });
    expect(json.app_variables.city).toEqual({
      column_name: "city",
      required: false,
      formatting_functions: [],
    });
    expect(json.app_variables.unrelated_col).toBeUndefined();
    expect(json.app_overrides).toEqual({});
    expect(json.alternate_phone_numbers).toEqual([]);
  });
});

