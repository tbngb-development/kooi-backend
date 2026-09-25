import rateLimit from "express-rate-limit";

// 1. Login Rate Limiter (Max 10 attempts per 15 minutes)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "TOO_MANY_REQUESTS",
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

// 2. Strict Platform Admin Login Limiter (Max 5 attempts per 15 minutes)
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "TOO_MANY_REQUESTS",
    message: "Admin login blocked. Too many attempts. Try again in 15 minutes.",
  },
});

// 3. OTP Spam Prevention (Max 3 OTP requests per 10 minutes)
export const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "TOO_MANY_REQUESTS",
    message:
      "Too many code requests. Please wait 10 minutes before trying again.",
  },
});

// 4. OTP Generation Cooldown (Max 1 request per 60 seconds)
// This directly solves "No OTP generation cooldown"
export const otpCooldownLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max: 1,
  standardHeaders: false,
  legacyHeaders: false,
  message: {
    success: false,
    code: "TOO_MANY_REQUESTS",
    message: "Please wait 60 seconds before requesting another code.",
  },
});

// 5. Registration Rate Limiter (Max 5 registrations per hour)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "TOO_MANY_REQUESTS",
    message: "Registration limit reached for this network. Try again later.",
  },
});
