import { AUDIT_METRICS, getActiveRequestTimestamp, getIndicatorLevel } from "../tools/focus/focus-utils.js";
import { isPrimaryModerator } from "../utils.js";
import { publishAutomation } from "./events.js";

export function allInZone(zones, zone) {
  const active = Object.values(zones).filter((value) => value !== "muted");
  return active.length > 0 && active.every((value) => value === zone);
}
export class FocusAutomationObserver {
  constructor(tool) { this.tool = tool; this.snapshot = new Map(); this.timer = null; this.primary = false; }
  dispose() { globalThis.clearTimeout(this.timer); this.timer = null; }
  observe({ baseline = false } = {}) {
    this.dispose();
    const primary = isPrimaryModerator();
    const silent = baseline || !primary || !this.primary;
    this.primary = primary;
    const now = Date.now();
    let next = Infinity;
    const current = new Map();
    for (const [userId, entry] of Object.entries(this.tool.state.players)) {
      const zones = {};
      for (const [metric, config] of Object.entries(AUDIT_METRICS)) {
        const stamp = metric === "activeRequest" ? getActiveRequestTimestamp(entry, now) : entry[config.timestampKey];
        zones[metric] = entry.enabled ? getIndicatorLevel(stamp, this.tool.thresholds[metric], now) : "muted";
        if (entry.enabled && stamp > 0) for (const minutes of Object.values(this.tool.thresholds[metric])) {
          const boundary = stamp + minutes * 60000;
          if (boundary > now) next = Math.min(next, boundary);
        }
      }
      const value = { status: entry.selfStatus, zones };
      current.set(userId, value);
      const previous = this.snapshot.get(userId) ?? { status: "unknown", zones: Object.fromEntries(Object.keys(AUDIT_METRICS).map((metric) => [metric, "muted"])) };
      if (silent) continue;
      const emit = (name, parameters) => void publishAutomation({ type: "focus", id: "focus" }, `focus.${name}`, { userId, userUuid: `User.${userId}`, ...parameters }, this.tool.state.automationCause);
      if (previous.status !== value.status) emit("statusChanged", { previous: previous.status, status: value.status });
      for (const [indicator, zone] of Object.entries(zones)) {
        if (previous.zones[indicator] !== zone) emit("indicatorChanged", { indicator, previous: previous.zones[indicator], zone });
      }
      for (const [zone, event] of [["doubt", "allYellow"], ["deadline", "allRed"]]) {
        if (allInZone(zones, zone) && !allInZone(previous.zones, zone)) emit(event, { zones });
      }
    }
    this.snapshot = current;
    if (primary && Number.isFinite(next)) this.timer = globalThis.setTimeout(() => this.observe(), Math.min(2147483647, Math.max(1, next - now)));
    this.timer?.unref?.();
  }
}
