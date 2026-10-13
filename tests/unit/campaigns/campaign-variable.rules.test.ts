import { describe, it, expect } from "vitest";
import { validateAndCleanVariables } from "../../../src/modules/campaigns/domain/rules/campaign-variable.rules";
import type { RequiredVariable } from "../../../src/shared/types/bolna.types";

describe("Campaign Variable Validation Domain Rules (Module 7)", () => {
  it("returns input as-is when required variables definition is empty or null", () => {
    const input = { custom_field: "value123" };
    expect(validateAndCleanVariables([], input)).toEqual({
      cleaned: { custom_field: "value123" },
      missing: [],
    });

    expect(validateAndCleanVariables(null, input)).toEqual({
      cleaned: { custom_field: "value123" },
      missing: [],
    });
  });

  it("strips non-editable variables from user input (isEditable: false)", () => {
    const definitions: RequiredVariable[] = [
      {
        name: "company_tag",
        label: "Company Tag",
        required: true,
        isEditable: false, // system configured
      },
      {
        name: "project_name",
        label: "Project Name",
        required: true,
        isEditable: true,
      },
    ];

    const input = {
      company_tag: "HACKED_VALUE",
      project_name: "Green Valley",
    };

    const result = validateAndCleanVariables(definitions, input);

    expect(result.cleaned).toEqual({ project_name: "Green Valley" });
    expect(result.missing).toEqual([]);
    expect(result.cleaned.company_tag).toBeUndefined();
  });

  it("flags missing required editable variables when omitted from input", () => {
    const definitions: RequiredVariable[] = [
      {
        name: "first_name",
        label: "First Name",
        required: true,
        isEditable: true,
      },
      {
        name: "budget",
        label: "Budget",
        required: true,
        isEditable: true,
      },
    ];

    const input = { first_name: "Alice" };

    const result = validateAndCleanVariables(definitions, input);

    expect(result.missing).toEqual(["budget"]);
    expect(result.cleaned).toEqual({ first_name: "Alice" });
  });

  it("flags empty strings as missing for required editable variables without defaults", () => {
    const definitions: RequiredVariable[] = [
      {
        name: "location",
        label: "Location",
        required: true,
        isEditable: true,
      },
    ];

    const result = validateAndCleanVariables(definitions, { location: "   " });

    expect(result.missing).toEqual(["location"]);
  });

  it("automatically applies defaultValue when a required editable variable is missing or empty", () => {
    const definitions: RequiredVariable[] = [
      {
        name: "discount_percent",
        label: "Discount Percent",
        required: true,
        isEditable: true,
        defaultValue: "10%",
      },
      {
        name: "currency_unit",
        label: "Currency Unit",
        required: true,
        isEditable: true,
        defaultValue: "INR",
      },
    ];

    const input = { currency_unit: "   " }; // empty string

    const result = validateAndCleanVariables(definitions, input);

    expect(result.missing).toEqual([]);
    expect(result.cleaned).toEqual({
      discount_percent: "10%",
      currency_unit: "INR",
    });
  });

  it("preserves optional variables (required: false) if provided", () => {
    const definitions: RequiredVariable[] = [
      {
        name: "notes",
        label: "Notes",
        required: false,
        isEditable: true,
      },
    ];

    const result = validateAndCleanVariables(definitions, { notes: "Call after 5 PM" });

    expect(result.missing).toEqual([]);
    expect(result.cleaned).toEqual({ notes: "Call after 5 PM" });
  });
});
