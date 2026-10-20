export type TelephonyProviderType =
  | "BOLNA"
  | "TWILIO"
  | "PLIVO"
  | "EXOTEL"
  | "VONAGE"
  | "OTHER";

export type PhoneStatusType = "ACTIVE" | "INACTIVE" | "RELEASED";

export type PhoneCapabilityType = "INBOUND" | "OUTBOUND" | "BOTH";

export interface PhoneNumberProps {
  id: string;
  phoneNumber: string;
  friendlyName?: string | null;
  provider: TelephonyProviderType;
  status: PhoneStatusType;
  capabilities: PhoneCapabilityType;
  tenantId?: string | null;
  assistantId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PhoneNumberEntity {
  constructor(public readonly props: PhoneNumberProps) {}

  get id(): string {
    return this.props.id;
  }

  get phoneNumber(): string {
    return this.props.phoneNumber;
  }

  get friendlyName(): string | null | undefined {
    return this.props.friendlyName;
  }

  get provider(): TelephonyProviderType {
    return this.props.provider;
  }

  get status(): PhoneStatusType {
    return this.props.status;
  }

  get capabilities(): PhoneCapabilityType {
    return this.props.capabilities;
  }

  get tenantId(): string | null | undefined {
    return this.props.tenantId;
  }

  get assistantId(): string | null | undefined {
    return this.props.assistantId;
  }

  get isAssigned(): boolean {
    return Boolean(this.props.tenantId);
  }

  get isActive(): boolean {
    return this.props.status === "ACTIVE";
  }

  get supportsInbound(): boolean {
    return (
      this.props.capabilities === "INBOUND" ||
      this.props.capabilities === "BOTH"
    );
  }

  get supportsOutbound(): boolean {
    return (
      this.props.capabilities === "OUTBOUND" ||
      this.props.capabilities === "BOTH"
    );
  }

  toJSON() {
    return { ...this.props };
  }
}
