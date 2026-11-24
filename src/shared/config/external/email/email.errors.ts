/** Provider error with the Resend error-code name preserved for classification. */
export class EmailProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}
