export interface ContactEmailPayload {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface IContactEmailService {
  /**
   * Dispatches contact submission notification email.
   * Must throw an error if delivery fails or if credentials are missing.
   */
  send(payload: ContactEmailPayload): Promise<{ success: boolean; id?: string }>;
}
