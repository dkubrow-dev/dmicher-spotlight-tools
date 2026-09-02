import assert from "node:assert/strict";
import test from "node:test";

import {
  POLL_DEFAULTS_VERSION,
  normalizePollState
} from "../dmicher-spotlight-tools/scripts/tools/polls/poll-utils.js";
import {
  BUILTIN_BREAK_TEMPLATE_ID,
  TIMER_STATE_VERSION,
  formatHourMinuteInput,
  normalizeTimer,
  normalizeTimerState,
  parseHourMinuteDeadline,
  parseHourMinuteDuration
} from "../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js";

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => "generated-id"
  }
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key) => key
  }
};

test("legacy poll selection migrates into template participants without persisting duplicate state", () => {
  const state = normalizePollState({
    defaultsVersion: POLL_DEFAULTS_VERSION,
    selected: { "player-1": true, "player-2": false },
    templates: {
      legacy: {
        id: "legacy",
        name: "Legacy poll",
        question: "Ready?",
        type: "buttons",
        options: [{ id: "yes", label: "Yes", enabled: true }],
        createdAt: 1,
        updatedAt: 1
      }
    },
    activePoll: null,
    lastRuns: {}
  });

  assert.equal(Object.hasOwn(state, "selected"), false);
  assert.deepEqual(state.templates.legacy.participants, { "player-1": true });
});

test("obsolete timer messageId is dropped during state normalization", () => {
  const timer = normalizeTimer({
    id: "timer-1",
    name: "Timer",
    startAt: 1_000,
    endsAt: 2_000,
    duration: 1_000,
    sound: "custom",
    volume: 4,
    messageId: "obsolete-chat-message"
  });
  assert.ok(timer);
  assert.equal(timer.sound, "custom");
  assert.equal(timer.volume, 1);
  assert.equal(Object.hasOwn(timer, "messageId"), false);

  const state = normalizeTimerState({ timers: { "timer-1": timer } });
  assert.equal(Object.hasOwn(state.timers["timer-1"], "messageId"), false);
});

test("legacy timer state migrates to v2 and links break instances to the built-in template", () => {
  const state = normalizeTimerState({
    version: 1,
    timers: {
      standard: {
        id: "standard",
        name: "Standard",
        startAt: 1_000,
        endsAt: 2_000,
        duration: 1_000,
        templateId: "saved-template"
      },
      break: {
        id: "break",
        name: "Legacy break name",
        kind: "break",
        startAt: 1_000,
        endsAt: 2_000,
        duration: 1_000,
        visibility: "private"
      }
    }
  });

  assert.equal(state.version, TIMER_STATE_VERSION);
  assert.equal(state.timers.standard.templateId, "saved-template");
  assert.equal(state.timers.break.templateId, BUILTIN_BREAK_TEMPLATE_ID);
  assert.equal(state.timers.break.visibility, "public");
});

test("HH:MM helpers parse duration and next local deadline strictly", () => {
  const now = new Date(2026, 8, 2, 23, 50, 35).getTime();
  const nextDeadline = new Date(2026, 8, 3, 0, 5, 0).getTime();

  assert.equal(parseHourMinuteDuration("01:15"), 4_500_000);
  assert.equal(parseHourMinuteDuration("1:15"), null);
  assert.equal(parseHourMinuteDuration("00:00"), null);
  assert.equal(parseHourMinuteDuration("01:60"), null);
  assert.equal(parseHourMinuteDeadline("00:05", now), nextDeadline);
  assert.equal(parseHourMinuteDeadline("24:00", now), null);
  assert.equal(formatHourMinuteInput(nextDeadline), "00:05");
});
