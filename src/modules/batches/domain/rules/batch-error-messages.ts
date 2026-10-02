/**
 * Maps technical error messages to user-friendly, actionable language.
 * The technical message is still logged for debugging; only the friendly
 * version is stored in `processingError` and shown to the tenant.
 */
export function toUserFriendlyError(technicalError: string): string {
  const lower = technicalError.toLowerCase();

  if (lower.includes("no data rows") || lower.includes("empty")) {
    return "The uploaded file appears to be empty. Please upload a CSV file with lead data.";
  }

  if (lower.includes("no valid indian phone")) {
    return "No valid Indian phone numbers were found in your file. Please check the phone number format and try again.";
  }

  if (lower.includes("all leads") && lower.includes("duplicate")) {
    return "All leads in your file have already been added to this campaign. Please upload a file with new leads.";
  }

  if (lower.includes("already exist") && lower.includes("no new leads")) {
    return "All leads in your file already exist in this campaign. No new leads were added.";
  }

  if (lower.includes("exceeds plan limit")) {
    const match = technicalError.match(/limit of (\d+)/);
    const limit = match ? match[1] : "your plan's";
    return `Your file contains more leads than your current plan allows per batch (${limit} max). Please split your file or upgrade your plan.`;
  }

  if (lower.includes("campaign was deleted")) {
    return "This campaign was deleted while your file was being processed. Please create a new campaign and try again.";
  }

  if (
    lower.includes("bolna") ||
    lower.includes("calling service") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused")
  ) {
    return "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.";
  }

  if (lower.includes("timeout")) {
    return "The upload took too long to process. Please try again with a smaller file or contact support.";
  }

  if (lower.includes("invalid csv") || lower.includes("parse")) {
    return "We couldn't read your file. Please make sure it's a valid CSV file with the correct column headers.";
  }

  // Fallback: generic but friendly
  return "Something went wrong while processing your file. Please try again. If the issue persists, contact our support team.";
}
