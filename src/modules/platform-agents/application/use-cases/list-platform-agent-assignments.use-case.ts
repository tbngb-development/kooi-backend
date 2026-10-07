import prisma from "../../../../shared/config/database/prisma";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export interface PlatformAgentAssignmentSummary {
  assistantId: string;
  assistantName: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  assignedAt: Date;
}

export interface PlatformAgentAssignmentsResult {
  platformAgent: {
    id: string;
    name: string;
    slug: string;
    bolnaId: string;
  };
  totalAssignments: number;
  assignments: PlatformAgentAssignmentSummary[];
}

export class ListPlatformAgentAssignmentsUseCase {
  async execute(
    platformAgentId: string,
  ): Promise<PlatformAgentAssignmentsResult> {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: platformAgentId },
      select: {
        id: true,
        name: true,
        slug: true,
        bolnaId: true,
      },
    });

    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // Exclude soft-deleted assistants
    const assistants = await prisma.assistant.findMany({
      where: {
        platformAgentId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const assignments: PlatformAgentAssignmentSummary[] = assistants.map(
      (a) => ({
        assistantId: a.id,
        assistantName: a.name,
        tenantId: a.tenantId,
        tenantName: a.tenant.name,
        tenantEmail: a.tenant.email,
        assignedAt: a.createdAt,
      }),
    );

    return {
      platformAgent: agent,
      totalAssignments: assignments.length,
      assignments,
    };
  }
}
