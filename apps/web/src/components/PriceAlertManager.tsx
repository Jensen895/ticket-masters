"use client";

import type {
  CrawledPriceSnapshot,
  PriceAlert,
  PriceAlertNotification,
} from "@ticket-hub/contracts";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/price-alerts";

type BrowserNotificationState = "unsupported" | "default" | "granted" | "denied";

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "Every 5 min" },
  { value: 15, label: "Every 15 min" },
  { value: 30, label: "Every 30 min" },
];

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function PriceAlertManager({
  eventId,
  eventName,
  snapshot,
  loadingPrices = false,
  onRefreshPrices,
}: {
  eventId: string;
  eventName: string;
  snapshot?: CrawledPriceSnapshot;
  loadingPrices?: boolean;
  onRefreshPrices: () => void;
}) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [notifications, setNotifications] = useState<PriceAlertNotification[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [sectionFilter, setSectionFilter] = useState("");
  const [lowestTarget, setLowestTarget] = useState("");
  const [lowestMinDrop, setLowestMinDrop] = useState("");
  const [sectionsTarget, setSectionsTarget] = useState("");
  const [sectionsMinDrop, setSectionsMinDrop] = useState("");
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(0);
  const [browserNotifications, setBrowserNotifications] = useState<BrowserNotificationState>("unsupported");
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string>();

  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const loadingRef = useRef(loadingPrices);
  loadingRef.current = loadingPrices;
  const refreshRef = useRef(onRefreshPrices);
  refreshRef.current = onRefreshPrices;
  const evaluatedSnapshotRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setAlerts(readPriceAlerts(window.localStorage));
    setNotifications(readPriceAlertNotifications(window.localStorage));
    setHydrated(true);
    if ("Notification" in window) {
      setBrowserNotifications(Notification.permission);
    }
  }, []);

  function persistAlerts(next: PriceAlert[]) {
    setAlerts(next);
    writePriceAlerts(window.localStorage, next);
  }

  function persistNotifications(next: PriceAlertNotification[]) {
    setNotifications(next);
    writePriceAlertNotifications(window.localStorage, next);
  }

  // Evaluate this event's alerts against each fresh snapshot exactly once.
  useEffect(() => {
    if (!hydrated || !snapshot || snapshot.eventId !== eventId) return;
    const snapshotKey = `${snapshot.eventId}:${snapshot.capturedAt}`;
    if (evaluatedSnapshotRef.current === snapshotKey) return;
    evaluatedSnapshotRef.current = snapshotKey;

    const { updatedAlerts, notifications: triggered } = evaluatePriceAlerts(
      alertsForEvent(alertsRef.current, eventId),
      snapshot,
    );
    if (JSON.stringify(updatedAlerts) !== JSON.stringify(alertsForEvent(alertsRef.current, eventId))) {
      const merged = mergeAlertUpdates(alertsRef.current, updatedAlerts);
      alertsRef.current = merged;
      setAlerts(merged);
      writePriceAlerts(window.localStorage, merged);
    }
    if (triggered.length) {
      setNotifications((current) => {
        const next = [...triggered, ...current];
        writePriceAlertNotifications(window.localStorage, next);
        return next;
      });
      setFreshIds((current) => [...triggered.map((item) => item.id), ...current]);
      if ("Notification" in window && Notification.permission === "granted") {
        for (const item of triggered) {
          try {
            new Notification(item.title, { body: `${eventName}: ${item.message}`, tag: item.id });
          } catch {
            // Browser notification failures must not break in-app alerts.
          }
        }
      }
    }
  }, [hydrated, snapshot, eventId, eventName]);

  // Optional background re-check while the event page stays open.
  useEffect(() => {
    if (!autoRefreshMinutes || !hydrated) return undefined;
    const timer = window.setInterval(() => {
      if (!loadingRef.current && document.visibilityState === "visible") refreshRef.current();
    }, autoRefreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, hydrated]);

  const eventAlerts = useMemo(() => alertsForEvent(alerts, eventId), [alerts, eventId]);
  const eventNotifications = useMemo(
    () => notificationsForEvent(notifications, eventId),
    [notifications, eventId],
  );
  const unreadCount = eventNotifications.filter((item) => !item.read).length;
  const eventMinimum = useMemo(
    () => (snapshot ? computeEventMinimum(snapshot) : undefined),
    [snapshot],
  );
  const sectionOptions = useMemo(() => (snapshot ? getSectionOptions(snapshot) : []), [snapshot]);
  const sectionMinimums = useMemo(
    () => new Map(computeSectionMinimums(snapshot ?? {
      eventId, capturedAt: "", status: "unavailable", sources: [], sectionPositions: [], seatPositions: [],
    }).map((minimum) => [minimum.sectionKey, minimum])),
    [snapshot, eventId],
  );
  const visibleOptions = useMemo(() => {
    const query = sectionFilter.trim().toLowerCase();
    if (!query) return sectionOptions;
    return sectionOptions.filter((option) => option.section.toLowerCase().includes(query));
  }, [sectionOptions, sectionFilter]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const existingLowest = eventAlerts.find((alert) => alert.scope === "event-lowest");

  function toggleSection(sectionKey: string) {
    setSelectedKeys((current) => current.includes(sectionKey)
      ? current.filter((key) => key !== sectionKey)
      : [...current, sectionKey]);
  }

  function createLowestAlert() {
    setFormError(undefined);
    if (existingLowest) {
      setFormError("This event already has a lowest-price alert. Manage it below.");
      return;
    }
    const targetCents = lowestTarget ? parseDollarsToCents(lowestTarget) : undefined;
    const minDropCents = lowestMinDrop ? parseDollarsToCents(lowestMinDrop) : undefined;
    if ((lowestTarget && targetCents === undefined) || (lowestMinDrop && minDropCents === undefined)) {
      setFormError("Target price and minimum drop must be positive dollar amounts.");
      return;
    }
    persistAlerts([...alerts, createPriceAlert({
      eventId,
      scope: "event-lowest",
      baselineCents: eventMinimum?.priceCents,
      targetCents,
      minDropCents,
    })]);
    setLowestTarget("");
    setLowestMinDrop("");
  }

  function createSectionsAlert() {
    setFormError(undefined);
    if (!selectedKeys.length) {
      setFormError("Select at least one section to watch.");
      return;
    }
    const targetCents = sectionsTarget ? parseDollarsToCents(sectionsTarget) : undefined;
    const minDropCents = sectionsMinDrop ? parseDollarsToCents(sectionsMinDrop) : undefined;
    if ((sectionsTarget && targetCents === undefined) || (sectionsMinDrop && minDropCents === undefined)) {
      setFormError("Target price and minimum drop must be positive dollar amounts.");
      return;
    }
    const labels: string[] = [];
    const baselines: Record<string, number> = {};
    for (const key of selectedKeys) {
      const option = sectionOptions.find((candidate) => candidate.sectionKey === key);
      if (!option) continue;
      labels.push(option.section);
      const minimum = sectionMinimums.get(key);
      if (minimum) baselines[key] = minimum.offer.priceCents;
    }
    persistAlerts([...alerts, createPriceAlert({
      eventId,
      scope: "sections",
      sections: labels,
      sectionBaselines: baselines,
      targetCents,
      minDropCents,
    })]);
    setSelectedKeys([]);
    setSectionsTarget("");
    setSectionsMinDrop("");
  }

  function toggleAlert(alertId: string) {
    persistAlerts(alerts.map((alert) => alert.id === alertId
      ? { ...alert, enabled: !alert.enabled, updatedAt: new Date().toISOString() }
      : alert));
  }

  function deleteAlert(alertId: string) {
    persistAlerts(alerts.filter((alert) => alert.id !== alertId));
  }

  function resetAlertBaseline(alert: PriceAlert) {
    const checkedAt = new Date().toISOString();
    if (alert.scope === "event-lowest") {
      persistAlerts(alerts.map((candidate) => candidate.id === alert.id
        ? {
          ...candidate,
          baselineCents: eventMinimum?.priceCents,
          lastTriggeredAt: undefined,
          updatedAt: checkedAt,
        }
        : candidate));
      return;
    }
    const baselines: Record<string, number> = {};
    for (const label of alert.sections) {
      const minimum = sectionMinimums.get(normalizeAlertSection(label));
      if (minimum) baselines[minimum.sectionKey] = minimum.offer.priceCents;
    }
    persistAlerts(alerts.map((candidate) => candidate.id === alert.id
      ? { ...candidate, sectionBaselines: baselines, lastTriggeredAt: undefined, updatedAt: checkedAt }
      : candidate));
  }

  function markNotificationRead(notificationId: string, read: boolean) {
    persistNotifications(notifications.map((item) => item.id === notificationId ? { ...item, read } : item));
  }

  function dismissNotification(notificationId: string) {
    persistNotifications(notifications.filter((item) => item.id !== notificationId));
    setFreshIds((current) => current.filter((id) => id !== notificationId));
  }

  function markAllRead() {
    const ids = new Set(eventNotifications.map((item) => item.id));
    persistNotifications(notifications.map((item) => ids.has(item.id) ? { ...item, read: true } : item));
  }

  function clearEventNotifications() {
    persistNotifications(notifications.filter((item) => item.eventId !== eventId));
    setFreshIds([]);
  }

  async function requestBrowserPermission() {
    if (!("Notification" in window)) return;
    try {
      setBrowserNotifications(await Notification.requestPermission());
    } catch {
      setBrowserNotifications(Notification.permission);
    }
  }

  function alertStatus(alert: PriceAlert): string {
    if (!alert.enabled) return "Paused";
    if (!snapshot) return loadingPrices ? "Checking prices…" : "Waiting for prices";
    if (alert.lastTriggeredAt) return `Last drop ${timeAgo(alert.lastTriggeredAt)}`;
    return `Watching · checked ${timeAgo(alert.lastCheckedAt)}`;
  }

  function alertCurrentSummary(alert: PriceAlert): string | undefined {
    if (!snapshot) return undefined;
    if (alert.scope === "event-lowest") {
      return eventMinimum ? `Now ${formatAlertMoney(eventMinimum.priceCents)} on ${eventMinimum.marketplaceLabel}` : "No listings right now";
    }
    const currents = alert.sections
      .map((label) => sectionMinimums.get(normalizeAlertSection(label))?.offer.priceCents)
      .filter((price): price is number => price !== undefined);
    if (!currents.length) return "No listings in watched sections right now";
    return `Watched sections from ${formatAlertMoney(Math.min(...currents))}`;
  }

  const freshNotifications = eventNotifications.filter((item) => freshIds.includes(item.id));

  return (
    <section className="priceAlerts" aria-label="Price drop alerts">
      <div className="alertHeading">
        <div>
          <p className="sectionKicker">Price drop alerts</p>
          <h2>
            Watch this event
            {unreadCount > 0 && <span className="alertUnreadBadge">{unreadCount} new</span>}
          </h2>
        </div>
        <div className="alertHeaderActions">
          {browserNotifications === "granted" ? (
            <span className="browserNotifStatus"><BellRing size={14} /> Browser alerts on</span>
          ) : browserNotifications === "denied" ? (
            <span className="browserNotifStatus muted"><BellOff size={14} /> Browser alerts blocked</span>
          ) : browserNotifications === "default" ? (
            <button className="textButton" type="button" onClick={() => void requestBrowserPermission()}>
              <Bell size={14} /> Enable browser alerts
            </button>
          ) : null}
        </div>
      </div>

      {freshNotifications.length > 0 && (
        <div className="alertFreshBanner" role="status">
          <BellRing size={18} />
          <div>
            <strong>{freshNotifications.length} price drop{freshNotifications.length === 1 ? "" : "s"} just detected</strong>
            <span>{freshNotifications[0]?.title}</span>
          </div>
          <button type="button" onClick={() => setFreshIds([])} aria-label="Dismiss new-drop banner">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="alertRefreshRow">
        <button
          className="alertRefreshButton"
          type="button"
          onClick={onRefreshPrices}
          disabled={loadingPrices}
        >
          <RefreshCw size={15} className={loadingPrices ? "spinning" : ""} />
          {loadingPrices ? "Checking prices…" : "Check prices now"}
        </button>
        <label className="alertAutoRefresh">
          Auto re-check
          <select
            value={autoRefreshMinutes}
            onChange={(event) => setAutoRefreshMinutes(Number(event.target.value))}
          >
            {AUTO_REFRESH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <span className="alertRefreshHint">
          Alerts are checked whenever fresh prices load{autoRefreshMinutes ? " and automatically while this page stays open" : ""}.
        </span>
      </div>

      {formError && <div className="inlineError"><strong>Couldn’t create that alert.</strong><span>{formError}</span></div>}

      <div className="alertCreateGrid">
        <div className="alertCreateCard">
          <div>
            <h3>Lowest price of the event</h3>
            <p>
              {eventMinimum
                ? <>Currently <strong>{formatAlertMoney(eventMinimum.priceCents)}</strong> on {eventMinimum.marketplaceLabel}.</>
                : loadingPrices ? "Loading the current lowest price…" : "Lowest price appears after prices load."}
            </p>
          </div>
          <div className="alertOptionRow">
            <label>Target price (optional)<input
              value={lowestTarget}
              onChange={(event) => setLowestTarget(event.target.value)}
              placeholder="$120"
              inputMode="decimal"
            /></label>
            <label>Min. drop (optional)<input
              value={lowestMinDrop}
              onChange={(event) => setLowestMinDrop(event.target.value)}
              placeholder="$5"
              inputMode="decimal"
            /></label>
          </div>
          <button
            className="alertCreateButton"
            type="button"
            onClick={createLowestAlert}
            disabled={Boolean(existingLowest)}
          >
            <Plus size={16} /> {existingLowest ? "Lowest-price alert active" : "Watch the lowest price"}
          </button>
        </div>

        <div className="alertCreateCard">
          <div>
            <h3>Specific sections</h3>
            <p>Pick one or more areas. You’ll be notified when any of them drops.</p>
          </div>
          {sectionOptions.length ? (
            <>
              <input
                className="alertSectionFilter"
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                placeholder="Filter sections…"
                aria-label="Filter sections"
              />
              <div className="alertSectionList" role="group" aria-label="Sections to watch">
                {visibleOptions.map((option) => (
                  <label key={option.sectionKey} className={selectedSet.has(option.sectionKey) ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(option.sectionKey)}
                      onChange={() => toggleSection(option.sectionKey)}
                    />
                    <span className="alertSectionLabel">Section {option.section}</span>
                    <span className="alertSectionPrice">
                      {option.minimumCents !== undefined ? formatAlertMoney(option.minimumCents) : "—"}
                    </span>
                  </label>
                ))}
                {!visibleOptions.length && <span className="alertSectionEmpty">No sections match that filter.</span>}
              </div>
              <div className="alertSectionBulk">
                <button type="button" onClick={() => setSelectedKeys(visibleOptions.map((option) => option.sectionKey))}>
                  Select visible
                </button>
                <button type="button" onClick={() => setSelectedKeys([])}>Clear</button>
                <span>{selectedKeys.length} selected</span>
              </div>
            </>
          ) : (
            <p className="alertMuted">{loadingPrices ? "Loading sections…" : "Sections appear after prices load."}</p>
          )}
          <div className="alertOptionRow">
            <label>Target price (optional)<input
              value={sectionsTarget}
              onChange={(event) => setSectionsTarget(event.target.value)}
              placeholder="$120"
              inputMode="decimal"
            /></label>
            <label>Min. drop (optional)<input
              value={sectionsMinDrop}
              onChange={(event) => setSectionsMinDrop(event.target.value)}
              placeholder="$5"
              inputMode="decimal"
            /></label>
          </div>
          <button
            className="alertCreateButton"
            type="button"
            onClick={createSectionsAlert}
            disabled={!selectedKeys.length}
          >
            <Plus size={16} /> Watch {selectedKeys.length || ""} section{selectedKeys.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      <div className="alertManageGrid">
        <div className="alertListPanel">
          <div className="alertPanelHeading">
            <h3>My alerts for this event</h3>
            <span>{eventAlerts.length}</span>
          </div>
          {!hydrated ? (
            <p className="alertMuted">Loading your alerts…</p>
          ) : !eventAlerts.length ? (
            <p className="alertMuted">No alerts yet. Create one above to get notified of price drops.</p>
          ) : (
            <ul className="alertList">
              {eventAlerts.map((alert) => (
                <li key={alert.id} className={alert.enabled ? "" : "paused"}>
                  <div className="alertListMain">
                    <strong>
                      {alert.scope === "event-lowest"
                        ? "Lowest price"
                        : `${alert.sections.length} section${alert.sections.length === 1 ? "" : "s"}`}
                    </strong>
                    {alert.scope === "sections" && (
                      <span className="alertSectionChips">
                        {alert.sections.slice(0, 3).map((section) => <i key={section}>{section}</i>)}
                        {alert.sections.length > 3 && <i>+{alert.sections.length - 3}</i>}
                      </span>
                    )}
                    <span className="alertBaseline">
                      {alert.scope === "event-lowest"
                        ? alert.baselineCents !== undefined ? `Watching from ${formatAlertMoney(alert.baselineCents)}` : "Baseline set on next check"
                        : `${Object.keys(alert.sectionBaselines).length}/${alert.sections.length} baselines set`}
                      {alert.targetCents !== undefined && <> · target {formatAlertMoney(alert.targetCents)}</>}
                      {alert.minDropCents !== undefined && <> · min drop {formatAlertMoney(alert.minDropCents)}</>}
                    </span>
                    <span className="alertCurrent">{alertCurrentSummary(alert)}</span>
                    <span className="alertStatusText">{alertStatus(alert)}</span>
                  </div>
                  <div className="alertListActions">
                    <button
                      type="button"
                      onClick={() => toggleAlert(alert.id)}
                      aria-pressed={alert.enabled}
                      title={alert.enabled ? "Pause this alert" : "Resume this alert"}
                    >
                      {alert.enabled ? <Bell size={15} /> : <BellOff size={15} />}
                    </button>
                    <button type="button" onClick={() => resetAlertBaseline(alert)} title="Reset baseline to current prices">
                      <RotateCcw size={15} />
                    </button>
                    <button type="button" onClick={() => deleteAlert(alert.id)} title="Delete this alert" aria-label="Delete this alert">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="alertListPanel">
          <div className="alertPanelHeading">
            <h3>Drop history</h3>
            <span>{unreadCount ? `${unreadCount} unread` : eventNotifications.length}</span>
          </div>
          {eventNotifications.length > 1 && (
            <div className="alertHistoryActions">
              <button type="button" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button>
              <button type="button" onClick={clearEventNotifications}><Trash2 size={14} /> Clear history</button>
            </div>
          )}
          {!eventNotifications.length ? (
            <p className="alertMuted">No price drops recorded for this event yet.</p>
          ) : (
            <ul className="alertHistoryList">
              {eventNotifications.map((item) => (
                <li key={item.id} className={item.read ? "read" : "unread"}>
                  <div className="alertHistoryMain">
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    {item.sectionDrops.length > 1 && (
                      <span className="alertSectionChips">
                        {item.sectionDrops.map((drop) => (
                          <i key={drop.section}>{drop.section}: {formatAlertMoney(drop.currentCents)}</i>
                        ))}
                      </span>
                    )}
                    <span className="alertHistoryMeta">
                      {timeAgo(item.createdAt)}
                      {item.marketplace ? ` · ${item.marketplace}` : ""}
                    </span>
                  </div>
                  <div className="alertListActions">
                    {item.deepLink && (
                      <a href={item.deepLink} target="_blank" rel="noreferrer" title="Open the listing" aria-label="Open the listing">
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => markNotificationRead(item.id, !item.read)}
                      title={item.read ? "Mark as unread" : "Mark as read"}
                      aria-label={item.read ? "Mark as unread" : "Mark as read"}
                    >
                      {item.read ? <Bell size={15} /> : <CheckCheck size={15} />}
                    </button>
                    <button type="button" onClick={() => dismissNotification(item.id)} title="Dismiss" aria-label="Dismiss notification">
                      <X size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
