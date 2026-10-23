// modules/calls/application/dto/initiate-outbound-call.dto.ts

export interface InitiateOutboundCallInput {
  tenantId: string;
  assistantId: string;
  phoneNumber: string;
  name?: string;
}

export interface InitiateOutboundCallOutput {
  callId: string;
  status: string;
}
