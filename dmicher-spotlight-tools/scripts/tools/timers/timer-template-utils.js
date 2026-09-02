import {
  BUILTIN_BREAK_TEMPLATE_ID,
  DEFAULT_TIMER_DURATION_MS,
  TIMER_DISPLAY_STYLE,
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_VISIBILITY,
  clampTimerVolume,
  formatClockInput,
  parseDeadlineInput,
  parseDurationInput
} from "./timer-utils.js";

export { BUILTIN_BREAK_TEMPLATE_ID };

export const TIMER_TEMPLATE_STATE_VERSION = 1;
export const DEFAULT_TIMER_TEMPLATE_TIME = "00:10:00";
export const DEFAULT_BREAK_TEMPLATE_TIME = "00:15:00";

const MAX_TEMPLATE_ID_LENGTH = 80;
const MAX_TEMPLATE_NAME_LENGTH = 120;
const STANDARD_TIMER_SOUNDS = new Set([
  TIMER_SOUND.none,
  TIMER_SOUND.custom,
  TIMER_SOUND.signal1,
  TIMER_SOUND.signal2,
  TIMER_SOUND.signal3
]);
const BREAK_TIMER_SOUNDS = new Set([
  TIMER_SOUND.none,
  TIMER_SOUND.breakCustom,
  TIMER_SOUND.signal1,
  TIMER_SOUND.signal2,
  TIMER_SOUND.signal3
]);

export function createEmptyTimerTemplateState(now = Date.now()) {
  const builtIn = createBuiltInBreakTimerTemplate({}, now);
  return {
    version: TIMER_TEMPLATE_STATE_VERSION,
    templates: {
      [builtIn.id]: builtIn
    }
  };
}

export function createBuiltInBreakTimerTemplate(input = {}, now = Date.now()) {
  const timestamp = normalizeTimestamp(now, Date.now());
  const createdAt = normalizeTimestamp(input.createdAt, timestamp);
  return {
    id: BUILTIN_BREAK_TEMPLATE_ID,
    kind: TIMER_KIND.break,
    builtIn: true,
    name: "",
    mode: TIMER_MODE.duration,
    time: DEFAULT_BREAK_TEMPLATE_TIME,
    visibility: TIMER_VISIBILITY.public,
    style: input.style === TIMER_DISPLAY_STYLE.compact
      ? TIMER_DISPLAY_STYLE.compact
      : TIMER_DISPLAY_STYLE.prominent,
    sound: BREAK_TIMER_SOUNDS.has(input.sound) ? input.sound : TIMER_SOUND.breakCustom,
    volume: clampTimerVolume(input.volume),
    createdAt,
    updatedAt: normalizeTimestamp(input.updatedAt, createdAt)
  };
}

export function normalizeTimerTemplateState(rawState, now = Date.now()) {
  const source = rawState && (typeof rawState === "object") ? rawState : {};
  const state = {
    version: TIMER_TEMPLATE_STATE_VERSION,
    templates: {}
  };
  const templates = source.templates && (typeof source.templates === "object")
    ? source.templates
    : {};

  for (const [id, rawTemplate] of Object.entries(templates)) {
    const template = normalizeTimerTemplate(rawTemplate, id, now);
    if (template) state.templates[template.id] = template;
  }

  const rawBuiltIn = templates[BUILTIN_BREAK_TEMPLATE_ID];
  state.templates[BUILTIN_BREAK_TEMPLATE_ID] = createBuiltInBreakTimerTemplate(
    rawBuiltIn && (typeof rawBuiltIn === "object") ? rawBuiltIn : {},
    now
  );
  return state;
}

export function normalizeTimerTemplate(rawTemplate, fallbackId = "", now = Date.now()) {
  const source = rawTemplate && (typeof rawTemplate === "object") ? rawTemplate : {};
  const id = normalizeTemplateId(source.id || fallbackId);
  if (!id) return null;
  if (id === BUILTIN_BREAK_TEMPLATE_ID) return createBuiltInBreakTimerTemplate(source, now);
  if (source.kind === TIMER_KIND.break || source.builtIn === true) return null;

  const name = String(source.name ?? "").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH);
  if (!name) return null;
  const mode = source.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
  const time = normalizeTemplateTime(source, mode, now);
  if (!time) return null;

  const timestamp = normalizeTimestamp(now, Date.now());
  const createdAt = normalizeTimestamp(source.createdAt, timestamp);
  return {
    id,
    kind: TIMER_KIND.standard,
    builtIn: false,
    name,
    mode,
    time,
    visibility: source.visibility === TIMER_VISIBILITY.private
      ? TIMER_VISIBILITY.private
      : TIMER_VISIBILITY.public,
    style: source.style === TIMER_DISPLAY_STYLE.compact
      ? TIMER_DISPLAY_STYLE.compact
      : TIMER_DISPLAY_STYLE.prominent,
    sound: STANDARD_TIMER_SOUNDS.has(source.sound) ? source.sound : TIMER_SOUND.none,
    volume: clampTimerVolume(source.volume),
    createdAt,
    updatedAt: normalizeTimestamp(source.updatedAt, createdAt)
  };
}

export function cloneTimerTemplateState(state) {
  return foundry.utils.deepClone(normalizeTimerTemplateState(state));
}

export function listTimerTemplates(state) {
  return Object.values(state?.templates ?? {}).sort((left, right) => {
    if (left.builtIn !== right.builtIn) return left.builtIn ? -1 : 1;
    const createdDifference = (Number(left.createdAt) || 0) - (Number(right.createdAt) || 0);
    return createdDifference || left.name.localeCompare(right.name);
  });
}

export function createStandardTimerTemplate(input, {
  id,
  now = Date.now(),
  createdAt = now
} = {}) {
  return normalizeTimerTemplate({
    ...input,
    id,
    kind: TIMER_KIND.standard,
    builtIn: false,
    createdAt,
    updatedAt: now
  }, id, now);
}

export function timerToTemplateInput(timer) {
  const mode = timer?.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
  return {
    name: String(timer?.name ?? "").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH),
    mode,
    time: mode === TIMER_MODE.deadline
      ? formatClockInput(timer?.endsAt)
      : formatDurationMilliseconds(timer?.duration),
    visibility: timer?.visibility,
    style: timer?.style,
    sound: timer?.sound,
    volume: timer?.volume
  };
}

export function formatDurationMilliseconds(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function normalizeTemplateTime(source, mode, now) {
  if (mode === TIMER_MODE.deadline) {
    const explicitDeadline = Number(source.deadlineTimestamp);
    if (Number.isFinite(explicitDeadline) && explicitDeadline > 0) {
      return formatClockInput(explicitDeadline);
    }
    const parsedDeadline = parseDeadlineInput(source.time, now);
    return parsedDeadline ? formatClockInput(parsedDeadline) : formatClockInput(Number(now) + DEFAULT_TIMER_DURATION_MS);
  }

  const explicitDuration = Number(source.durationMilliseconds);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return formatDurationMilliseconds(explicitDuration);
  }
  const parsedDuration = parseDurationInput(source.time);
  return parsedDuration ? formatDurationMilliseconds(parsedDuration) : DEFAULT_TIMER_TEMPLATE_TIME;
}

function normalizeTemplateId(value) {
  return String(value ?? "").trim().slice(0, MAX_TEMPLATE_ID_LENGTH);
}

function normalizeTimestamp(value, fallback) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Number(fallback) || Date.now();
}
