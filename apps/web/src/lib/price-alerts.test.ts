import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CrawledPriceSnapshot,
  Marketplace,
  PriceAlert,
  TicketOffer,
} from "@ticket-hub/contracts";
import {
  alertsForEvent,
  computeEventMinimum,
  computeSectionMinimums,
  createPriceAlert,
  evaluatePriceAlerts,
  formatAlertMoney,
  getSectionOptions,
  mergeAlertUpdates,
  normalizeAlertSection,
  notificationsForEvent,
  parseDollarsToCents,
  readPriceAlertNotifications,
  readPriceAlerts,
  writePriceAlertNotifications,
  writePriceAlerts,
} from "./price-alerts.js";

function offer(overrides: Partial<TicketOffer> & { section: string; priceCents: number }): TicketOffer {
  const { section, priceCents, ...rest } = overrides;
  return {
    id: `${section}-${priceCents}`,
    marketplace: "stubhub" as Marketplace,
    marketplaceLabel: "StubHub",
    section,
    row: "A",
    quantity: 1,
    priceCents,
    feesIncluded: false,
    deepLink: "https://www.stubhub.com/event",
    capturedAt: "2026-09-25T00:00:00.000Z",
    ...rest,
  };
}

function snapshot(eventId: string, offers: TicketOffer[], sections: string[] = []): CrawledPriceSnapshot {
  return {
    eventId,
    capturedAt: "2026-09-25T00:00:00.000Z",
    status: offers.length ? "partial" : "unavailable",
    sources: [{
      marketplace: "stubhub",
      label: "StubHub",
      color: "#5b34da",
      status: "fresh",
      capturedAt: "2026-09-25T00:00:00.000Z",
      offers,
    }],
    sectionPositions: sections.map((section, index) => ({
      section,
      xPercent: 10 + index,
      yPercent: 10 + index,
    })),
    seatPositions: [],
  };
}

function lowestAlert(eventId: string, overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    ...createPriceAlert({ eventId, scope: "event-lowest" }),
    ...overrides,
  };
}

test("normalizeAlertSection matches seat map normalization", () => {
  assert.equal(normalizeAlertSection("Section 101"), "101");
  assert.equal(normalizeAlertSection("sec. 101"), "101");
  assert.equal(normalizeAlertSection("Lower Level 12"), "12");
  assert.equal(normalizeAlertSection("Any section"), "ANY");
});

test("computeEventMinimum finds the cheapest offer including event-level aggregates", () => {
  const snap = snapshot("evt_1", [
    offer({ section: "101", priceCents: 12000 }),
    offer({ section: "Any section", priceCents: 8000 }),
  ]);
  assert.equal(computeEventMinimum(snap)?.priceCents, 8000);
  assert.equal(computeEventMinimum(snapshot("evt_1", [])), undefined);
});

test("computeSectionMinimums keeps the cheapest offer per section and skips aggregates", () => {
  const snap = snapshot("evt_1", [
    offer({ section: "Section 101", priceCents: 12000 }),
    offer({ section: "101", priceCents: 9000 }),
    offer({ section: "Any section", priceCents: 5000 }),
  ]);
  const minimums = computeSectionMinimums(snap);
  assert.equal(minimums.length, 1);
  assert.equal(minimums[0]?.sectionKey, "101");
  assert.equal(minimums[0]?.offer.priceCents, 9000);
});

test("getSectionOptions unions map sections with offer sections", () => {
  const snap = snapshot("evt_1", [offer({ section: "102", priceCents: 9000 })], ["101", "102"]);
  const options = getSectionOptions(snap);
  assert.deepEqual(options.map((option) => option.section), ["101", "102"]);
  assert.equal(options[0]?.minimumCents, undefined);
  assert.equal(options[1]?.minimumCents, 9000);
});

