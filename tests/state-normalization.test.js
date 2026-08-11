import assert from "node:assert/strict";
import test from "node:test";

import {
  POLL_DEFAULTS_VERSION,
  normalizePollState
} from "../dmicher-spotlight-tools/scripts/tools/polls/poll-utils.js";
import {
  normalizeTimer,
  normalizeTimerState
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
    messageId: "obsolete-chat-message"
  });
  assert.ok(timer);
  assert.equal(Object.hasOwn(timer, "messageId"), false);

  const state = normalizeTimerState({ timers: { "timer-1": timer } });
  assert.equal(Object.hasOwn(state.timers["timer-1"], "messageId"), false);
});
