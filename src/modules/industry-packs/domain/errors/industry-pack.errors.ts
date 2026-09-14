import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class IndustryPackNotFoundError extends AppError {
  constructor(identifier: string) {
    super(HttpStatus.NOT_FOUND, `Industry pack '${identifier}' not found`, "INDUSTRY_PACK_NOT_FOUND");
  }
}

export class DuplicateIndustryPackSlugError extends AppError {
  constructor(slug: string) {
    super(HttpStatus.CONFLICT, `Industry pack with slug '${slug}' already exists`, "DUPLICATE_INDUSTRY_PACK_SLUG");
  }
}

export class DuplicateIndustryPackIndustryError extends AppError {
  constructor(industry: string) {
    super(HttpStatus.CONFLICT, `An industry pack for '${industry}' already exists (one per industry)`, "DUPLICATE_INDUSTRY_PACK_INDUSTRY");
  }
}

export class IndustryPackHasAgentsError extends AppError {
  constructor(count: number) {
    super(HttpStatus.CONFLICT, `Cannot delete pack: ${count} platform agent(s) still assigned`, "INDUSTRY_PACK_HAS_AGENTS");
  }
}

export class PlatformAgentNotFoundError extends AppError {
  constructor(identifier: string) {
    super(HttpStatus.NOT_FOUND, `Platform agent '${identifier}' not found`, "PLATFORM_AGENT_NOT_FOUND");
  }
}