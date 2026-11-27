import Queue from "bull";
import Redis from "ioredis";
import { env } from "../../env";

type RedisRole = "client" | "subscriber" | "bclient";

const queues = new Map<string, Queue.Queue>();
const blockingClients = new Set<Redis>();
let sharedClient: Redis | null = null;
let sharedSubscriber: Redis | null = null;

function buildRedisConnection(role: RedisRole): Redis {
  const client = new Redis(env.redis.url, {
    enableReadyCheck: false, // Required by Bull
    // Only blocking/subscriber connections may wait indefinitely for Redis.
    // The command client must fail queued requests during an outage.
    ...(role === "client" ? {} : { maxRetriesPerRequest: null }),
  });

  client.on("error", (err) => {
    console.error(`[QueueRedis:${role}] error:`, err.message);
  });

  if (role === "bclient") blockingClients.add(client);

  return client;
}

/**
 * Shares a single `client` and `subscriber` connection across all Bull queues
 * to stay well below Redis `maxclients` limits. Only `bclient` (blocking
 * worker connections) are created per queue.
 */
function createBullRedisClient(
  type: RedisRole,
): ReturnType<NonNullable<Queue.QueueOptions["createClient"]>> {
  switch (type) {
    case "client":
      sharedClient ??= buildRedisConnection("client");
      return sharedClient as unknown as ReturnType<
        NonNullable<Queue.QueueOptions["createClient"]>
      >;
    case "subscriber":
      sharedSubscriber ??= buildRedisConnection("subscriber");
      return sharedSubscriber as unknown as ReturnType<
        NonNullable<Queue.QueueOptions["createClient"]>
      >;
    case "bclient":
    default:
      return buildRedisConnection("bclient") as unknown as ReturnType<
        NonNullable<Queue.QueueOptions["createClient"]>
      >;
  }
}

/**
 * Returns a singleton Bull queue instance for the given name.
 * Shares `client` and `subscriber` Redis connections across queues.
 */
export function getQueue(name: string): Queue.Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    prefix: env.redis.prefix,
    createClient: createBullRedisClient,
    settings: {
      backoffStrategies: {
        sarvamBackoff(attemptsMade: number) {
          const delays = [30_000, 60_000, 120_000, 240_000];
          return delays[Math.min(attemptsMade - 1, delays.length - 1)] ?? 240_000;
        },
      },
    },
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
 * Gracefully closes all queue connections and shared Bull Redis clients.
 */
export async function closeAllQueues(): Promise<void> {
  // Close queues concurrently: a long-running job in one queue must not
  // prevent the remaining queues from being closed.
  const results = await Promise.allSettled(
    [...queues].map(async ([name, queue]) => {
      await queue.close();
      console.log(`[Queue:${name}] Closed`);
    }),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Queue] Failed to close:", result.reason);
    }
  }
  queues.clear();

  // Bull force-disconnects but reconnects each blocking client on close; with
  // a custom createClient it never disconnects them permanently.
  for (const client of blockingClients) {
    if (client.status !== "end") client.disconnect();
  }
  blockingClients.clear();

  for (const [label, client] of [
    ["client", sharedClient],
    ["subscriber", sharedSubscriber],
  ] as const) {
    if (client && client.status !== "end") {
      await client.quit().catch(() => client.disconnect());
      console.log(`[QueueRedis:${label}] Closed`);
    }
  }
  sharedClient = null;
  sharedSubscriber = null;
}
