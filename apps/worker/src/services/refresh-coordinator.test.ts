import assert from "node:assert/strict";
import { test } from "node:test";
import type { PriceSnapshot } from "@ticket-hub/contracts";
import { StubConnector } from "../connectors/stub-connector.js";
import { RefreshCoordinator } from "./refresh-coordinator.js";

test("coordinator publishes one atomic snapshot after source fan-out", async () => {
  let published: PriceSnapshot | undefined;
  const coordinator = new RefreshCoordinator(
    [new StubConnector("ticketmaster"), new StubConnector("seatgeek")],
    { async publish(snapshot) { published = snapshot; }, async close() {} },
    100,
    { info() {}, error() {} },
  );

  const result = await coordinator.refresh("evt_test");
  assert.equal(result, published);
  assert.equal(result.quotes.length, 2);
  assert.equal(result.status, "partial");
});
