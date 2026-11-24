import { describe, it, expect } from "vitest";
import { buildTeamInviteEmail } from "../infrastructure/mail/team-invite.template";

const EXPIRES = new Date("2026-01-17T00:00:00.000Z");

describe("buildTeamInviteEmail", () => {
  const input = {
    inviteUrl: "https://app.example.com/accept-invite?token=tok_123",
    tenantName: "Acme <Corp>",
    inviterName: "Bob & Alice",
    role: "USER" as const,
    expiresAt: EXPIRES,
  };

  it("builds a subject that names the workspace", () => {
    const email = buildTeamInviteEmail(input);

    expect(email.subject).toContain("Acme <Corp>");
    expect(email.subject.toLowerCase()).toContain("invit");
  });

  it("puts the working accept link in the html, text and acceptUrl", () => {
    const email = buildTeamInviteEmail(input);

    expect(email.acceptUrl).toBe(input.inviteUrl);
    expect(email.html).toContain(input.inviteUrl);
    expect(email.text).toContain(input.inviteUrl);
  });

  it("escapes HTML in caller-derived names", () => {
    const email = buildTeamInviteEmail(input);

    expect(email.html).not.toContain("Acme <Corp>");
    expect(email.html).toContain("Acme &lt;Corp&gt;");
    expect(email.html).toContain("Bob &amp; Alice");
  });

  it("mentions the role and the expiry in the plain-text body", () => {
    const email = buildTeamInviteEmail(input);

    expect(email.text).toContain("USER");
    expect(email.text.toLowerCase()).toContain("expire");
  });
});
