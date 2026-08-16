import assert from "node:assert/strict";
import test from "node:test";

import { REQUEST_LIMIT_MODES, REQUEST_TIMEOUT_MODES } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  createDefaultActiveRequestState,
  createDefaultRequestConfiguration,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_URGENT_REQUEST_TIMEOUT_MS,
  getRequestBaseVolume,
  getRequestLimitViolation,
  getRequestTimeoutStatus,
  hasConfiguredRequestTimeouts,
  normalizeActiveRequestState,
  normalizeRequestConfiguration,
  recordRequestTimeoutEvent
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-config.js";

test("fresh-world request configuration matches the 1.2.0 policy", () => {
  const configuration = createDefaultRequestConfiguration();
  const activeState = createDefaultActiveRequestState();
  assert.equal(activeState.cooldownsResetAt, 0);
  assert.equal(configuration.chatEnabled, true);
  assert.equal(configuration.soundsEnabled, true);
  assert.equal(configuration.feed.enabled, true);
  assert.equal(configuration.feed.showTime, true);
  assert.equal(configuration.showWelcome, true);
  assert.equal(configuration.blockWhenEnvironment, true);
  assert.equal(configuration.limits.common.mode, REQUEST_LIMIT_MODES.none);
  assert.equal(configuration.limits.urgent.mode, REQUEST_LIMIT_MODES.count);
  assert.equal(configuration.limits.urgent.count, 1);
  assert.equal(configuration.limits.common.timeoutMode, REQUEST_TIMEOUT_MODES.none);
  assert.equal(configuration.limits.urgent.timeoutMode, REQUEST_TIMEOUT_MODES.grant);
  assert.equal(configuration.limits.urgent.timeoutDuration, DEFAULT_URGENT_REQUEST_TIMEOUT_MS);
  for (const type of ["common", "urgent", "stop"]) {
    assert.equal(configuration.images[type].custom, false);
    assert.equal(configuration.sounds[type].custom, false);
    assert.equal(configuration.sounds[type].volume, 1);
  }
  for (const type of ["timer", "break"]) {
    assert.equal(configuration.timerSounds[type].custom, false);
    assert.equal(configuration.timerSounds[type].url, "");
    assert.equal(configuration.timerSounds[type].volume, 1);
  }
});

test("request configuration clamps volumes and counts", () => {
  const configuration = normalizeRequestConfiguration({
    sounds: {
      common: { custom: true, url: " https://example.test/a.ogg ", volume: 4 },
      urgent: { volume: -1 }
    },
    timerSounds: {
      timer: { custom: true, url: " https://example.test/timer.ogg ", volume: 0.4 },
      break: { custom: true, url: "javascript:bad", volume: -2 }
    },
    limits: {
      common: { mode: "count", count: 99, timeoutMode: "submission", timeoutDuration: 90000 },
      urgent: { mode: "unexpected", count: 0, timeoutMode: "unexpected", timeoutDuration: 0 }
    }
  });
  assert.equal(configuration.sounds.common.url, "https://example.test/a.ogg");
  assert.equal(configuration.sounds.common.volume, 1);
  assert.equal(configuration.sounds.urgent.volume, 0);
  assert.deepEqual(configuration.timerSounds.timer, {
    custom: true,
    url: "https://example.test/timer.ogg",
    volume: 0.4
  });
  assert.deepEqual(configuration.timerSounds.break, {
    custom: true,
    url: "",
    volume: 0
  });
  assert.deepEqual(configuration.limits.common, {
    mode: "count",
    count: 10,
    timeoutMode: "submission",
    timeoutDuration: 90000
  });
  assert.deepEqual(configuration.limits.urgent, {
    mode: "count",
    count: 1,
    timeoutMode: "grant",
    timeoutDuration: DEFAULT_URGENT_REQUEST_TIMEOUT_MS
  });
  configuration.soundsEnabled = false;
  assert.equal(getRequestBaseVolume("common", configuration), 0);

  const explicitOptOut = normalizeRequestConfiguration({
    blockWhenEnvironment: false,
    feed: { showTime: false }
  });
  assert.equal(explicitOptOut.blockWhenEnvironment, false);
  assert.equal(explicitOptOut.feed.showTime, false);
});

