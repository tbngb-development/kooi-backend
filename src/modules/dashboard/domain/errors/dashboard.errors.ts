import { ValidationError } from "../../../../shared/errors/validation.error";

export class InvalidDateRangeError extends ValidationError {
  constructor(message = "Invalid date range: dateFrom must be before dateTo") {
    super([
      {
        field: "dateRange",
        message,
      },
    ]);
    this.name = "InvalidDateRangeError";
  }
}

export class MaxDateRangeExceededError extends ValidationError {
  constructor() {
    super([
      {
        field: "dateRange",
        message: "Date range cannot exceed 12 months",
      },
    ]);
    this.name = "MaxDateRangeExceededError";
  }
}

export class InvalidGranularityError extends ValidationError {
  constructor() {
    super([
      {
        field: "granularity",
        message: "Granularity must be one of: daily, weekly, or monthly",
      },
    ]);
    this.name = "InvalidGranularityError";
  }
}
