import { Queue } from "bullmq";
import { REFRESH_QUEUE_NAME, type RefreshAcceptedResponse, type RefreshEventJob } from "@ticket-hub/contracts";

export interface RefreshQueue {
  enqueue(eventId: string): Promise<RefreshAcceptedResponse>;
  close(): Promise<void>;
}

/** Docker-free adapter for local UI and API development. */
export class InMemoryRefreshQueue implements RefreshQueue {
  private readonly recent = new Map<string, number>();

  async enqueue(eventId: string): Promise<RefreshAcceptedResponse> {
    const now = Date.now();
    const previous = this.recent.get(eventId);
    this.recent.set(eventId, now);
    const refreshId = `${eventId}:${Math.floor(now / 10_000)}`;
    return {
      eventId,
      refreshId,
      state: previous && now - previous < 10_000 ? "already-running" : "queued",
      streamUrl: `/v1/events/${eventId}/stream`,
    };
  }

  async close(): Promise<void> {
    this.recent.clear();
  }
}

export class BullMqRefreshQueue implements RefreshQueue {
  private readonly queue: Queue<RefreshEventJob>;

  constructor(redisUrl: string) {
    const url = new URL(redisUrl);
    this.queue = new Queue<RefreshEventJob>(REFRESH_QUEUE_NAME, {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        db: Number(url.pathname.slice(1) || 0),
        tls: url.protocol === "rediss:" ? {} : undefined,
      },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }

  async enqueue(eventId: string): Promise<RefreshAcceptedResponse> {
    const bucket = Math.floor(Date.now() / 10_000);
    const jobId = `${eventId}:${bucket}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      return { eventId, refreshId: jobId, state: "already-running", streamUrl: `/v1/events/${eventId}/stream` };
    }

    await this.queue.add("refresh-event", { eventId, requestedAt: new Date().toISOString(), reason: "user" }, { jobId });
    return { eventId, refreshId: jobId, state: "queued", streamUrl: `/v1/events/${eventId}/stream` };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
