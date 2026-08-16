import assert from "node:assert/strict";
import test from "node:test";

class MockApplicationV2 {}

globalThis.HTMLElement = class {};
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  },
  audio: {
    AudioHelper: {
      play: async () => undefined,
      preloadSound: async () => undefined
    }
  },
  documents: {},
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => "timer-id"
  }
};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.CONFIG = { ChatMessage: {}, Macro: {} };
globalThis.document = {
  createElement: () => ({ style: { cssText: "", getPropertyValue: () => "" } })
};

const {
  TIMER_DISPLAY_STYLE,
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_VISIBILITY,
  calculateRoundedDeadline
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js");
const { TimerTool } = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-tool.js");

function installGame() {
  const values = new Map();
  const timeouts = new Map();
  let nextTimeout = 0;

  globalThis.window = {
    setTimeout(callback) {
      const id = ++nextTimeout;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval: () => 1,
    clearInterval() {}
  };
  globalThis.ui = {
    notifications: { warn() {}, error() {} }
  };
  globalThis.game = {
    paused: false,
    release: { generation: 14 },
    user: { id: "gm", name: "GM", role: 4 },
    settings: {
      get(namespace, key) {
        return values.get(`${namespace}.${key}`);
      },
      async set(namespace, key, value) {
        values.set(`${namespace}.${key}`, structuredClone(value));
        return value;
      }
    },
    socket: { emit() {} },
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key) => key
    },
    togglePause(paused) {
      this.paused = Boolean(paused);
      return this.paused;
    }
  };

  values.set("dmicher-spotlight-tools.timers", { version: 1, timers: {} });
  values.set("dmicher-spotlight-tools.timerAlertedExpirations", {});
  values.set("dmicher-spotlight-tools.requestConfiguration", {
    timerSounds: {
      timer: { custom: false, url: "", volume: 1 },
      break: { custom: false, url: "", volume: 1 }
    }
  });
  return { timeouts, values };
}

function createTimer(overrides = {}) {
  return {
    id: "expired",
    name: "Expired",
    mode: TIMER_MODE.duration,
    kind: TIMER_KIND.standard,
    startAt: 1,
    endsAt: 2,
    duration: 1,
    visibility: TIMER_VISIBILITY.public,
    style: TIMER_DISPLAY_STYLE.prominent,
    sound: TIMER_SOUND.signal1,
    createdBy: "gm",
    createdByName: "GM",
    createdAt: 1,
    ...overrides
  };
}

test("custom timer playback multiplies launch, world, and client levels", async () => {
  const { values } = installGame();
  values.set("dmicher-spotlight-tools.requestConfiguration", {
    timerSounds: {
      timer: { custom: true, url: "https://example.test/timer.ogg", volume: 0.4 },
      break: { custom: false, url: "", volume: 1 }
    }
  });
  let played = null;
  const tool = new TimerTool({
    volumeController: {
      async playTimer(src, baseVolume, launchVolume) {
        played = { src, baseVolume, launchVolume };
      }
    }
  });

  await tool.playTimerSound(TIMER_SOUND.custom, 0.5);
  assert.deepEqual(played, {
    src: "https://example.test/timer.ogg",
    baseVolume: 0.4,
    launchVolume: 0.5
  });
});

test("expired timer alerts are cached before asynchronous persistence completes", async () => {
  const { values } = installGame();
  let finishWrite;
  let writeCount = 0;
  game.settings.set = async (namespace, key, value) => {
    writeCount += 1;
    await new Promise((resolve) => {
      finishWrite = resolve;
    });
    values.set(`${namespace}.${key}`, structuredClone(value));
  };

  const tool = new TimerTool();
  tool.state = { version: 1, timers: { expired: createTimer() } };
  tool.alertedExpirations = {};
  let openCount = 0;
  let soundCount = 0;
  tool.openTimerWindow = () => {
    openCount += 1;
  };
  tool.playExpiredSound = async () => {
    soundCount += 1;
  };

  tool.checkExpiredTimers();
  tool.checkExpiredTimers();
  await Promise.resolve();

  assert.equal(openCount, 1);
  assert.equal(soundCount, 1);
  assert.equal(writeCount, 1);
  finishWrite();
  await new Promise((resolve) => setImmediate(resolve));
});

test("unrelated timer state changes do not consume forced-open retry attempts", () => {
  const { timeouts } = installGame();
  const tool = new TimerTool();
  tool.state = { version: 1, timers: {} };

  tool.queueForcedOpen("missing", 2);
  assert.equal(tool.pendingForcedOpens.get("missing"), 2);
  assert.equal(timeouts.size, 1);
  const scheduledRetry = tool.pendingForcedOpenRetry;

  tool.onTimersSettingChanged({ version: 1, timers: {} });
  assert.equal(tool.pendingForcedOpens.get("missing"), 2);
  assert.equal(timeouts.size, 1);
  assert.equal(tool.pendingForcedOpenRetry, scheduledRetry);

  let callback = Array.from(timeouts.values())[0];
  timeouts.clear();
  callback();
  assert.equal(tool.pendingForcedOpens.get("missing"), 1);

  callback = Array.from(timeouts.values())[0];
  timeouts.clear();
  callback();
  assert.equal(tool.pendingForcedOpens.has("missing"), false);
});

