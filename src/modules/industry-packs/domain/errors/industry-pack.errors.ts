import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class IndustryPackNotFoundError extends AppError {
  constructor(identifier: string) {
    super(
      HttpStatus.NOT_FOUND,
      `Industry pack '${identifier}' not found`,
      "INDUSTRY_PACK_NOT_FOUND",
    );
  }
}

export class DuplicateIndustryPackSlugError extends AppError {
  constructor(slug: string) {
    super(
      HttpStatus.CONFLICT,
      `Industry pack with slug '${slug}' already exists`,
      "DUPLICATE_INDUSTRY_PACK_SLUG",
    );
  }
}

export class DuplicateIndustryPackNameError extends AppError {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      `Industry pack with name '${name}' already exists (case-insensitive)`,
      "DUPLICATE_INDUSTRY_PACK_NAME",
    );
  }
}

export class IndustryPackHasAgentsError extends AppError {
  constructor(count: number) {
    super(
      HttpStatus.CONFLICT,
      `Cannot delete industry pack because it has ${count} assigned platform agent(s). Reassign or remove them first.`,
      "INDUSTRY_PACK_HAS_AGENTS",
    );
  }
}