test("anti-spam detects count, environment, and forbidden violations", () => {
  const entries = [
    { id: "one", authorId: "player", urgency: "common" },
    { id: "environment", authorId: "gm", urgency: "stop" }
  ];
  let configuration = normalizeRequestConfiguration({
    blockWhenEnvironment: false,
    limits: { common: { mode: "count", count: 1 } }
  });
  assert.equal(getRequestLimitViolation("common", "player", entries, configuration), "count");
  assert.equal(getRequestLimitViolation("common", "other", entries, configuration), null);

  configuration.blockWhenEnvironment = true;
  assert.equal(getRequestLimitViolation("urgent", "other", entries, configuration), "environment");
  assert.equal(getRequestLimitViolation("common", "player", entries, configuration), "environment");
  assert.equal(getRequestLimitViolation("urgent", "gm", entries, configuration, { moderator: true }), "environment");
  configuration.limits.urgent.mode = "forbidden";
  assert.equal(getRequestLimitViolation("urgent", "other", entries, configuration), "environment");
  assert.equal(getRequestLimitViolation("stop", "gm", entries, configuration), "environment");

  configuration.blockWhenEnvironment = false;
  assert.equal(getRequestLimitViolation("urgent", "other", entries, configuration), "forbidden");
});

test("configured request timeouts are detected only for supported active modes", () => {
  assert.equal(hasConfiguredRequestTimeouts({ limits: {} }), false);
  assert.equal(hasConfiguredRequestTimeouts(createDefaultRequestConfiguration()), true);
  const configuration = normalizeRequestConfiguration({
    limits: { urgent: { timeoutMode: "grant", timeoutDuration: 1000 } }
  });
  assert.equal(hasConfiguredRequestTimeouts(configuration), true);
});

test("request timeouts distinguish submission, grant, cancellation, and expiry", () => {
  const now = 1000000;
  const state = { entries: [], cooldowns: {} };
  const configuration = normalizeRequestConfiguration({
    limits: {
      common: { timeoutMode: "submission", timeoutDuration: 300000 },
      urgent: { timeoutMode: "grant", timeoutDuration: 300000 }
    }
  });

  recordRequestTimeoutEvent(state, "common", "player", "submission", now);
  let timeout = getRequestTimeoutStatus("common", "player", state, configuration, now + 1000);
  assert.equal(timeout.active, true);
  assert.equal(timeout.remaining, 299000);
  assert.equal(getRequestLimitViolation("common", "player", state, configuration, now + 1000), "timeout");
  assert.equal(getRequestLimitViolation("common", "player", state, configuration, now + 300000), null);

  recordRequestTimeoutEvent(state, "urgent", "player", "submission", now);
  assert.equal(getRequestTimeoutStatus("urgent", "player", state, configuration, now + 1000).active, false);
  recordRequestTimeoutEvent(state, "urgent", "player", "grant", now + 2000);
  timeout = getRequestTimeoutStatus("urgent", "player", state, configuration, now + 3000);
  assert.equal(timeout.active, true);
  assert.equal(timeout.startedAt, now + 2000);
  assert.equal(timeout.remaining, 299000);
});

test("a timeout reset marker prevents active requests from restoring cleared history", () => {
  const state = normalizeActiveRequestState({
    initialized: true,
    revision: 4,
    cooldownsResetAt: 1000,
    entries: [
      { id: "old", authorId: "old-player", urgency: "common", sequence: 0, submittedAt: 900 },
      { id: "new", authorId: "new-player", urgency: "urgent", sequence: 1, submittedAt: 1100 }
    ],
    cooldowns: {
      oldPlayer: { common: { submittedAt: 950, grantedAt: 990 } },
      grantedLater: { urgent: { grantedAt: 1200 } }
    }
  });
  assert.equal(state.cooldownsResetAt, 1000);
  assert.equal(state.cooldowns.oldPlayer, undefined);
  assert.equal(state.cooldowns["old-player"], undefined);
  assert.equal(state.cooldowns["new-player"].urgent.submittedAt, 1100);
  assert.equal(state.cooldowns.grantedLater.urgent.grantedAt, 1200);
});

test("active requests normalize and sort by queue sequence", () => {
  const state = normalizeActiveRequestState({
    initialized: true,
    revision: 2,
    entries: [
      { id: "second", authorId: "b", urgency: "urgent", sequence: 2, submittedAt: 20 },
      { id: "first", authorId: "a", urgency: "common", sequence: 1, submittedAt: 10 },
      { id: "", authorId: "x" }
    ],
    cooldowns: {
      a: { common: { submittedAt: 5, grantedAt: 7 } },
      invalid: { common: { submittedAt: -1 } }
    }
  });
  assert.equal(state.initialized, true);
  assert.equal(state.entries.length, 2);
  assert.deepEqual(state.entries.map((entry) => entry.id), ["first", "second"]);
  assert.equal(state.cooldowns.a.common.submittedAt, 10);
  assert.equal(state.cooldowns.a.common.grantedAt, 7);
  assert.equal(state.cooldowns.invalid, undefined);
});
