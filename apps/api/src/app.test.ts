import assert from "node:assert/strict";
import { test } from "node:test";
import type { RefreshQueue } from "./queues/refresh-queue.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const queue: RefreshQueue = {
  async enqueue(eventId) { return { eventId, refreshId: "test", state: "queued", streamUrl: `/v1/events/${eventId}/stream` }; },
  async close() {},
};

test("GET /health returns service health", async () => {
  const app = await createApp(loadConfig({}), { refreshQueue: queue });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().service, "ticket-masters-api");
  await app.close();
});

test("GET /v1/events returns demo catalog", async () => {
  const app = await createApp(loadConfig({}), { refreshQueue: queue });
  const response = await app.inject({ method: "GET", url: "/v1/events?category=Music" });
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().items.length > 0);
  await app.close();
});
