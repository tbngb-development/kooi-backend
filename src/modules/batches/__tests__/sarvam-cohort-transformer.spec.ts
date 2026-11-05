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

  it("requires only contact number in leads and falls back to empty string when variables are not in CSV", () => {
    const leads: LeadRow[] = [
      {
        phone: "9876543210",
      },
    ];

    const result = transformer.transform(leads, dummyVariables, {}, {});

    // CSV requires only phone number; missingRequiredVariables is always empty
    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.totalLeads).toBe(1);
    expect(result.matchedVariables).toEqual(["customer_name", "account_number", "city"]);

    const csvString = result.transformedCsvBuffer.toString("utf-8");
    // Verify city gets default value "Mumbai", and others get ""
    expect(csvString).toContain("+919876543210,,,Mumbai");
  });

  it("injects campaign variables into cohort CSV when supplied from campaign creation", () => {
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

    const csvString = result.transformedCsvBuffer.toString("utf-8");
    expect(csvString).toContain("+919876543210,Aarav Sharma,ACC-999,Mumbai");
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

    expect(result.matchedVariables).toContain("customer_name");
    expect(result.matchedVariables).toContain("account_number");
    expect(result.matchedVariables).toContain("city");

    // CSV structure check
    const csvString = result.transformedCsvBuffer.toString("utf-8");
    const lines = csvString.trim().split("\n");
    expect(lines).toHaveLength(3); // header + 2 valid rows

    // Header check
    expect(lines[0]).toBe("contact_number,customer_name,account_number,city");

    // Row 1 check
    expect(lines[1]).toBe("+919876543210,Priya Patel,ACC-12345,Mumbai");

    // Row 2 check (custom city override in lead)
    expect(lines[2]).toBe("+919123456789,Rahul Roy,ACC-67890,Delhi");

    // Transformation JSON check
    expect(result.transformationJson).toEqual({
      phone_number: {
        column_name: "contact_number",
        required: true,
        formatting_functions: [],
        country_code: "IN",
      },
      user_identifier: null,
      app_variables: {
        customer_name: {
          column_name: "customer_name",
          required: false,
          formatting_functions: [],
        },
        account_number: {
          column_name: "account_number",
          required: false,
          formatting_functions: [],
        },
        city: {
          column_name: "city",
          required: false,
          formatting_functions: [],
        },
      },
      app_overrides: {},
      alternate_phone_numbers: [],
    });
  });
});
