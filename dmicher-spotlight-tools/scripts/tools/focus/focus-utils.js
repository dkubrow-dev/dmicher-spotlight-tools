export const PLAYER_STATUS = Object.freeze({
  playing: "playing",
  listening: "listening",
  away: "away",
  unavailable: "unavailable"
});

export const PLAYER_STATUS_CONFIG = Object.freeze({
  [PLAYER_STATUS.playing]: Object.freeze({
    labelKey: "Focus.Status.Playing.Label",
    descriptionKey: "Focus.Status.Playing.Description",
    indicator: "good"
  }),
  [PLAYER_STATUS.listening]: Object.freeze({
    labelKey: "Focus.Status.Listening.Label",
    descriptionKey: "Focus.Status.Listening.Description",
    indicator: "doubt"
  }),
  [PLAYER_STATUS.away]: Object.freeze({
    labelKey: "Focus.Status.Away.Label",
    descriptionKey: "Focus.Status.Away.Description",
    indicator: "problem"
  }),
  [PLAYER_STATUS.unavailable]: Object.freeze({
    labelKey: "Focus.Status.Unavailable.Label",
    descriptionKey: "Focus.Status.Unavailable.Description",
    indicator: "deadline"
  })
});

export const INDICATOR_LEVEL = Object.freeze({
  good: "good",
  doubt: "doubt",
  problem: "problem",
  deadline: "deadline",
  muted: "muted"
});

export const INDICATOR_LABEL_KEYS = Object.freeze({
  [INDICATOR_LEVEL.good]: "Focus.Indicators.Good",
  [INDICATOR_LEVEL.doubt]: "Focus.Indicators.Doubt",
  [INDICATOR_LEVEL.problem]: "Focus.Indicators.Problem",
  [INDICATOR_LEVEL.deadline]: "Focus.Indicators.Deadline",
  [INDICATOR_LEVEL.muted]: "Focus.Indicators.Muted"
});

export const AUDIT_METRICS = Object.freeze({
  lastRequest: Object.freeze({
    timestampKey: "lastRequestAt",
    titleKey: "Focus.Audit.Metrics.LastRequest.Title",
    descriptionKey: "Focus.Audit.Metrics.LastRequest.Description",
    abbreviationKey: "Focus.Audit.Columns.LastRequest"
  }),
  activeRequest: Object.freeze({
    timestampKey: "activeRequestAt",
    titleKey: "Focus.Audit.Metrics.ActiveRequest.Title",
    descriptionKey: "Focus.Audit.Metrics.ActiveRequest.Description",
    abbreviationKey: "Focus.Audit.Columns.ActiveRequest"
  }),
  lastChat: Object.freeze({
    timestampKey: "lastChatAt",
    titleKey: "Focus.Audit.Metrics.LastChat.Title",
    descriptionKey: "Focus.Audit.Metrics.LastChat.Description",
    abbreviationKey: "Focus.Audit.Columns.LastChat"
  }),
  lastGranted: Object.freeze({
    timestampKey: "lastGrantedAt",
    titleKey: "Focus.Audit.Metrics.LastGranted.Title",
    descriptionKey: "Focus.Audit.Metrics.LastGranted.Description",
    abbreviationKey: "Focus.Audit.Columns.LastGranted"
  })
});

export const DEFAULT_AUDIT_THRESHOLDS = Object.freeze({
  lastRequest: Object.freeze({ doubt: 20, problem: 30, deadline: 60 }),
  activeRequest: Object.freeze({ doubt: 10, problem: 15, deadline: 25 }),
  lastChat: Object.freeze({ doubt: 30, problem: 50, deadline: 60 }),
  lastGranted: Object.freeze({ doubt: 15, problem: 25, deadline: 30 })
});

const FOCUS_AUDIT_STATE_VERSION = 1;

export function createEmptyFocusAuditState() {
  return { version: FOCUS_AUDIT_STATE_VERSION, players: {} };
}

export function normalizePlayerStatus(status) {
  return Object.hasOwn(PLAYER_STATUS_CONFIG, status) ? status : PLAYER_STATUS.unavailable;
}

export function normalizeFocusAuditState(rawState) {
  const state = rawState && (typeof rawState === "object") ? rawState : {};
  const migrateEnabledDefault = state.version !== FOCUS_AUDIT_STATE_VERSION;
  const players = {};
  for (const [userId, rawEntry] of Object.entries(state.players ?? {})) {
    players[userId] = normalizeAuditEntry(rawEntry, { forceEnabled: migrateEnabledDefault });
  }
  return { version: FOCUS_AUDIT_STATE_VERSION, players };
}

export function normalizeAuditEntry(rawEntry, { forceEnabled = false } = {}) {
  const entry = rawEntry && (typeof rawEntry === "object") ? rawEntry : {};
  const activeRequests = {};
  for (const [messageId, timestamp] of Object.entries(entry.activeRequests ?? {})) {
    const value = Number(timestamp);
    if (messageId && Number.isFinite(value)) activeRequests[messageId] = value;
  }

  return {
    enabled: forceEnabled ? true : (typeof entry.enabled === "boolean" ? entry.enabled : true),
    selfStatus: normalizePlayerStatus(entry.selfStatus),
    lastRequestAt: normalizeTimestamp(entry.lastRequestAt),
    activeRequestAt: normalizeTimestamp(entry.activeRequestAt),
    lastChatAt: normalizeTimestamp(entry.lastChatAt),
    lastGrantedAt: normalizeTimestamp(entry.lastGrantedAt),
    activeRequests
  };
}

export function createCleanAuditEntry(existingEntry = {}, now = Date.now()) {
  return {
    enabled: typeof existingEntry.enabled === "boolean" ? existingEntry.enabled : true,
    selfStatus: normalizePlayerStatus(existingEntry.selfStatus),
    lastRequestAt: now,
    activeRequestAt: now,
    lastChatAt: now,
    lastGrantedAt: now,
    activeRequests: {}
  };
}

export function normalizeAuditThresholds(rawThresholds) {
  const thresholds = {};
  for (const key of Object.keys(AUDIT_METRICS)) {
    thresholds[key] = normalizeThresholdBlock(rawThresholds?.[key], DEFAULT_AUDIT_THRESHOLDS[key]);
  }
  return thresholds;
}

export function normalizeThresholdBlock(rawBlock, defaults) {
  const doubt = normalizeMinutes(rawBlock?.doubt, defaults.doubt);
  const problem = Math.max(doubt, normalizeMinutes(rawBlock?.problem, defaults.problem));
  const deadline = Math.max(problem, normalizeMinutes(rawBlock?.deadline, defaults.deadline));
  return { doubt, problem, deadline };
}

export function getIndicatorLevel(timestamp, thresholds, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return INDICATOR_LEVEL.muted;

  const elapsedMinutes = Math.max(0, (now - value) / 60000);
  if (elapsedMinutes >= thresholds.deadline) return INDICATOR_LEVEL.deadline;
  if (elapsedMinutes >= thresholds.problem) return INDICATOR_LEVEL.problem;
  if (elapsedMinutes >= thresholds.doubt) return INDICATOR_LEVEL.doubt;
  return INDICATOR_LEVEL.good;
}

export function getActiveRequestTimestamp(entry, now = Date.now()) {
  const timestamps = Object.values(entry.activeRequests ?? {})
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (timestamps.length) return Math.min(...timestamps);
  return Number(entry.activeRequestAt) || now;
}

export function sortRowsByEnabledAndName(left, right) {
  if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
  return left.name.localeCompare(right.name, game.i18n.lang);
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeMinutes(value, fallback) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : fallback;
}
