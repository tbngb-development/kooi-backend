/**
 * Derives a URL-safe slug from a human-readable name.
 *
 * Rules:
 *  - Lowercase
 *  - Replace non-alphanumeric characters with hyphens
 *  - Collapse consecutive hyphens
 *  - Trim leading/trailing hyphens
 *  - Fallback to "item-<timestamp>" if result is empty
 */
export function generateSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    return `item-${Date.now()}`;
  }

  return slug;
}
