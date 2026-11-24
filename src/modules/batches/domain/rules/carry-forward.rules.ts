export interface CarryForwardLeadCandidate {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  calls?: Array<{ status: string; createdAt: Date }>;
}

export interface CarryForwardLeadRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  metadata: Record<string, unknown> | null;
}

const UNDIALED_STATUSES = new Set(["PENDING", "STOPPED"]);

/**
 * D3: carry forward un-dialed leads and retries that were due inside the
 * expired window. Terminal results are never carried forward, and CALLING
 * leads are left alone so in-flight calls may finish (D2).
 */
export function selectCarryForwardLeads(
  candidates: CarryForwardLeadCandidate[],
  windowEndAt: Date,
): CarryForwardLeadRow[] {
  const deadline = windowEndAt.getTime();

  return candidates
    .filter((lead) => {
      if (UNDIALED_STATUSES.has(lead.status)) return true;
      if (lead.status === "CALLING") return false;

      return (lead.calls ?? []).some(
        (call) =>
          call.status === "SCHEDULED" &&
          call.createdAt.getTime() <= deadline,
      );
    })
    .map(({ id, name, phone, email, company, metadata }) => ({
      id,
      name,
      phone,
      email,
      company,
      metadata,
    }));
}