test("event-lowest alert adopts the first observed price without notifying", () => {
  const alerts = [lowestAlert("evt_1")];
  const { updatedAlerts, notifications } = evaluatePriceAlerts(
    alerts,
    snapshot("evt_1", [offer({ section: "101", priceCents: 10000 })]),
  );
  assert.equal(notifications.length, 0);
  assert.equal(updatedAlerts[0]?.baselineCents, 10000);
});

test("event-lowest alert notifies on a drop and ratchets the baseline", () => {
  const first = evaluatePriceAlerts(
    [lowestAlert("evt_1")],
    snapshot("evt_1", [offer({ section: "101", priceCents: 10000 })]),
  );
  const second = evaluatePriceAlerts(
    first.updatedAlerts,
    snapshot("evt_1", [offer({ section: "101", priceCents: 7500 })]),
  );
  assert.equal(second.notifications.length, 1);
  const notification = second.notifications[0]!;
  assert.equal(notification.previousCents, 10000);
  assert.equal(notification.currentCents, 7500);
  assert.equal(notification.dropCents, 2500);
  assert.equal(notification.read, false);
  assert.equal(second.updatedAlerts[0]?.baselineCents, 7500);

  // Same price again: no repeat notification.
  const third = evaluatePriceAlerts(
    second.updatedAlerts,
    snapshot("evt_1", [offer({ section: "101", priceCents: 7500 })]),
  );
  assert.equal(third.notifications.length, 0);

  // Price increases never notify and never move the baseline.
  const fourth = evaluatePriceAlerts(
    second.updatedAlerts,
    snapshot("evt_1", [offer({ section: "101", priceCents: 9000 })]),
  );
  assert.equal(fourth.notifications.length, 0);
  assert.equal(fourth.updatedAlerts[0]?.baselineCents, 7500);
});

test("event-lowest alert honors minimum-drop and target gates", () => {
  const alerts = [lowestAlert("evt_1", { baselineCents: 10000, minDropCents: 500 })];
  const smallDrop = evaluatePriceAlerts(alerts, snapshot("evt_1", [offer({ section: "101", priceCents: 9800 })]));
  assert.equal(smallDrop.notifications.length, 0);
  assert.equal(smallDrop.updatedAlerts[0]?.baselineCents, 10000);

  const withTarget = [lowestAlert("evt_1", { baselineCents: 10000, targetCents: 7000 })];
  const aboveTarget = evaluatePriceAlerts(withTarget, snapshot("evt_1", [offer({ section: "101", priceCents: 8000 })]));
  assert.equal(aboveTarget.notifications.length, 0);
  const belowTarget = evaluatePriceAlerts(withTarget, snapshot("evt_1", [offer({ section: "101", priceCents: 6500 })]));
  assert.equal(belowTarget.notifications.length, 1);
});

test("evaluation skips disabled alerts, other events, and empty snapshots", () => {
  const alerts = [
    lowestAlert("evt_1", { baselineCents: 10000, enabled: false }),
    lowestAlert("evt_2", { baselineCents: 10000 }),
  ];
  const { updatedAlerts, notifications } = evaluatePriceAlerts(
    alerts,
    snapshot("evt_1", [offer({ section: "101", priceCents: 5000 })]),
  );
  assert.equal(notifications.length, 0);
  assert.equal(updatedAlerts[0]?.lastCheckedAt, undefined);

  const empty = evaluatePriceAlerts(
    [lowestAlert("evt_1", { baselineCents: 10000 })],
    snapshot("evt_1", []),
  );
  assert.equal(empty.notifications.length, 0);
  assert.equal(empty.updatedAlerts[0]?.baselineCents, 10000);
  assert.ok(empty.updatedAlerts[0]?.lastCheckedAt);
});

