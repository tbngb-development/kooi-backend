import { describe, it, expect } from "vitest";
import { toUserFriendlyError } from "../../../src/modules/batches/domain/rules/batch-error-messages";

describe("Batch Error Messages Rules (Domain Unit)", () => {
  it("translates empty file errors to friendly message", () => {
    expect(toUserFriendlyError("File has no data rows")).toBe(
      "The uploaded file appears to be empty. Please upload a CSV file with lead data.",
    );
    expect(toUserFriendlyError("The buffer was empty")).toBe(
      "The uploaded file appears to be empty. Please upload a CSV file with lead data.",
    );
  });

  it("translates missing Indian phone numbers error", () => {
    expect(
      toUserFriendlyError("No valid Indian phone numbers found in input"),
    ).toBe(
      "No valid Indian phone numbers were found in your file. Please check the phone number format and try again.",
    );
  });

  it("translates all duplicate leads errors", () => {
    expect(
      toUserFriendlyError("All leads in file are duplicate"),
    ).toBe(
      "All leads in your file have already been added to this campaign. Please upload a file with new leads.",
    );

    expect(
      toUserFriendlyError("All leads already exist and no new leads were found"),
    ).toBe(
      "All leads in your file already exist in this campaign. No new leads were added.",
    );
  });

  it("translates plan lead limit errors with dynamic number if present", () => {
    expect(
      toUserFriendlyError("Batch exceeds plan limit of 500 leads"),
    ).toBe(
      "Your file contains more leads than your current plan allows per batch (500 max). Please split your file or upgrade your plan.",
    );

    expect(
      toUserFriendlyError("File exceeds plan limit"),
    ).toBe(
      "Your file contains more leads than your current plan allows per batch (your plan's max). Please split your file or upgrade your plan.",
    );
  });

  it("translates campaign deletion errors during processing", () => {
    expect(
      toUserFriendlyError("Campaign was deleted while file was in flight"),
    ).toBe(
      "This campaign was deleted while your file was being processed. Please create a new campaign and try again.",
    );
  });

  it("translates Bolna / connectivity / timeout / connection refused errors", () => {
    expect(toUserFriendlyError("Bolna API 500")).toBe(
      "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.",
    );
    expect(toUserFriendlyError("Calling service unavailable")).toBe(
      "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.",
    );
    expect(toUserFriendlyError("connect ETIMEDOUT 10.0.0.1")).toBe(
      "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.",
    );
    expect(toUserFriendlyError("connect ECONNREFUSED 127.0.0.1")).toBe(
      "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.",
    );
  });

  it("translates general timeout errors", () => {
    expect(toUserFriendlyError("Network timeout after 30000ms")).toBe(
      "The upload took too long to process. Please try again with a smaller file or contact support.",
    );
  });

  it("translates invalid CSV and parse errors", () => {
    expect(toUserFriendlyError("Invalid CSV format")).toBe(
      "We couldn't read your file. Please make sure it's a valid CSV file with the correct column headers.",
    );
    expect(toUserFriendlyError("Failed to parse headers")).toBe(
      "We couldn't read your file. Please make sure it's a valid CSV file with the correct column headers.",
    );
  });

  it("falls back to friendly generic error for unrecognized technical errors", () => {
    expect(toUserFriendlyError("Null pointer dereference in module X")).toBe(
      "Something went wrong while processing your file. Please try again. If the issue persists, contact our support team.",
    );
  });
});
