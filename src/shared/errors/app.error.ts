export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly cause?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    isOperational = true,
    cause?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
