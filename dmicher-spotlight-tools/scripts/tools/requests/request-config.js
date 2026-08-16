import {
  MODULE_ID,
  REQUEST_LIMIT_MODES,
  REQUEST_TIMEOUT_MODES,
  REQUEST_TYPES,
  SETTINGS,
  normalizeRequestType
} from "../../config.js";

const LIMITED_TYPES = Object.freeze(["common", "urgent"]);
const RESOURCE_TYPES = Object.freeze(Object.keys(REQUEST_TYPES));
const TIMER_RESOURCE_TYPES = Object.freeze(["timer", "break"]);
export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export function createDefaultRequestConfiguration() {
  return {
    chatEnabled: true,
    soundsEnabled: true,
    blockWhenEnvironment: false,
    showWelcome: true,
    feed: {
      enabled: true,
      showTime: false
    },
    images: Object.fromEntries(RESOURCE_TYPES.map((type) => [type, {
      custom: false,
      url: ""
    }])),
    sounds: Object.fromEntries(RESOURCE_TYPES.map((type) => [type, {
      custom: false,
      url: "",
      volume: 1
    }])),
    timerSounds: Object.fromEntries(TIMER_RESOURCE_TYPES.map((type) => [type, {
      custom: false,
      url: "",
      volume: 1
    }])),
    limits: Object.fromEntries(LIMITED_TYPES.map((type) => [type, {
      mode: REQUEST_LIMIT_MODES.none,
      count: 1,
      timeoutMode: REQUEST_TIMEOUT_MODES.none,
      timeoutDuration: DEFAULT_REQUEST_TIMEOUT_MS
    }]))
  };
}

export function createDefaultActiveRequestState() {
  return {
    initialized: false,
    revision: 0,
    entries: [],
    cooldowns: {}
  };
}

export function registerRequestWorldSettings({ onConfigurationChanged, onActiveRequestsChanged } = {}) {
  game.settings.register(MODULE_ID, SETTINGS.requestConfiguration, {
    scope: "world",
    config: false,
    type: Object,
    default: createDefaultRequestConfiguration(),
    onChange: onConfigurationChanged
  });

  game.settings.register(MODULE_ID, SETTINGS.activeRequests, {
    scope: "world",
    config: false,
    type: Object,
    default: createDefaultActiveRequestState(),
    onChange: onActiveRequestsChanged
  });
}

export function getRequestConfiguration() {
  const value = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.requestConfiguration);
  return normalizeRequestConfiguration(value);
}

export function getActiveRequestState() {
  const value = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.activeRequests);
  return normalizeActiveRequestState(value);
}

export function normalizeRequestConfiguration(value) {
  const defaults = createDefaultRequestConfiguration();
  const source = value && typeof value === "object" ? value : {};
  const result = {
    chatEnabled: source.chatEnabled !== false,
    soundsEnabled: source.soundsEnabled !== false,
    blockWhenEnvironment: Boolean(source.blockWhenEnvironment),
    showWelcome: source.showWelcome !== false,
    feed: {
      enabled: source.feed?.enabled !== false,
      showTime: Boolean(source.feed?.showTime)
    },
    images: {},
    sounds: {},
    timerSounds: {},
    limits: {}
  };

  for (const type of RESOURCE_TYPES) {
    const image = source.images?.[type] ?? {};
    const sound = source.sounds?.[type] ?? {};
    result.images[type] = {
      custom: Boolean(image.custom),
      url: normalizeResourceUrl(image.url)
    };
    result.sounds[type] = {
      custom: Boolean(sound.custom),
      url: normalizeResourceUrl(sound.url),
      volume: clampVolume(sound.volume)
    };
  }

  for (const type of TIMER_RESOURCE_TYPES) {
    const sound = source.timerSounds?.[type] ?? {};
    result.timerSounds[type] = {
      custom: Boolean(sound.custom),
      url: normalizeResourceUrl(sound.url),
      volume: clampVolume(sound.volume)
    };
  }

  for (const type of LIMITED_TYPES) {
    const limit = source.limits?.[type] ?? defaults.limits[type];
    const mode = Object.values(REQUEST_LIMIT_MODES).includes(limit.mode)
      ? limit.mode
      : REQUEST_LIMIT_MODES.none;
    const timeoutMode = Object.values(REQUEST_TIMEOUT_MODES).includes(limit.timeoutMode)
      ? limit.timeoutMode
      : REQUEST_TIMEOUT_MODES.none;
    result.limits[type] = {
      mode,
      count: clampRequestCount(limit.count),
      timeoutMode,
      timeoutDuration: clampRequestTimeoutDuration(limit.timeoutDuration)
    };
  }
  return result;
}

