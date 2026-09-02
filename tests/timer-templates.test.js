import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value)
  }
};

const {
  BUILTIN_BREAK_TEMPLATE_ID,
  TIMER_TEMPLATE_STATE_VERSION,
  createStandardTimerTemplate,
  normalizeTimerTemplateState,
  timerToTemplateInput
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-template-utils.js");
const {
  TIMER_DISPLAY_STYLE,
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_VISIBILITY,
  formatClockInput
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js");

test("timer template normalization always restores the immutable break identity", () => {
  const now = Date.UTC(2026, 8, 2, 10, 0, 0);
  const state = normalizeTimerTemplateState({
    version: 99,
    templates: {
      [BUILTIN_BREAK_TEMPLATE_ID]: {
        id: BUILTIN_BREAK_TEMPLATE_ID,
        name: "Persisted name must not win",
        kind: TIMER_KIND.standard,
        builtIn: false,
        mode: TIMER_MODE.deadline,
        time: "23:59:59",
        visibility: TIMER_VISIBILITY.private,
        style: TIMER_DISPLAY_STYLE.compact,
        sound: TIMER_SOUND.signal2,
        volume: 0.4
      }
    }
  }, now);

  assert.equal(state.version, TIMER_TEMPLATE_STATE_VERSION);
  assert.deepEqual(Object.keys(state.templates), [BUILTIN_BREAK_TEMPLATE_ID]);
  assert.deepEqual(state.templates[BUILTIN_BREAK_TEMPLATE_ID], {
    id: BUILTIN_BREAK_TEMPLATE_ID,
    kind: TIMER_KIND.break,
    builtIn: true,
    name: "",
    mode: TIMER_MODE.duration,
    time: "00:15:00",
    visibility: TIMER_VISIBILITY.public,
    style: TIMER_DISPLAY_STYLE.compact,
    sound: TIMER_SOUND.signal2,
    volume: 0.4,
    createdAt: now,
    updatedAt: now
  });
});

test("standard templates store duration and deadline values canonically", () => {
  const now = Date.UTC(2026, 8, 2, 10, 0, 0);
  const duration = createStandardTimerTemplate({
    name: "Duration",
    mode: TIMER_MODE.duration,
    time: "1:02:03",
    visibility: TIMER_VISIBILITY.private,
    style: TIMER_DISPLAY_STYLE.compact,
    sound: TIMER_SOUND.signal3,
    volume: 0.25
  }, { id: "duration", now });
  const deadline = createStandardTimerTemplate({
    name: "Deadline",
    mode: TIMER_MODE.deadline,
    time: "21:07:00"
  }, { id: "deadline", now });

  assert.equal(duration.time, "01:02:03");
  assert.equal(duration.createdAt, now);
  assert.equal(duration.updatedAt, now);
  assert.equal(deadline.time, "21:07:00");
});

test("saving an active timer preserves the semantic time for each mode", () => {
  const durationInput = timerToTemplateInput({
    name: "Duration",
    mode: TIMER_MODE.duration,
    duration: 3_723_001
  });
  const deadlineTimestamp = new Date(2026, 8, 2, 21, 7, 8).getTime();
  const deadlineInput = timerToTemplateInput({
    name: "Deadline",
    mode: TIMER_MODE.deadline,
    duration: 3_723_001,
    endsAt: deadlineTimestamp
  });

  assert.equal(durationInput.time, "01:02:04");
  assert.equal(deadlineInput.time, formatClockInput(deadlineTimestamp));
});
