import type {
  CrawledPriceSnapshot,
  PriceAlert,
  PriceAlertNotification,
  PriceAlertScope,
  PriceAlertSectionDrop,
  TicketOffer,
} from "@ticket-hub/contracts";

export const PRICE_ALERTS_STORAGE_KEY = "ticket-masters:price-alerts:v1";
export const PRICE_ALERT_NOTIFICATIONS_STORAGE_KEY = "ticket-masters:price-alert-notifications:v1";

/** Cap persisted notifications so local storage cannot grow without bound. */
export const MAX_STORED_NOTIFICATIONS = 200;

/** Match the section normalization used by the seat map viewer. */
export function normalizeAlertSection(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(?:SECTION|SEC|LEVEL|ZONE|LOWER|UPPER)\b/g, "")
    .replace(/[^A-Z0-9]/g, "") || "ANY";
}

function cheaper(left: TicketOffer | undefined, right: TicketOffer): TicketOffer {
  if (!left || right.priceCents < left.priceCents) return right;
  if (right.priceCents === left.priceCents && right.feesIncluded && !left.feesIncluded) return right;
  return left;
}

export interface SectionMinimum {
  sectionKey: string;
  section: string;
  offer: TicketOffer;
}

/**
 * Cheapest offer per section. Event-level aggregate offers (normalized to
 * "ANY") are excluded: they carry no area information.
 */
export function computeSectionMinimums(snapshot: CrawledPriceSnapshot): SectionMinimum[] {
  const lowestBySection = new Map<string, SectionMinimum>();
  for (const offer of snapshot.sources.flatMap((source) => source.offers)) {
    const sectionKey = normalizeAlertSection(offer.section);
    if (sectionKey === "ANY") continue;
    const current = lowestBySection.get(sectionKey);
    const best = cheaper(current?.offer, offer);
    if (best !== current?.offer) {
      lowestBySection.set(sectionKey, { sectionKey, section: best.section, offer: best });
    }
  }
  return [...lowestBySection.values()].sort((left, right) =>
    left.section.localeCompare(right.section, undefined, { numeric: true }));
}

/** Cheapest offer across every marketplace, including event-level minimums. */
export function computeEventMinimum(snapshot: CrawledPriceSnapshot): TicketOffer | undefined {
  let best: TicketOffer | undefined;
  for (const offer of snapshot.sources.flatMap((source) => source.offers)) {
    best = best ? cheaper(best, offer) : offer;
  }
  return best;
}

export interface SectionOption {
  sectionKey: string;
  section: string;
  minimumCents?: number;
  marketplaceLabel?: string;
}

/**
 * Selectable watch targets: the union of Ticketmaster map sections and
 * sections seen in marketplace offers, each with its current minimum when
 * listings exist.
 */