export function normalizeActiveRequestState(value) {
  const source = value && typeof value === "object" ? value : {};
  const entries = Array.isArray(source.entries)
    ? source.entries.map(normalizeActiveRequestEntry).filter(Boolean)
    : [];
  const unique = new Map();
  for (const entry of entries) unique.set(entry.id, entry);
  const normalizedEntries = Array.from(unique.values()).sort(compareRequestEntries);
  const cooldowns = normalizeRequestCooldowns(source.cooldowns);
  const state = {
    initialized: Boolean(source.initialized),
    revision: Math.max(0, Math.trunc(Number(source.revision) || 0)),
    entries: normalizedEntries,
    cooldowns
  };
  for (const entry of normalizedEntries) {
    recordRequestTimeoutEvent(state, entry.urgency, entry.authorId, "submission", entry.submittedAt);
  }
  return state;
}

export function normalizeActiveRequestEntry(value) {
  if (!value || typeof value !== "object" || !value.id || !value.authorId) return null;
  const type = normalizeRequestType(value.urgency);
  return {
    id: String(value.id).slice(0, 100),
    messageId: String(value.messageId ?? "").slice(0, 100),
    urgency: type,
    authorId: String(value.authorId).slice(0, 100),
    authorName: String(value.authorName ?? "").slice(0, 100),
    characterName: String(value.characterName ?? value.tokenName ?? "").slice(0, 100),
    actorId: String(value.actorId ?? "").slice(0, 100),
    tokenId: String(value.tokenId ?? "").slice(0, 100),
    sceneId: String(value.sceneId ?? "").slice(0, 100),
    portrait: normalizeResourceUrl(value.portrait),
    submittedAt: finiteTimestamp(value.submittedAt),
    createdAt: finiteTimestamp(value.createdAt),
    sequence: Math.max(0, Math.trunc(Number(value.sequence) || 0))
  };
}

export function getRequestImage(type, configuration = getRequestConfiguration()) {
  type = normalizeRequestType(type);
  const custom = configuration.images?.[type];
  return custom?.custom && custom.url ? custom.url : REQUEST_TYPES[type].image;
}

export function getRequestSound(type, configuration = getRequestConfiguration()) {
  type = normalizeRequestType(type);
  const custom = configuration.sounds?.[type];
  return custom?.custom && custom.url ? custom.url : REQUEST_TYPES[type].sound;
}

export function getRequestBaseVolume(type, configuration = getRequestConfiguration()) {
  if (!configuration.soundsEnabled) return 0;
  return clampVolume(configuration.sounds?.[normalizeRequestType(type)]?.volume);
}

export function getCustomTimerSound(type, configuration = getRequestConfiguration()) {
  const sound = configuration.timerSounds?.[TIMER_RESOURCE_TYPES.includes(type) ? type : "timer"];
  return sound?.custom && sound.url ? sound.url : "";
}

export function getCustomTimerSoundVolume(type, configuration = getRequestConfiguration()) {
  const sound = configuration.timerSounds?.[TIMER_RESOURCE_TYPES.includes(type) ? type : "timer"];
  return sound?.custom && sound.url ? clampVolume(sound.volume) : 1;
}

