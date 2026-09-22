import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import type { ApiConfig } from "./config.js";
import { BullMqRefreshQueue, InMemoryRefreshQueue, type RefreshQueue } from "./queues/refresh-queue.js";
import { EmptyEventRepository, type EventRepository } from "./repositories/event-repository.js";
import { eventRoutes } from "./routes/events.js";

export interface AppDependencies {
  repository?: EventRepository;
  refreshQueue?: RefreshQueue;
}

export async function createApp(config: ApiConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({ logger: true, requestIdHeader: "x-request-id" });
  const repository = dependencies.repository ?? new EmptyEventRepository();
  const refreshQueue = dependencies.refreshQueue
    ?? (config.queueDriver === "redis" ? new BullMqRefreshQueue(config.redisUrl) : new InMemoryRefreshQueue());

  await app.register(cors, { origin: config.webOrigin });
  await app.register(swagger, {
    openapi: {
      info: { title: "ticket-masters API", description: "Canonical events and normalized live ticket prices", version: "0.1.0" },
      tags: [{ name: "events" }, { name: "prices" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok", service: "ticket-masters-api", timestamp: new Date().toISOString() }));
  await app.register(eventRoutes, { prefix: "/v1", repository, refreshQueue });
  app.addHook("onClose", async () => refreshQueue.close());

  return app;
}