test("sections alert watches multiple areas and summarizes drops in one notification", () => {
  const alert: PriceAlert = {
    ...createPriceAlert({ eventId: "evt_1", scope: "sections", sections: ["101", "102", "103"] }),
    sectionBaselines: { "101": 10000, "102": 12000, "103": 9000 },
  };
  const { updatedAlerts, notifications } = evaluatePriceAlerts([alert], snapshot("evt_1", [
    offer({ section: "101", priceCents: 8000 }),
    offer({ section: "102", priceCents: 12000 }),
    // 103 has no listings in this snapshot.
  ]));
  assert.equal(notifications.length, 1);
  const notification = notifications[0]!;
  assert.deepEqual(notification.sections, ["101"]);
  assert.equal(notification.dropCents, 2000);
  assert.equal(notification.deepLink, "https://www.stubhub.com/event");
  const next = updatedAlerts[0]!;
  assert.equal(next.sectionBaselines["101"], 8000);
  assert.equal(next.sectionBaselines["102"], 12000);
  assert.equal(next.sectionBaselines["103"], 9000);
});

test("sections alert initializes missing baselines and prunes removed sections", () => {
  const alert: PriceAlert = {
    ...createPriceAlert({ eventId: "evt_1", scope: "sections", sections: ["101"] }),
    sectionBaselines: { "101": 10000, "999": 5000 },
  };
  const { updatedAlerts, notifications } = evaluatePriceAlerts(
    [alert],
    snapshot("evt_1", [offer({ section: "101", priceCents: 10000 })]),
  );
  assert.equal(notifications.length, 0);
  assert.deepEqual(updatedAlerts[0]?.sectionBaselines, { "101": 10000 });

  const fresh = createPriceAlert({ eventId: "evt_1", scope: "sections", sections: ["101", "102"] });
  const initialized = evaluatePriceAlerts(
    [fresh],
    snapshot("evt_1", [offer({ section: "101", priceCents: 11000 })]),
  );
  assert.equal(initialized.notifications.length, 0);
  assert.deepEqual(initialized.updatedAlerts[0]?.sectionBaselines, { "101": 11000 });
});

test("alert storage round-trips and filters per event", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  };
  const alerts = [lowestAlert("evt_1"), lowestAlert("evt_2")];
  writePriceAlerts(storage, alerts);
  assert.equal(readPriceAlerts(storage).length, 2);
  assert.equal(alertsForEvent(readPriceAlerts(storage), "evt_1").length, 1);

  // Corrupt payloads and invalid entries are ignored, never thrown.
  memory.set("ticket-masters:price-alerts:v1", "not-json");
  assert.deepEqual(readPriceAlerts(storage), []);
  memory.set("ticket-masters:price-alerts:v1", JSON.stringify([{ id: "broken" }]));
  assert.deepEqual(readPriceAlerts(storage), []);
});

test("notification storage caps history and sorts newest first", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  };
  const evaluated = evaluatePriceAlerts(
    [lowestAlert("evt_1", { baselineCents: 10000 })],
    snapshot("evt_1", [offer({ section: "101", priceCents: 6000 })]),
  );
  writePriceAlertNotifications(storage, evaluated.notifications);
  const stored = readPriceAlertNotifications(storage);
  assert.equal(stored.length, 1);
  assert.equal(notificationsForEvent(stored, "evt_1").length, 1);
  assert.equal(notificationsForEvent(stored, "evt_other").length, 0);
});

test("mergeAlertUpdates applies evaluation results to the full alert list", () => {
  const first = lowestAlert("evt_1");
  const second = lowestAlert("evt_2");
  const changed = { ...first, baselineCents: 5000 };
  assert.deepEqual(mergeAlertUpdates([first, second], [changed]), [changed, second]);
});

test("money helpers format and parse dollar amounts", () => {
  assert.equal(formatAlertMoney(7500), "$75");
  assert.equal(formatAlertMoney(7550), "$75.50");
  assert.equal(parseDollarsToCents("75.50"), 7550);
  assert.equal(parseDollarsToCents("$100"), 10000);
  assert.equal(parseDollarsToCents(""), undefined);
  assert.equal(parseDollarsToCents("abc"), undefined);
  assert.equal(parseDollarsToCents("-5"), undefined);
});
