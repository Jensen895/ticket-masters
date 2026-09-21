import type { FastifyInstance } from "fastify";
import type { EventRepository } from "../repositories/event-repository.js";
import type { RefreshQueue } from "../queues/refresh-queue.js";

interface EventRoutesOptions {
  repository: EventRepository;
  refreshQueue: RefreshQueue;
}

export async function eventRoutes(app: FastifyInstance, options: EventRoutesOptions) {
  const { repository, refreshQueue } = options;

  app.get<{ Querystring: { q?: string; category?: string; city?: string; limit?: string } }>("/events", {
    schema: {
      tags: ["events"],
      summary: "Search canonical events",
      querystring: {
        type: "object",
        properties: {
          q: { type: "string" },
          category: { type: "string" },
          city: { type: "string" },
          limit: { type: "string" },
        },
      },
    },
  }, async (request) => {
    const limit = Math.min(Math.max(Number(request.query.limit ?? 24), 1), 100);
    const items = await repository.search({ query: request.query.q, category: request.query.category, city: request.query.city, limit });
    return { items, total: items.length };
  });

  app.get<{ Params: { eventIdOrSlug: string } }>("/events/:eventIdOrSlug", {
    schema: { tags: ["events"], summary: "Get an event with its latest price snapshot" },
  }, async (request, reply) => {
    const event = await repository.findByIdOrSlug(request.params.eventIdOrSlug);
    if (!event) return reply.code(404).send({ error: "EVENT_NOT_FOUND", message: "Event not found" });
    return event;
  });

  app.get<{ Params: { eventId: string } }>("/events/:eventId/prices", {
    schema: { tags: ["prices"], summary: "Get the latest atomically published price snapshot" },
  }, async (request, reply) => {
    const snapshot = await repository.getLatestSnapshot(request.params.eventId);
    if (!snapshot) return reply.code(404).send({ error: "SNAPSHOT_NOT_FOUND", message: "No price snapshot is available" });
    reply.header("Cache-Control", "public, max-age=2, stale-while-revalidate=30");
    return snapshot;
  });

  app.post<{ Params: { eventId: string } }>("/events/:eventId/refresh", {
    schema: { tags: ["prices"], summary: "Enqueue an idempotent parallel marketplace refresh" },
  }, async (request, reply) => {
    const event = await repository.findByIdOrSlug(request.params.eventId);
    if (!event) return reply.code(404).send({ error: "EVENT_NOT_FOUND", message: "Event not found" });
    const accepted = await refreshQueue.enqueue(event.id);
    return reply.code(202).send(accepted);
  });

  app.get<{ Params: { eventId: string } }>("/events/:eventId/stream", {
    schema: { tags: ["prices"], summary: "SSE channel for newly published snapshots" },
  }, async (_request, reply) => {
    // Production implementation subscribes to `snapshot:published:<eventId>` in Redis.
    // Keeping this route explicit makes the browser/API contract stable while storage is wired.
    return reply.code(501).send({ error: "STREAM_NOT_CONNECTED", message: "Connect this route to Redis pub/sub in the next implementation slice." });
  });
}
