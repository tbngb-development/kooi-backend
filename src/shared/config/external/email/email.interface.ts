export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface IEmailService {
  send(input: SendEmailInput): Promise<void>;
}
