import { describe, it, expect } from "vitest";
import { SarvamCohortTransformer } from "../infrastructure/sarvam-cohort-transformer";
import type { SarvamAgentVariable } from "../../sarvam-agents/domain/types/sarvam-agent.types";
import type { LeadRow } from "../../leads/infrastructure/leadParser";
import { transformToBolnaCSV } from "../infrastructure/csv-transformer";
import { deduplicateInFileLeads } from "../../leads/domain/rules/lead-dedup.rules";

describe("Phase 7 Regression Suite: Sarvam Cohort Variable Validation & Merging", () => {
  const transformer = new SarvamCohortTransformer();

  // Standard Agent variable fixtures
  const requiredProjectName: SarvamAgentVariable = {
    key: "project_name",
    defaultValue: "",
    required: true,
    isTenantVisible: true,
    isTenantEditable: true,
  };

  const requiredBuilderName: SarvamAgentVariable = {
    key: "builder_name",
    defaultValue: "",
    required: true,
    isTenantVisible: true,
    isTenantEditable: true,
  };

  const optionalTheme: SarvamAgentVariable = {
    key: "campaign_theme",
    defaultValue: "",
    required: false,
    isTenantVisible: true,
    isTenantEditable: true,
  };

  const optionalCity: SarvamAgentVariable = {
    key: "city",
    defaultValue: "Bengaluru",
    required: false,
    isTenantVisible: true,
    isTenantEditable: true,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Required variables (Tests 1 - 7)
  // ──────────────────────────────────────────────────────────────────────────

  it("1. Required variable supplied at Campaign creation and absent from CSV: upload succeeds", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe" }, // absent from CSV
    ];
    const campaignVars = { project_name: "Green Valley" };

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.missingRequiredDetails).toHaveLength(0);
    expect(result.totalLeads).toBe(1);

    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Green Valley");
  });

  it("2. Required variable absent from Campaign but supplied by CSV: upload succeeds", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", project_name: "Ocean Heights" },
    ];
    const campaignVars = {}; // absent from campaign

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.totalLeads).toBe(1);

    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Ocean Heights");
  });

  it("3. Required variable supplied by both: CSV value takes precedence", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", project_name: "Ocean Heights" },
    ];
    const campaignVars = { project_name: "Green Valley" };

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Ocean Heights");
    expect(csvContent).not.toContain("Green Valley");
  });

  it("4. Required variable absent from both: upload fails with missingRequiredVariables", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe" }, // absent from CSV
    ];
    const campaignVars = {}; // absent from campaign

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toEqual(["project_name"]);
    expect(result.missingRequiredDetails).toEqual([
      { variable: "project_name", contactPhone: "+919876543210", rowIndex: 1 },
    ]);
  });

  it("5. Required variable blank in CSV but valid in Campaign: Campaign value is used", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", project_name: "   " }, // whitespace/blank
    ];
    const campaignVars = { project_name: "Green Valley" };

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Green Valley");
  });

  it("6. Multiple required variables supplied through different sources: upload succeeds", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", project_name: "Ocean Heights" }, // project_name from CSV
    ];
    const campaignVars = { builder_name: "ABC Builders" }; // builder_name from Campaign

    const result = transformer.transform(
      leads,
      [requiredProjectName, requiredBuilderName],
      {},
      campaignVars,
    );

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Ocean Heights,ABC Builders");
  });

  it("7. Required variable missing for one contact: reports the affected contact and variable", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", project_name: "Ocean Heights" }, // present
      { phone: "9876543211", name: "Jane Smith" }, // missing
    ];
    const campaignVars = {};

    const result = transformer.transform(leads, [requiredProjectName], {}, campaignVars);

    expect(result.missingRequiredVariables).toEqual(["project_name"]);
    expect(result.missingRequiredDetails).toHaveLength(1);
    expect(result.missingRequiredDetails[0]).toEqual({
      variable: "project_name",
      contactPhone: "+919876543211",
      rowIndex: 2,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Optional variables (Tests 8 - 13)
  // ──────────────────────────────────────────────────────────────────────────

  it("8. Optional variable absent from Campaign and CSV: upload succeeds without warning", () => {
    const leads: LeadRow[] = [{ phone: "9876543210", name: "John Doe" }];
    const result = transformer.transform(leads, [optionalTheme], {}, {});

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.missingRequiredDetails).toHaveLength(0);
    expect(result.totalLeads).toBe(1);

    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,"); // empty value written safely
  });

  it("9. Optional variable supplied only at Campaign level: upload succeeds", () => {
    const leads: LeadRow[] = [{ phone: "9876543210", name: "John Doe" }];
    const campaignVars = { campaign_theme: "Festive Offer" };

    const result = transformer.transform(leads, [optionalTheme], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,Festive Offer");
  });

  it("10. Optional variable supplied only through CSV: upload succeeds", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", campaign_theme: "VIP Early Access" },
    ];
    const result = transformer.transform(leads, [optionalTheme], {}, {});

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,VIP Early Access");
  });

  it("11. Optional variable supplied through both sources: CSV takes precedence", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John Doe", campaign_theme: "VIP Early Access" },
    ];
    const campaignVars = { campaign_theme: "Standard Offer" };

    const result = transformer.transform(leads, [optionalTheme], {}, campaignVars);

    expect(result.missingRequiredVariables).toHaveLength(0);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210,VIP Early Access");
    expect(csvContent).not.toContain("Standard Offer");
  });

  it("12. Multiple optional variables missing: upload still succeeds without warnings", () => {
    const leads: LeadRow[] = [{ phone: "9876543210", name: "John Doe" }];
    const optVar1: SarvamAgentVariable = {
      key: "opt1",
      defaultValue: "",
      required: false,
      isTenantVisible: true,
      isTenantEditable: true,
    };
    const optVar2: SarvamAgentVariable = {
      key: "opt2",
      defaultValue: "",
      required: false,
      isTenantVisible: true,
      isTenantEditable: true,
    };

    const result = transformer.transform(leads, [optVar1, optVar2], {}, {});

    expect(result.missingRequiredVariables).toHaveLength(0);
    expect(result.missingRequiredDetails).toHaveLength(0);
    expect(result.totalLeads).toBe(1);
  });

  it("13. Optional variables are never included in missing-required-variable errors", () => {
    const leads: LeadRow[] = [{ phone: "9876543210", name: "John Doe" }];
    // requiredProjectName is missing, but optionalTheme is also missing
    const result = transformer.transform(
      leads,
      [requiredProjectName, optionalTheme],
      {},
      {},
    );

    expect(result.missingRequiredVariables).toEqual(["project_name"]);
    expect(result.missingRequiredVariables).not.toContain("campaign_theme");
    expect(result.missingRequiredDetails).toHaveLength(1);
    expect(result.missingRequiredDetails[0].variable).toBe("project_name");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // General Integration Behavior (Tests 14 - 20)
  // ──────────────────────────────────────────────────────────────────────────

  it("14. Existing mandatory contact columns are still enforced (non-Indian phones skipped)", () => {
    const leads: LeadRow[] = [
      { phone: "+14155552671", name: "US Lead", project_name: "Green Valley" },
      { phone: "9876543210", name: "Indian Lead", project_name: "Green Valley" },
    ];

    const result = transformer.transform(leads, [requiredProjectName], {}, {});

    expect(result.totalLeads).toBe(1);
    const csvContent = result.transformedCsvBuffer.toString("utf-8");
    expect(csvContent).toContain("+919876543210");
    expect(csvContent).not.toContain("+14155552671");
  });

  it("15. CSV parsing and deduplication remain unchanged", () => {
    const rawLeads: LeadRow[] = [
      { phone: "+919876543210", name: "Lead 1" },
      { phone: "+919876543210", name: "Lead 1 Duplicate" },
      { phone: "+919876543211", name: "Lead 2" },
    ];

    const dedupResult = deduplicateInFileLeads(rawLeads);
    expect(dedupResult.uniqueRows).toHaveLength(2);
    expect(dedupResult.duplicatePhones).toHaveLength(1);
    expect(dedupResult.duplicatePhones[0]).toBe("+919876543210");
  });

  it("16. Multiple contacts receive their correct merged values", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John", project_name: "Ocean Heights" },
      { phone: "9876543211", name: "Jane" }, // uses campaign value
    ];
    const campaignVars = {
      builder_name: "ABC Builders",
      project_name: "Green Valley",
    };

    const result = transformer.transform(
      leads,
      [requiredBuilderName, requiredProjectName],
      {},
      campaignVars,
    );

    const lines = result.transformedCsvBuffer.toString("utf-8").trim().split("\n");
    expect(lines[0]).toBe("contact_number,builder_name,project_name");
    expect(lines[1]).toBe("+919876543210,ABC Builders,Ocean Heights");
    expect(lines[2]).toBe("+919876543211,ABC Builders,Green Valley");
  });

  it("17. Generated Sarvam Cohort data contains the expected final values and schema", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "John", project_name: "Ocean Heights" },
    ];
    const campaignVars = { builder_name: "ABC Builders" };

    const result = transformer.transform(
      leads,
      [requiredBuilderName, requiredProjectName, optionalCity],
      {},
      campaignVars,
    );

    expect(result.transformationJson).toEqual({
      phone_number: {
        column_name: "contact_number",
        required: true,
        formatting_functions: [],
        country_code: "IN",
      },
      user_identifier: null,
      app_variables: {
        builder_name: {
          column_name: "builder_name",
          required: true,
          formatting_functions: [],
        },
        project_name: {
          column_name: "project_name",
          required: true,
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

  it("18. Original uploaded CSV leads array remains unchanged (immutability)", () => {
    const leads: LeadRow[] = [
      { phone: "9876543210", name: "Original Name" },
    ];
    const clonedBefore = JSON.parse(JSON.stringify(leads));

    transformer.transform(leads, [requiredProjectName], {}, { project_name: "Val" });

    expect(leads).toEqual(clonedBefore);
  });

  it("19. Existing Campaign-level values remain isolated by tenant and Campaign", () => {
    const leads: LeadRow[] = [{ phone: "9876543210", name: "John" }];
    const tenant1CampaignVars = { builder_name: "Builder Tenant 1" };
    const tenant2CampaignVars = { builder_name: "Builder Tenant 2" };

    const result1 = transformer.transform(leads, [requiredBuilderName], {}, tenant1CampaignVars);
    const result2 = transformer.transform(leads, [requiredBuilderName], {}, tenant2CampaignVars);

    expect(result1.transformedCsvBuffer.toString("utf-8")).toContain("Builder Tenant 1");
    expect(result2.transformedCsvBuffer.toString("utf-8")).toContain("Builder Tenant 2");
  });

  it("20. Existing Bolna Batch/Campaign behavior remains completely unchanged", () => {
    const leads: LeadRow[] = [
      { phone: "+919876543210", name: "Rohan", custom_field: "123" },
    ];
    const campaignVars = { builder_name: "Godrej Properties" };

    const bolnaResult = transformToBolnaCSV(leads, campaignVars);

    expect(bolnaResult.validCount).toBe(1);
    expect(bolnaResult.filteredOutCount).toBe(0);

    const csvContent = bolnaResult.transformedBuffer.toString("utf-8");
    const lines = csvContent.trim().split("\n");
    // Standard Bolna headers: contact_number, customer_name, welcome_message, custom_field
    expect(lines[0]).toContain("contact_number");
    expect(lines[0]).toContain("customer_name");
    expect(lines[0]).toContain("welcome_message");
    expect(lines[0]).toContain("custom_field");
    expect(lines[1]).toContain('+919876543210,Rohan,"Hi, am I speaking with Rohan?",123,Godrej Properties');
  });
});
