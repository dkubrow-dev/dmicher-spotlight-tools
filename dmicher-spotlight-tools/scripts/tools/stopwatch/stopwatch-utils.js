import { STOPWATCH_EVENTS } from "../../config.js";
import { localize } from "../../utils.js";

export function normalizeStopwatchEventType(eventType) {
  const normalized = String(eventType ?? "").toLowerCase();
  return Object.hasOwn(STOPWATCH_EVENTS, normalized) ? normalized : "";
}

export function getStopwatchEventConfig(eventType) {
  const normalized = normalizeStopwatchEventType(eventType);
  return normalized ? STOPWATCH_EVENTS[normalized] : null;
}

export function getStopwatchEventEntries() {
  return Object.entries(STOPWATCH_EVENTS);
}

export function getStopwatchEventButtons() {
  return getStopwatchEventEntries().map(([eventType, eventConfig]) => ({
    eventType,
    image: eventConfig.image,
    label: localize(eventConfig.labelKey)
  }));
}

export function formatStopwatchElapsed(milliseconds) {
  const totalCentiseconds = Math.max(0, Math.floor(Number(milliseconds) / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

export function splitStopwatchElapsed(milliseconds) {
  const [main, fraction] = formatStopwatchElapsed(milliseconds).split(".");
  return {
    main,
    fraction: `.${fraction}`
  };
}
