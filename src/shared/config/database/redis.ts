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
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
      RedisClient.instance = null;
    }
  }
}

export default RedisClient.getInstance();