export function getSectionOptions(snapshot: CrawledPriceSnapshot): SectionOption[] {
  const options = new Map<string, SectionOption>();
  for (const position of snapshot.sectionPositions) {
    const sectionKey = normalizeAlertSection(position.section);
    if (sectionKey !== "ANY" && !options.has(sectionKey)) {
      options.set(sectionKey, { sectionKey, section: position.section });
    }
  }
  for (const minimum of computeSectionMinimums(snapshot)) {
    options.set(minimum.sectionKey, {
      sectionKey: minimum.sectionKey,
      section: options.get(minimum.sectionKey)?.section ?? minimum.section,
      minimumCents: minimum.offer.priceCents,
      marketplaceLabel: minimum.offer.marketplaceLabel,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.section.localeCompare(right.section, undefined, { numeric: true }));
}

export function formatAlertMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

/** Parse a user-typed dollar amount into integer cents. Returns undefined when blank/invalid. */
export function parseDollarsToCents(value: string): number | undefined {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

function newId(prefix: string): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createPriceAlert(input: {
  eventId: string;
  scope: PriceAlertScope;
  sections?: string[];
  sectionBaselines?: Record<string, number>;
  baselineCents?: number;
  targetCents?: number;
  minDropCents?: number;
}): PriceAlert {
  const now = new Date().toISOString();
  return {
    id: newId("alert"),
    eventId: input.eventId,
    scope: input.scope,
    sections: input.scope === "sections" ? [...(input.sections ?? [])] : [],
    sectionBaselines: { ...(input.sectionBaselines ?? {}) },
    baselineCents: input.baselineCents,
    targetCents: input.targetCents,
    minDropCents: input.minDropCents,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

interface DropGate {
  targetCents?: number;
  minDropCents?: number;
}

function passesDropGate(previousCents: number, currentCents: number, gate: DropGate): boolean {
  if (currentCents >= previousCents) return false;
  if (gate.minDropCents && previousCents - currentCents < gate.minDropCents) return false;
  if (gate.targetCents !== undefined && currentCents > gate.targetCents) return false;
  return true;
}

function sectionLabelList(sections: string[]): string {
  if (sections.length <= 2) return sections.map((section) => `Section ${section}`).join(" and ");
  return `${sections.slice(0, 2).map((section) => `Section ${section}`).join(", ")}, and ${sections.length - 2} more`;
}

export interface AlertEvaluation {
  updatedAlerts: PriceAlert[];
  notifications: PriceAlertNotification[];
}

/**
 * Evaluate enabled alerts for one event against a fresh snapshot.
 *
 * - Alerts without a baseline adopt the current price and do not notify.
 * - Snapshots with no current price update `lastCheckedAt` only.
 * - Baselines ratchet down only when a notification fires.
 * - One `sections` alert produces at most one notification per check, listing
 *   every watched section that dropped.
 */
export function evaluatePriceAlerts(
  alerts: PriceAlert[],
  snapshot: CrawledPriceSnapshot,
  now: Date = new Date(),
): AlertEvaluation {
  const checkedAt = now.toISOString();
  const eventMinimum = computeEventMinimum(snapshot);
  const sectionMinimums = new Map(computeSectionMinimums(snapshot).map((minimum) => [minimum.sectionKey, minimum]));

  const updatedAlerts: PriceAlert[] = [];
  const notifications: PriceAlertNotification[] = [];

  for (const alert of alerts) {
    if (!alert.enabled || alert.eventId !== snapshot.eventId) {
      updatedAlerts.push(alert);
      continue;
    }

    if (alert.scope === "event-lowest") {
      if (!eventMinimum) {
        updatedAlerts.push({ ...alert, lastCheckedAt: checkedAt });
        continue;
      }
      if (alert.baselineCents === undefined) {
        updatedAlerts.push({ ...alert, baselineCents: eventMinimum.priceCents, lastCheckedAt: checkedAt, updatedAt: checkedAt });
        continue;
      }
      if (!passesDropGate(alert.baselineCents, eventMinimum.priceCents, alert)) {
        updatedAlerts.push({ ...alert, lastCheckedAt: checkedAt });
        continue;
      }
      const previousCents = alert.baselineCents;
      const currentCents = eventMinimum.priceCents;
      const dropCents = previousCents - currentCents;
      notifications.push({
        id: newId("notif"),
        eventId: alert.eventId,
        alertId: alert.id,
        scope: alert.scope,
        title: `Lowest price dropped to ${formatAlertMoney(currentCents)}`,
        message: `Down ${formatAlertMoney(dropCents)} (${Math.round(dropCents / previousCents * 100)}%) from ${formatAlertMoney(previousCents)} on ${eventMinimum.marketplaceLabel}.`,
        previousCents,
        currentCents,
        dropCents,
        dropPercent: Math.round(dropCents / previousCents * 1000) / 10,
        sections: [],
        sectionDrops: [],
        marketplace: eventMinimum.marketplaceLabel,
        deepLink: eventMinimum.deepLink,
        capturedAt: snapshot.capturedAt,
        createdAt: checkedAt,
        read: false,
      });
      updatedAlerts.push({
        ...alert,
        baselineCents: currentCents,
        lastCheckedAt: checkedAt,
        lastTriggeredAt: checkedAt,
        updatedAt: checkedAt,
      });
      continue;
    }

    // Scope "sections": evaluate each watched section against its own baseline.
    const watchedKeys = alert.sections.map((section) => ({
      label: section,
      key: normalizeAlertSection(section),
    })).filter((entry) => entry.key !== "ANY");
    const nextBaselines = { ...alert.sectionBaselines };
    // Prune baselines for sections the user removed.
    for (const key of Object.keys(nextBaselines)) {
      if (!watchedKeys.some((entry) => entry.key === key)) delete nextBaselines[key];
    }
    const drops: PriceAlertSectionDrop[] = [];
    for (const entry of watchedKeys) {
      const minimum = sectionMinimums.get(entry.key);
      if (!minimum) continue;
      const baseline = nextBaselines[entry.key];
      if (baseline === undefined) {
        nextBaselines[entry.key] = minimum.offer.priceCents;
        continue;
      }
      if (!passesDropGate(baseline, minimum.offer.priceCents, alert)) continue;
      nextBaselines[entry.key] = minimum.offer.priceCents;
      drops.push({
        section: entry.label,
        previousCents: baseline,
        currentCents: minimum.offer.priceCents,
        dropCents: baseline - minimum.offer.priceCents,
        marketplace: minimum.offer.marketplaceLabel,
        deepLink: minimum.offer.deepLink,
      });
    }
    const baselinesChanged = JSON.stringify(nextBaselines) !== JSON.stringify(alert.sectionBaselines);
    if (!drops.length) {
      updatedAlerts.push(baselinedAlert(alert, nextBaselines, checkedAt, baselinesChanged));
      continue;
    }
    const previousCents = drops.reduce((sum, drop) => sum + drop.previousCents, 0);
    const currentCents = drops.reduce((sum, drop) => sum + drop.currentCents, 0);
    const dropCents = previousCents - currentCents;
    const best = [...drops].sort((left, right) => right.dropCents - left.dropCents)[0]!;
    const droppedLabels = drops.map((drop) => drop.section);
    notifications.push({
      id: newId("notif"),
      eventId: alert.eventId,
      alertId: alert.id,
      scope: alert.scope,
      title: drops.length === 1
        ? `Section ${best.section} dropped to ${formatAlertMoney(best.currentCents)}`
        : `Prices dropped in ${drops.length} watched sections`,
      message: drops.length === 1
        ? `Down ${formatAlertMoney(best.dropCents)} from ${formatAlertMoney(best.previousCents)} on ${best.marketplace}.`
        : `${sectionLabelList(droppedLabels)} dropped. Biggest drop: Section ${best.section}, down ${formatAlertMoney(best.dropCents)} to ${formatAlertMoney(best.currentCents)}.`,
      previousCents,
      currentCents,
      dropCents,
      dropPercent: previousCents ? Math.round(dropCents / previousCents * 1000) / 10 : 0,
      sections: droppedLabels,
      sectionDrops: drops,
      marketplace: drops.length === 1 ? best.marketplace : undefined,
      deepLink: drops.length === 1 ? best.deepLink : undefined,
      capturedAt: snapshot.capturedAt,
      createdAt: checkedAt,
      read: false,
    });
    updatedAlerts.push({
      ...alert,
      sectionBaselines: nextBaselines,
      lastCheckedAt: checkedAt,
      lastTriggeredAt: checkedAt,
      updatedAt: checkedAt,
    });
  }

  return { updatedAlerts, notifications };
}

function baselinedAlert(
  alert: PriceAlert,
  sectionBaselines: Record<string, number>,
  checkedAt: string,
  baselinesChanged: boolean,
): PriceAlert {
  return {
    ...alert,
    sectionBaselines,
    lastCheckedAt: checkedAt,
    updatedAt: baselinesChanged ? checkedAt : alert.updatedAt,
  };
}

function isPriceAlert(value: unknown): value is PriceAlert {
  if (!value || typeof value !== "object") return false;
  const alert = value as Partial<PriceAlert>;
  return typeof alert.id === "string"
    && typeof alert.eventId === "string"
    && (alert.scope === "event-lowest" || alert.scope === "sections")
    && Array.isArray(alert.sections)
    && Boolean(alert.sectionBaselines && typeof alert.sectionBaselines === "object")
    && typeof alert.enabled === "boolean"
    && typeof alert.createdAt === "string"
    && typeof alert.updatedAt === "string";
}

function isPriceAlertNotification(value: unknown): value is PriceAlertNotification {
  if (!value || typeof value !== "object") return false;
  const notification = value as Partial<PriceAlertNotification>;
  return typeof notification.id === "string"
    && typeof notification.eventId === "string"
    && typeof notification.alertId === "string"
    && typeof notification.title === "string"
    && typeof notification.message === "string"
    && typeof notification.currentCents === "number"
    && typeof notification.createdAt === "string"
    && typeof notification.read === "boolean";
}

function readStoredArray<T>(storage: Pick<Storage, "getItem">, key: string, guard: (value: unknown) => value is T): T[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

export function readPriceAlerts(storage: Pick<Storage, "getItem">): PriceAlert[] {
  return readStoredArray(storage, PRICE_ALERTS_STORAGE_KEY, isPriceAlert);
}

export function writePriceAlerts(storage: Pick<Storage, "setItem">, alerts: PriceAlert[]): void {
  storage.setItem(PRICE_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
}

export function readPriceAlertNotifications(storage: Pick<Storage, "getItem">): PriceAlertNotification[] {
  return readStoredArray(storage, PRICE_ALERT_NOTIFICATIONS_STORAGE_KEY, isPriceAlertNotification);
}

export function writePriceAlertNotifications(
  storage: Pick<Storage, "setItem">,
  notifications: PriceAlertNotification[],
): void {
  const newestFirst = [...notifications]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_STORED_NOTIFICATIONS);
  storage.setItem(PRICE_ALERT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(newestFirst));
}

export function alertsForEvent(alerts: PriceAlert[], eventId: string): PriceAlert[] {
  return alerts.filter((alert) => alert.eventId === eventId);
}

export function notificationsForEvent(notifications: PriceAlertNotification[], eventId: string): PriceAlertNotification[] {
  return notifications
    .filter((notification) => notification.eventId === eventId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function mergeAlertUpdates(allAlerts: PriceAlert[], updated: PriceAlert[]): PriceAlert[] {
  const nextById = new Map(updated.map((alert) => [alert.id, alert]));
  return allAlerts.map((alert) => nextById.get(alert.id) ?? alert);
}
