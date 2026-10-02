import { AuthMessages } from "../../../../shared/constants/messages";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_NUMBER = /[0-9]/;

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordStrength(
  password: string,
): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(AuthMessages.PASSWORD_TOO_SHORT);
  }

  if (password.length > MAX_LENGTH) {
    errors.push(AuthMessages.PASSWORD_TOO_LONG);
  }

  if (
    password.length >= MIN_LENGTH &&
    (!HAS_UPPER.test(password) ||
      !HAS_LOWER.test(password) ||
      !HAS_NUMBER.test(password))
  ) {
    errors.push(AuthMessages.PASSWORD_WEAK);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}