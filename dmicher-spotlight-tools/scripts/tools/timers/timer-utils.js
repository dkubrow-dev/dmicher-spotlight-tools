export const TIMER_VISIBILITY = Object.freeze({
  public: "public",
  private: "private"
});

export const TIMER_DISPLAY_STYLE = Object.freeze({
  prominent: "prominent",
  compact: "compact"
});

export const TIMER_MODE = Object.freeze({
  duration: "duration",
  deadline: "deadline"
});

export const TIMER_SOUND = Object.freeze({
  none: "none",
  signal1: "signal1",
  signal2: "signal2",
  signal3: "signal3"
});

export const TIMER_TICK_MS = 1000;
export const DEFAULT_TIMER_DURATION_MS = 10 * 60 * 1000;

export function createEmptyTimerState() {
  return {
    version: 1,
    timers: {}
  };
}

export function normalizeTimerState(rawState) {
  const state = createEmptyTimerState();
  const timers = rawState?.timers && (typeof rawState.timers === "object") ? rawState.timers : {};

  for (const [id, timer] of Object.entries(timers)) {
    if (!timer || (typeof timer !== "object")) continue;
    const normalized = normalizeTimer({ ...timer, id });
    if (normalized) state.timers[normalized.id] = normalized;
  }

  return state;
}

export function normalizeTimer(timer) {
  const id = String(timer?.id ?? "").trim();
  const name = String(timer?.name ?? "").trim().slice(0, 120);
  const startAt = Number(timer?.startAt);
  const endsAt = Number(timer?.endsAt);
  const duration = Number(timer?.duration);
  if (!id || !name || !Number.isFinite(startAt) || !Number.isFinite(endsAt) || !Number.isFinite(duration)) return null;
  if (duration <= 0 || endsAt <= startAt) return null;

  const visibility = timer.visibility === TIMER_VISIBILITY.private ? TIMER_VISIBILITY.private : TIMER_VISIBILITY.public;
  const style = timer.style === TIMER_DISPLAY_STYLE.compact ? TIMER_DISPLAY_STYLE.compact : TIMER_DISPLAY_STYLE.prominent;
  const sound = Object.values(TIMER_SOUND).includes(timer.sound) ? timer.sound : TIMER_SOUND.none;

  return {
    id,
    name,
    mode: timer.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration,
    startAt,
    endsAt,
    duration,
    visibility,
    style,
    sound,
    messageId: String(timer.messageId ?? "").trim(),
    createdBy: String(timer.createdBy ?? "").trim(),
    createdByName: String(timer.createdByName ?? "").trim(),
    createdAt: Number(timer.createdAt) || startAt
  };
}

export function cloneTimerState(state) {
  return foundry.utils.deepClone(normalizeTimerState(state));
}

export function listTimers(state) {
  return Object.values(normalizeTimerState(state).timers).sort((left, right) => {
    return (left.createdAt - right.createdAt) || left.name.localeCompare(right.name);
  });
}

export function isTimerExpired(timer, now = Date.now()) {
  return Number(now) >= Number(timer?.endsAt ?? 0);
}

export function getRemainingMilliseconds(timer, now = Date.now()) {
  return Math.max(0, Number(timer?.endsAt ?? 0) - Number(now));
}

export function parseDurationInput(value) {
  const parts = parseClockParts(value);
  if (!parts) return null;
  const [hours, minutes, seconds] = parts;
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  return totalSeconds > 0 ? totalSeconds * 1000 : null;
}

export function parseDeadlineInput(value, now = Date.now()) {
  const parts = parseClockParts(value);
  if (!parts) return null;

  const [hours, minutes, seconds] = parts;
  if (hours > 23) return null;
  const target = new Date(Number(now));
  target.setHours(hours, minutes, seconds, 0);
  if (target.getTime() <= Number(now)) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export function formatClockInput(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function buildTimerDefaults(timerCount, now = Date.now()) {
  return {
    name: game.i18n.format("DMICHERSPOTLIGHTTOOLS.Timers.DefaultName", { number: timerCount + 1 }),
    durationTime: "00:10:00",
    deadlineTime: formatClockInput(Number(now) + DEFAULT_TIMER_DURATION_MS)
  };
}

function parseClockParts(value) {
  const segments = String(value ?? "").trim().split(":");
  if (segments.length < 1 || segments.length > 3) return null;
  if (segments.some((segment) => !/^\d+$/.test(segment))) return null;

  const numbers = segments.map((segment) => Number(segment));
  const [hours, minutes, seconds] = numbers.length === 3
    ? numbers
    : numbers.length === 2
      ? [0, numbers[0], numbers[1]]
      : [0, 0, numbers[0]];
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  if (minutes > 59 || seconds > 59) return null;
  return [hours, minutes, seconds];
}
