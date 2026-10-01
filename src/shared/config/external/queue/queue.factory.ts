import Queue from "bull";
import { env } from "../../env";

const queues = new Map<string, Queue.Queue>();

/**
 * Returns a singleton Bull queue instance for the given name.
 * Uses the configured Redis URL and lets Bull manage its internal connections.
 */
export function getQueue(name: string): Queue.Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, env.redis.url, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
      timeout: 300_000, // 5 min hard timeout
    },
  });

  queue.on("error", (err) => {
    console.error(`[Queue:${name}] Redis error:`, err.message);
  });

  queues.set(name, queue);
  return queue;
}

/**
 * Gracefully closes all queue connections.
 */
export async function closeAllQueues(): Promise<void> {
  for (const [name, queue] of queues) {
    await queue.close();
    console.log(`[Queue:${name}] Closed`);
  }
  queues.clear();
}
