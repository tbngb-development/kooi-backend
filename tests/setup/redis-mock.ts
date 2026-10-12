import RedisMock from "ioredis-mock";

export function createRedisMock() {
  return new RedisMock();
}

export const sharedRedisMock = new RedisMock();
