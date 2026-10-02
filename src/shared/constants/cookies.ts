export const COOKIE_ACCESS_TOKEN = "access_token";
export const COOKIE_REFRESH_TOKEN = "refresh_token";

export type SameSiteValue = "none" | "lax" | "strict";

export function getCookieSameSite(isProduction: boolean): SameSiteValue {
  return isProduction ? "none" : "lax";
}