test("break duration is rounded from the actual timer start after pausing", async () => {
  installGame();
  const originalNow = Date.now;
  const base = Date.UTC(2026, 7, 11, 10, 15, 0, 0);
  let now = base;
  Date.now = () => now;
  game.togglePause = async (paused) => {
    game.paused = Boolean(paused);
    if (paused) now += 70;
    return game.paused;
  };

  const tool = new TimerTool();
  tool.openTimerWindow = () => null;
  tool.createTimerChatMessage = async () => ({ id: "message" });
  let displayedDeadline = 0;

  try {
    const timer = await tool.startBreakTimer(15, {
      onDeadlineCalculated: (deadline) => {
        displayedDeadline = deadline;
      }
    });
    assert.equal(timer.startAt, base + 70);
    assert.equal(timer.endsAt, calculateRoundedDeadline(15, timer.startAt));
    assert.equal(displayedDeadline, timer.endsAt);
    assert.ok(timer.duration >= 15 * 60 * 1000);
    assert.ok(timer.duration < 16 * 60 * 1000);
  } finally {
    Date.now = originalNow;
  }
});

test("failed break announcement rolls back timer state and a newly applied pause", async () => {
  const { values } = installGame();
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    game.paused = Boolean(paused);
    return game.paused;
  };

  const tool = new TimerTool();
  tool.createTimerChatMessage = async () => {
    throw new Error("chat failed");
  };

  await assert.rejects(tool.startBreakTimer(15), /chat failed/);
  assert.deepEqual(pauseCalls, [true, false]);
  assert.deepEqual(values.get("dmicher-spotlight-tools.timers").timers, {});
});

test("a cancelled chat creation rolls back a timer start", async () => {
  const { values } = installGame();
  const tool = new TimerTool();
  tool.createTimerChatMessage = async () => undefined;

  await assert.rejects(tool.startTimer({
    name: "Cancelled",
    mode: TIMER_MODE.duration,
    time: "00:01:00",
    visibility: TIMER_VISIBILITY.public,
    style: TIMER_DISPLAY_STYLE.prominent,
    sound: TIMER_SOUND.none
  }), /Timers\.Errors\.StartFailed/);
  assert.deepEqual(values.get("dmicher-spotlight-tools.timers").timers, {});
});

test("a failed unpause does not mask the original break error", async () => {
  const { values } = installGame();
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    if (!paused) throw new Error("unpause failed");
    game.paused = true;
    return true;
  };

  const tool = new TimerTool();
  tool.createTimerChatMessage = async () => {
    throw new Error("chat failed");
  };
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(tool.startBreakTimer(15), /chat failed/);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(pauseCalls, [true, false]);
  assert.deepEqual(values.get("dmicher-spotlight-tools.timers").timers, {});
});
test("repeating a timer preserves its launch parameters and full duration", async () => {
  const { values } = installGame();
  const originalNow = Date.now;
  const now = Date.UTC(2026, 7, 17, 12, 0, 0, 250);
  Date.now = () => now;
  const source = createTimer({
    id: "source",
    name: "Source timer",
    mode: TIMER_MODE.deadline,
    startAt: now - 60_000,
    endsAt: now + 62_345,
    duration: 122_345,
    visibility: TIMER_VISIBILITY.private,
    style: TIMER_DISPLAY_STYLE.compact,
    sound: TIMER_SOUND.signal2,
    volume: 0.35,
    createdAt: now - 60_000
  });
  const state = { version: 1, timers: { source } };
  values.set("dmicher-spotlight-tools.timers", structuredClone(state));

  const tool = new TimerTool();
  tool.state = structuredClone(state);
  tool.createTimerChatMessage = async () => ({ id: "message" });
  tool.openTimerWindow = () => null;

  try {
    const repeated = await tool.repeatTimer("source");
    const persisted = values.get("dmicher-spotlight-tools.timers");
    assert.equal(Object.hasOwn(persisted.timers, "source"), true);
    assert.deepEqual(persisted.timers["timer-id"], repeated);
    assert.equal(repeated.name, source.name);
    assert.equal(repeated.mode, source.mode);
    assert.equal(repeated.kind, TIMER_KIND.standard);
    assert.equal(repeated.startAt, now);
    assert.equal(repeated.endsAt, now + source.duration);
    assert.equal(repeated.duration, source.duration);
    assert.equal(repeated.visibility, source.visibility);
    assert.equal(repeated.style, source.style);
    assert.equal(repeated.sound, source.sound);
    assert.equal(repeated.volume, source.volume);
  } finally {
    Date.now = originalNow;
  }
});

test("repeating a break timer pauses the world again", async () => {
  const { values } = installGame();
  const source = createTimer({
    id: "break-source",
    kind: TIMER_KIND.break,
    duration: 300_000,
    endsAt: 300_001
  });
  const state = { version: 1, timers: { "break-source": source } };
  values.set("dmicher-spotlight-tools.timers", structuredClone(state));
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    game.paused = Boolean(paused);
    return game.paused;
  };

  const tool = new TimerTool();
  tool.state = structuredClone(state);
  tool.createTimerChatMessage = async () => ({ id: "message" });
  tool.openTimerWindow = () => null;

  const repeated = await tool.repeatTimer("break-source");
  assert.deepEqual(pauseCalls, [true]);
  assert.equal(repeated.kind, TIMER_KIND.break);
  assert.equal(repeated.duration, source.duration);
});
