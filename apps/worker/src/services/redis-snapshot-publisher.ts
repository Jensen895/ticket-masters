import type { PriceSnapshot } from "@ticket-hub/contracts";
import { Redis } from "ioredis";
import type { SnapshotPublisher } from "./refresh-coordinator.js";

export class RedisSnapshotPublisher implements SnapshotPublisher {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async publish(snapshot: PriceSnapshot): Promise<void> {
    const key = `event:${snapshot.eventId}:snapshot`;
    const channel = `snapshot:published:${snapshot.eventId}`;
    const payload = JSON.stringify(snapshot);

    // MULTI/EXEC ensures readers see either the previous complete snapshot or this one.
    await this.redis.multi().set(key, payload, "EX", 300).publish(channel, payload).exec();
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
