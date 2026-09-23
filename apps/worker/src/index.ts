import { REFRESH_QUEUE_NAME, type Marketplace, type RefreshEventJob } from "@ticket-hub/contracts";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { StubConnector } from "./connectors/stub-connector.js";
import { RedisSnapshotPublisher } from "./services/redis-snapshot-publisher.js";
import { RefreshCoordinator } from "./services/refresh-coordinator.js";

const config = loadConfig();
const marketplaces: Marketplace[] = ["ticketmaster", "seatgeek", "stubhub", "tickpick", "gametime", "vivid-seats"];
const connectors = marketplaces.map((marketplace) => new StubConnector(marketplace));
const publisher = new RedisSnapshotPublisher(config.redisUrl);
const logger = {
  info: (fields: Record<string, unknown>, message: string) => console.info(JSON.stringify({ level: "info", message, ...fields })),
  error: (fields: Record<string, unknown>, message: string) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};
const coordinator = new RefreshCoordinator(connectors, publisher, config.refreshDeadlineMs, logger);
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<RefreshEventJob>(
  REFRESH_QUEUE_NAME,
  async (job) => coordinator.refresh(job.data.eventId),
  { connection, concurrency: config.concurrency },
);

worker.on("completed", (job) => logger.info({ jobId: job.id, eventId: job.data.eventId }, "job completed"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, eventId: job?.data.eventId, error: error.message }, "job failed"));

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await worker.close();
  await connection.quit();
  await publisher.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
