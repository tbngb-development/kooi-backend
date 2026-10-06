import type { Logger } from "../../../../shared/logging/logger.interface";
import type { AgentCloneWorker } from "./agent-clone.worker";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import { AGENT_CLONE_QUEUE_NAME } from "../../application/use-cases/switch-tenant-workspace.use-case";

export class AgentCloneScheduler {
  constructor(
    private readonly worker: AgentCloneWorker,
    private readonly logger?: Logger,
  ) {
    this.logger = logger?.child({ component: "AgentCloneScheduler" });
  }

  start(): void {
    const queue = getQueue(AGENT_CLONE_QUEUE_NAME);

    queue.process("clone-agents", 1, async (job) => {
      await this.worker.process(job);
    });

    queue.on("completed", (job) => {
      this.logger?.info("Agent clone job completed", {
        action: "agent_clone.queue.completed",
        jobId: String(job.id),
        tenantId: job.data.tenantId,
      });
    });

    queue.on("failed", (job, err) => {
      this.logger?.error(
        `Agent clone job failed: ${job?.id}: ${err.message}`,
        err,
        {
          action: "agent_clone.queue.failed",
          jobId: job?.id ? String(job.id) : undefined,
          tenantId: job?.data?.tenantId,
        },
      );
    });

    queue.on("stalled", (jobId) => {
      this.logger?.warn("Agent clone job stalled", {
        action: "agent_clone.queue.stalled",
        jobId: String(jobId),
      });
    });

    this.logger?.info("Agent clone scheduler started", {
      action: "agent_clone.scheduler.start",
      concurrency: 1,
    });
  }

  async stop(): Promise<void> {
    const queue = getQueue(AGENT_CLONE_QUEUE_NAME);
    await queue.close();
  }
}
