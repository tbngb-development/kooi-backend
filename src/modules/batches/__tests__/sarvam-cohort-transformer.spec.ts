import { describe, it, expect } from "vitest";
import { SarvamCohortTransformer } from "../infrastructure/sarvam-cohort-transformer";
import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
} from "../../sarvam-agents/domain/types/sarvam-agent.types";
import type { LeadRow } from "../../leads/infrastructure/leadParser";

describe("SarvamCohortTransformer", () => {
  const transformer = new SarvamCohortTransformer();

  const dummyVariables: SarvamAgentVariable[] = [
    {
      key: "customer_name",
      defaultValue: "",
      required: false,
      isTenantVisible: true,
      isTenantEditable: true,
    },
    {
      key: "account_number",
      defaultValue: "",
      required: false,
      isTenantVisible: true,
      isTenantEditable: true,
    },
    {
      key: "city",
      defaultValue: "Mumbai",
      required: false,
      isTenantVisible: true,
      isTenantEditable: true,
    },
  ];

  it("requires only contact number in leads and falls back to empty string when variables are not in CSV", () => {
    const leads: LeadRow[] = [
      {
        name: "",
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

  it("enforces 3-tier precedence: Contact CSV > Campaign-level > Tenant Override > Platform Default", () => {
    const agentVars: SarvamAgentVariable[] = [
      {
        key: "city",
        defaultValue: "Default Mumbai",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "tier",
        defaultValue: "Standard",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "company",
        defaultValue: "Default Corp",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    const tenantOverrides = {
      city: "Tenant Delhi",
      tier: "Tenant Premium",
      company: "Tenant Corp",
    };

    const campaignVariables = {
      tier: "Campaign Gold", // Overrides tenant override
      company: "Campaign Corp",
    };

    const leads: LeadRow[] = [
      {
        name: "Test User",
        phone: "9876543210",
        company: "CSV SuperCorp", // Overrides campaign, tenant, and default
      },
    ];

    const result = transformer.transform(
      leads,
      agentVars,
      tenantOverrides,
      campaignVariables,
    );

    const csvString = result.transformedCsvBuffer.toString("utf-8");
    // city should be "Tenant Delhi" (no CSV, no campaign)
    // tier should be "Campaign Gold" (no CSV, campaign overrides tenant)
    // company should be "CSV SuperCorp" (CSV overrides all)
    expect(csvString).toContain("+919876543210,Tenant Delhi,Campaign Gold,CSV SuperCorp");
  });

  it("detects missing required variables when a required variable has no value for a contact", () => {
    const agentVars: SarvamAgentVariable[] = [
      {
        key: "mandatory_code",
        defaultValue: "",
        required: true,
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    const leads: LeadRow[] = [
      {
        name: "User Without Code",
        phone: "9876543210",
      },
    ];

    const result = transformer.transform(leads, agentVars, {}, {});
    expect(result.missingRequiredVariables).toContain("mandatory_code");
  });

  it("interpolates dynamic welcome message when all template variables are present", () => {
    const agentVars: SarvamAgentVariable[] = [
      {
        key: "customer_name",
        defaultValue: "",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "company_name",
        defaultValue: "Acme",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    const welcomeConfig: WelcomeMessageConfig = {
      defaultMessage: "Hello, welcome to Acme.",
      customTemplate: "Hi {{customer_name}}, calling on behalf of {{company_name}}.",
      interpolationVariables: ["customer_name", "company_name"],
    };

    const leads: LeadRow[] = [
      {
        name: "Rohan",
        phone: "9876543210",
        customer_name: "Rohan",
      },
    ];

    const result = transformer.transform(
      leads,
      agentVars,
      {},
      { company_name: "Acme Realty" },
      welcomeConfig,
    );

    const csvString = result.transformedCsvBuffer.toString("utf-8");
    const lines = csvString.trim().split("\n");
    expect(lines[0]).toBe("contact_number,customer_name,company_name,welcome_message");
    expect(lines[1]).toBe(
      '+919876543210,Rohan,Acme Realty,"Hi Rohan, calling on behalf of Acme Realty."',
    );
    expect(result.transformationJson.app_variables.welcome_message).toBeUndefined();
    expect(result.transformationJson.app_overrides).toEqual({
      initial_bot_message: { column_name: "welcome_message" },
    });
  });

  it("maps welcome_message to app_variables when welcome_message is an explicit agent variable", () => {
    const agentVars: SarvamAgentVariable[] = [
      {
        key: "customer_name",
        defaultValue: "",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "welcome_message",
        defaultValue: "Hello default",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    const welcomeConfig: WelcomeMessageConfig = {
      defaultMessage: "Hello, welcome to Acme.",
      customTemplate: "Hi {{customer_name}}, welcome!",
      interpolationVariables: ["customer_name"],
    };

    const leads: LeadRow[] = [
      {
        name: "Rohan",
        phone: "9876543210",
        customer_name: "Rohan",
      },
    ];

    const result = transformer.transform(
      leads,
      agentVars,
      {},
      {},
      welcomeConfig,
    );

    expect(result.transformationJson.app_variables.welcome_message).toBeDefined();
    expect(result.transformationJson.app_variables.welcome_message.column_name).toBe("welcome_message");
    expect(result.transformationJson.app_overrides).toEqual({});
  });

  it("falls back to defaultMessage when any template variable is missing for a contact", () => {
    const agentVars: SarvamAgentVariable[] = [
      {
        key: "customer_name",
        defaultValue: "",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "loan_amount",
        defaultValue: "",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ];

    const welcomeConfig: WelcomeMessageConfig = {
      defaultMessage: "Hello, calling regarding your loan application.",
      customTemplate: "Hello {{customer_name}}, your loan of {{loan_amount}} is approved.",
      interpolationVariables: ["customer_name", "loan_amount"],
    };

    const leads: LeadRow[] = [
      {
        name: "Anita",
        phone: "9876543210",
        customer_name: "Anita",
        // loan_amount missing!
      },
      {
        name: "Suresh",
        phone: "9876543211",
        customer_name: "Suresh",
        loan_amount: "5 Lakhs",
      },
    ];

    const result = transformer.transform(
      leads,
      agentVars,
      {},
      {},
      welcomeConfig,
    );

    const csvString = result.transformedCsvBuffer.toString("utf-8");
    const lines = csvString.trim().split("\n");

    // Contact 1: falls back to defaultMessage
    expect(lines[1]).toContain('"Hello, calling regarding your loan application."');
    // Contact 2: interpolates template successfully
    expect(lines[2]).toContain('"Hello Suresh, your loan of 5 Lakhs is approved."');
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
