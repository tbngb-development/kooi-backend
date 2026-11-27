import Redis from "ioredis";
import { env } from "../env";

class RedisClient {
  private static instance: Redis | null = null;

  static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(env.redis.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });

      RedisClient.instance.on("connect", () => {
        console.log("[Redis] connected");
      });

      RedisClient.instance.on("error", (err) => {
        console.error("[Redis] error:", err.message);
      });
    }

    return RedisClient.instance;
  }

  static async disconnect(): Promise<void> {
    const instance = RedisClient.instance;
    if (!instance) return;

    // Clear the cached client even if the graceful quit fails, so a retry
    // never reuses a dead connection.
    RedisClient.instance = null;
    try {
      await instance.quit();
    } catch {
      instance.disconnect();
    }
  }
}

export const disconnectRedis = (): Promise<void> =>
  RedisClient.disconnect();

export default RedisClient.getInstance();