export function getRequestLimitViolation(type, authorId, stateOrEntries, configuration = getRequestConfiguration(), now = Date.now()) {
  type = normalizeRequestType(type);
  const state = Array.isArray(stateOrEntries)
    ? { entries: stateOrEntries, cooldowns: {} }
    : (stateOrEntries ?? { entries: [], cooldowns: {} });
  const entries = Array.isArray(state.entries) ? state.entries : [];
  if (configuration.blockWhenEnvironment && entries.some((entry) => (
    normalizeRequestType(entry.urgency) === "stop"
  ))) return "environment";
  if (REQUEST_TYPES[type].moderatorOnly) return null;
  const limit = configuration.limits?.[type];
  if (limit?.mode === REQUEST_LIMIT_MODES.forbidden) return "forbidden";
  if (limit?.mode === REQUEST_LIMIT_MODES.count) {
    const count = entries.filter((entry) => (
      entry.authorId === authorId && normalizeRequestType(entry.urgency) === type
    )).length;
    if (count >= clampRequestCount(limit.count)) return "count";
  }
  if (getRequestTimeoutStatus(type, authorId, state, configuration, now).active) return "timeout";
  return null;
}

export function getRequestTimeoutStatus(type, authorId, state, configuration = getRequestConfiguration(), now = Date.now()) {
  type = normalizeRequestType(type);
  const limit = configuration.limits?.[type];
  const mode = Object.values(REQUEST_TIMEOUT_MODES).includes(limit?.timeoutMode)
    ? limit.timeoutMode
    : REQUEST_TIMEOUT_MODES.none;
  const duration = clampRequestTimeoutDuration(limit?.timeoutDuration);
  const event = state?.cooldowns?.[String(authorId ?? "")]?.[type] ?? {};
  const startedAt = mode === REQUEST_TIMEOUT_MODES.submission
    ? Number(event.submittedAt) || 0
    : mode === REQUEST_TIMEOUT_MODES.grant
      ? Number(event.grantedAt) || 0
      : 0;
  const expiresAt = startedAt > 0 ? startedAt + duration : 0;
  const remaining = Math.max(0, expiresAt - Number(now));
  return {
    active: mode !== REQUEST_TIMEOUT_MODES.none && remaining > 0,
    mode,
    duration,
    startedAt,
    expiresAt,
    remaining
  };
}

export function recordRequestTimeoutEvent(state, type, authorId, event, timestamp = Date.now()) {
  type = normalizeRequestType(type);
  if (!LIMITED_TYPES.includes(type) || !authorId) return false;
  const key = event === "grant" ? "grantedAt" : event === "submission" ? "submittedAt" : "";
  const value = normalizeHistoricalTimestamp(timestamp);
  if (!key || !value) return false;
  state.cooldowns ??= {};
  const userId = String(authorId).slice(0, 100);
  state.cooldowns[userId] ??= {};
  state.cooldowns[userId][type] ??= {};
  state.cooldowns[userId][type][key] = Math.max(
    Number(state.cooldowns[userId][type][key]) || 0,
    value
  );
  return true;
}

export function clampRequestTimeoutDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.max(1000, Math.round(number / 1000) * 1000);
}

export function clampVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 1;
}

export function clampRequestCount(value) {
  const number = Math.trunc(Number(value) || 1);
  return Math.min(10, Math.max(1, number));
}

function normalizeRequestCooldowns(value) {
  const source = value && typeof value === "object" ? value : {};
  const records = [];
  for (const [rawUserId, rawTypes] of Object.entries(source)) {
    const userId = String(rawUserId).slice(0, 100);
    if (!userId || !rawTypes || typeof rawTypes !== "object") continue;
    const types = {};
    for (const type of LIMITED_TYPES) {
      const rawEvent = rawTypes[type];
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const event = {};
      const submittedAt = normalizeHistoricalTimestamp(rawEvent.submittedAt);
      const grantedAt = normalizeHistoricalTimestamp(rawEvent.grantedAt);
      if (submittedAt) event.submittedAt = submittedAt;
      if (grantedAt) event.grantedAt = grantedAt;
      if (Object.keys(event).length) types[type] = event;
    }
    if (Object.keys(types).length) records.push([userId, types]);
  }
  return Object.fromEntries(records);
}

function normalizeHistoricalTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function compareRequestEntries(left, right) {
  return (Number(left.sequence) - Number(right.sequence))
    || (Number(left.submittedAt) - Number(right.submittedAt))
    || left.id.localeCompare(right.id);
}

function normalizeResourceUrl(value) {
  const url = String(value ?? "").trim().slice(0, 2048);
  if (/^(?:javascript|vbscript|data|blob):/i.test(url)) return "";
  return url;
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Date.now();
}
