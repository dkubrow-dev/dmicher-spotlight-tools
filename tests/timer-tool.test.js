import assert from "node:assert/strict";
import test from "node:test";
import { installPremiumFixture } from "./fixtures/premium.mjs";
test.beforeEach(() => installPremiumFixture());
import { installTechnicalChatFixture } from "./fixtures/technical-chat.mjs";
import { MockElement } from "./fixtures/chat-dom.mjs";

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
  BUILTIN_BREAK_TEMPLATE_ID,
  TIMER_DISPLAY_STYLE,
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_VISIBILITY,
  calculateRoundedDeadline
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js");
const { normalizeTimerTemplateState } = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-template-utils.js");
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
  delete foundry.applications.api.DialogV2;
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
  values.set("dmicher-spotlight-tools.timerTemplates", { version: 1, templates: {} });
  values.set("dmicher-spotlight-tools.timerAlertedExpirations", {});
  values.set("dmicher-spotlight-tools.requestConfiguration", {
    timerSounds: {
      timer: { custom: false, url: "", volume: 1 },
      break: { custom: false, url: "", volume: 1 }
    }
  });
  installTechnicalChatFixture();
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

test("timer chat watch bindings do not multiply and recheck current visibility", () => {
  installGame();
  globalThis.HTMLElement = MockElement;
  game.user = { id: "player", role: 1 };
  game.users.set(game.user.id, game.user);
  game.messages = new Map();
  const tool = new TimerTool();
  const root = new MockElement();
  const card = new MockElement();
  const button = new MockElement();
  button.dataset.timerAction = "watch";
  root.queries.set("[data-timer-chat-card]", card);
  card.queries.set("[data-timer-action='watch']", button);
  const timer = createTimer({ id: "watched", visibility: TIMER_VISIBILITY.public });
  tool.getTimer = (id) => id === timer.id ? timer : undefined;
  let refreshes = 0;
  tool.timerWindows.set(timer.id, { rendered: true, bringToFront() {}, setDisplayStyle() {}, refreshTime() { refreshes++; } });
  const message = {
    id: "watch-card", visible: true, isContentVisible: true,
    getFlag: (_namespace, key) => key === "timer" ? { kind: "started", id: timer.id } : undefined
  };
  game.messages.set(message.id, message);
  tool.renderChatMessage(message, root);
  tool.renderChatMessage(message, root);
  assert.equal(card.listenerSets.get("click").size, 1);
  const click = () => card.listeners.get("click")({ target: button, preventDefault() {} });
  click();
  assert.equal(refreshes, 1);
  timer.visibility = TIMER_VISIBILITY.private;
  const warnings = [];
  ui.notifications.warn = (message) => warnings.push(message);
  click();
  assert.equal(refreshes, 1);
  assert.equal(warnings.length, 1, "the timer owner checks current access after the chat interaction");
  globalThis.HTMLElement = class {};
});

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
  tool.createTimerChatMessage = async () => [{ id: "message" }];
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
  tool.createTimerChatMessage = async () => [];

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

test("disabling technical chat leaves break timers functional without publishing", async () => {
  const { values } = installGame();
  values.set("dmicher-spotlight-tools.requestConfiguration", { chatEnabled: false });
  const originalClass = CONFIG.ChatMessage.documentClass;
  let messageCreations = 0;
  CONFIG.ChatMessage.documentClass = {
    async create() {
      messageCreations += 1;
      throw new Error("disabled chat must not publish");
    }
  };
  const tool = new TimerTool();
  let openedTimer = null;
  tool.openTimerWindow = (timerId) => {
    openedTimer = timerId;
  };

  try {
    const timer = await tool.startBreakTimer(15);
    assert.equal(game.paused, true);
    assert.equal(openedTimer, timer.id);
    assert.equal(messageCreations, 0);
    assert.deepEqual(values.get("dmicher-spotlight-tools.timers").timers[timer.id], timer);
  } finally {
    CONFIG.ChatMessage.documentClass = originalClass;
  }
});

test("disabling timer chat alone still starts the timer without announcements", async () => {
  const { values } = installGame();
  values.set("dmicher-spotlight-tools.requestConfiguration", {
    chatEnabled: true,
    chatNotifications: { timers: false }
  });
  const originalClass = CONFIG.ChatMessage.documentClass;
  let messageCreations = 0;
  CONFIG.ChatMessage.documentClass = {
    async create() {
      messageCreations += 1;
      throw new Error("disabled timer notifications must not publish");
    }
  };
  const tool = new TimerTool();
  tool.openTimerWindow = () => null;

  try {
    const timer = await tool.startTimer({
      name: "Quiet timer",
      mode: TIMER_MODE.duration,
      time: "00:01:00",
      visibility: TIMER_VISIBILITY.public,
      style: TIMER_DISPLAY_STYLE.prominent,
      sound: TIMER_SOUND.none
    });
    assert.equal(messageCreations, 0);
    assert.deepEqual(values.get("dmicher-spotlight-tools.timers").timers[timer.id], timer);
  } finally {
    CONFIG.ChatMessage.documentClass = originalClass;
  }
});

test("timer rollback removes every recipient copy and continues after a failed deletion", async () => {
  const { values } = installGame();
  values.set("dmicher-spotlight-tools.timers", {
    version: 2,
    timers: { failed: createTimer({ id: "failed" }), retained: createTimer({ id: "retained" }) }
  });
  const deletionAttempts = [];
  game.messages = [
    { id: "copy-gm", timerId: "failed", fail: true },
    { id: "copy-player", timerId: "failed" },
    { id: "unrelated", timerId: "retained" }
  ].map((entry) => ({
    getFlag: () => ({ id: entry.timerId }),
    async delete() {
      deletionAttempts.push(entry.id);
      if (entry.fail) throw new Error("delete failed");
    }
  }));
  const originalError = console.error;
  console.error = () => undefined;

  try {
    await new TimerTool().rollbackTimerStart("failed");
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(deletionAttempts, ["copy-gm", "copy-player"]);
  assert.deepEqual(Object.keys(values.get("dmicher-spotlight-tools.timers").timers), ["retained"]);
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
    templateId: "template-1",
    createdAt: now - 60_000
  });
  const state = { version: 1, timers: { source } };
  values.set("dmicher-spotlight-tools.timers", structuredClone(state));

  const tool = new TimerTool();
  tool.state = structuredClone(state);
  tool.createTimerChatMessage = async () => [{ id: "message" }];
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
    assert.equal(repeated.templateId, source.templateId);
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
  tool.createTimerChatMessage = async () => [{ id: "message" }];
  tool.openTimerWindow = () => null;

  const repeated = await tool.repeatTimer("break-source");
  assert.deepEqual(pauseCalls, [true]);
  assert.equal(repeated.kind, TIMER_KIND.break);
  assert.equal(repeated.templateId, BUILTIN_BREAK_TEMPLATE_ID);
  assert.equal(repeated.duration, source.duration);
});

test("an active break cannot be repeated and does not touch the pause state", async () => {
  installGame();
  const now = Date.now();
  const source = createTimer({
    id: "active-break",
    kind: TIMER_KIND.break,
    startAt: now - 1_000,
    endsAt: now + 60_000,
    duration: 61_000
  });
  const tool = new TimerTool();
  tool.state = { version: 2, timers: { "active-break": source } };
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    return paused;
  };

  await assert.rejects(tool.repeatTimer(source.id), /Timers\.Break\.AlreadyActive/);
  assert.deepEqual(pauseCalls, []);
});

test("saving a one-off timer creates a canonical template and links the running instance", async () => {
  const { values } = installGame();
  const deadline = new Date(2026, 8, 2, 21, 7, 8).getTime();
  const source = createTimer({
    id: "source",
    name: "Deadline source",
    mode: TIMER_MODE.deadline,
    startAt: deadline - 90_000,
    endsAt: deadline,
    duration: 90_000,
    templateId: ""
  });
  values.set("dmicher-spotlight-tools.timers", {
    version: 2,
    timers: { source }
  });

  const tool = new TimerTool();
  tool.state = { version: 2, timers: { source: structuredClone(source) } };
  const saved = await tool.saveTimerAsTemplate("source");
  const templateState = values.get("dmicher-spotlight-tools.timerTemplates");
  const timerState = values.get("dmicher-spotlight-tools.timers");

  assert.equal(saved.id, "timer-id");
  assert.equal(templateState.templates["timer-id"].time, "21:07:08");
  assert.equal(templateState.templates["timer-id"].mode, TIMER_MODE.deadline);
  assert.equal(timerState.timers.source.templateId, "timer-id");
  assert.ok(templateState.templates[BUILTIN_BREAK_TEMPLATE_ID]);
});

test("built-in break template updates only configurable launch fields and cannot be deleted", async () => {
  const { values } = installGame();
  const tool = new TimerTool();

  const saved = await tool.saveTimerTemplate({
    name: "Ignored",
    mode: TIMER_MODE.deadline,
    time: "23:59:59",
    visibility: TIMER_VISIBILITY.private,
    style: TIMER_DISPLAY_STYLE.compact,
    sound: TIMER_SOUND.signal3,
    volume: 0.35
  }, BUILTIN_BREAK_TEMPLATE_ID);
  const persisted = values.get("dmicher-spotlight-tools.timerTemplates")
    .templates[BUILTIN_BREAK_TEMPLATE_ID];

  assert.equal(saved.name, "DMICHERSPOTLIGHTTOOLS.Timers.Break.TimerName");
  assert.equal(persisted.name, "");
  assert.equal(persisted.kind, TIMER_KIND.break);
  assert.equal(persisted.mode, TIMER_MODE.duration);
  assert.equal(persisted.time, "00:15:00");
  assert.equal(persisted.visibility, TIMER_VISIBILITY.public);
  assert.equal(persisted.style, TIMER_DISPLAY_STYLE.compact);
  assert.equal(persisted.sound, TIMER_SOUND.signal3);
  assert.equal(persisted.volume, 0.35);
  await assert.rejects(
    tool.deleteTimerTemplate(BUILTIN_BREAK_TEMPLATE_ID),
    /Timers\.Templates\.BuiltInDeleteForbidden/
  );
});

test("starting a standard template creates a linked timer while break template opens its launcher", async () => {
  const { values } = installGame();
  const templateState = normalizeTimerTemplateState({
    templates: {
      standard: {
        id: "standard",
        name: "Saved timer",
        mode: TIMER_MODE.duration,
        time: "00:02:00",
        visibility: TIMER_VISIBILITY.private,
        style: TIMER_DISPLAY_STYLE.compact,
        sound: TIMER_SOUND.signal2,
        volume: 0.2,
        createdAt: 1,
        updatedAt: 1
      }
    }
  });
  values.set("dmicher-spotlight-tools.timerTemplates", structuredClone(templateState));
  const tool = new TimerTool();
  tool.templateState = structuredClone(templateState);
  tool.createTimerChatMessage = async () => [{ id: "message" }];
  tool.openTimerWindow = () => null;

  const timer = await tool.startTimerTemplate("standard");
  assert.equal(timer.templateId, "standard");
  assert.equal(timer.name, "Saved timer");
  assert.equal(timer.duration, 120_000);
  assert.equal(timer.visibility, TIMER_VISIBILITY.private);

  const launcher = { id: "break-launcher" };
  tool.openBreakTimer = () => launcher;
  assert.equal(await tool.startTimerTemplate(BUILTIN_BREAK_TEMPLATE_ID), launcher);
});

test("break descriptors use built-in template appearance and enforce one active break", async () => {
  const { values } = installGame();
  const templateState = normalizeTimerTemplateState({
    templates: {
      [BUILTIN_BREAK_TEMPLATE_ID]: {
        id: BUILTIN_BREAK_TEMPLATE_ID,
        style: TIMER_DISPLAY_STYLE.compact,
        sound: TIMER_SOUND.signal2,
        volume: 0.45
      }
    }
  });
  values.set("dmicher-spotlight-tools.timerTemplates", structuredClone(templateState));
  const tool = new TimerTool();
  tool.templateState = structuredClone(templateState);
  tool.createTimerChatMessage = async () => [{ id: "message" }];
  tool.openTimerWindow = () => null;

  const timer = await tool.startBreakTimer({
    durationMilliseconds: 90_000,
    mode: TIMER_MODE.duration
  });
  assert.equal(timer.kind, TIMER_KIND.break);
  assert.equal(timer.templateId, BUILTIN_BREAK_TEMPLATE_ID);
  assert.equal(timer.visibility, TIMER_VISIBILITY.public);
  assert.equal(timer.style, TIMER_DISPLAY_STYLE.compact);
  assert.equal(timer.sound, TIMER_SOUND.signal2);
  assert.equal(timer.volume, 0.45);

  tool.state = {
    version: 2,
    timers: {
      active: createTimer({
        id: "active",
        kind: TIMER_KIND.break,
        startAt: Date.now() - 1,
        endsAt: Date.now() + 60_000,
        duration: 60_001
      })
    }
  };
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    return paused;
  };
  await assert.rejects(
    tool.startBreakTimer({ durationMilliseconds: 60_000, mode: TIMER_MODE.duration }),
    /Timers\.Break\.AlreadyActive/
  );
  assert.deepEqual(pauseCalls, []);
});

test("repeat confirmation defaults by expiration, starts first, and optionally deletes the source", async () => {
  installGame();
  const tool = new TimerTool();
  tool.state = { version: 2, timers: { expired: createTimer() } };
  const order = [];
  let options = null;
  foundry.applications.api.DialogV2 = {
    async prompt(value) {
      options = value;
      return "delete";
    }
  };
  tool.repeatTimer = async (timerId) => {
    order.push(`repeat:${timerId}`);
    return { id: "repeated" };
  };
  tool.deleteTimer = async (timerId) => {
    order.push(`delete:${timerId}`);
  };

  const repeated = await tool.confirmRepeatTimer("expired");
  assert.deepEqual(repeated, { id: "repeated" });
  assert.match(options.content, /value="delete" checked/);
  assert.doesNotMatch(options.content, /value="keep" checked/);
  assert.deepEqual(order, ["repeat:expired", "delete:expired"]);
});

test("repeat confirmation keeps an active source by default and cancellation is a no-op", async () => {
  installGame();
  const tool = new TimerTool();
  tool.state = {
    version: 2,
    timers: {
      active: createTimer({
        id: "active",
        startAt: Date.now(),
        endsAt: Date.now() + 60_000,
        duration: 60_000
      })
    }
  };
  let options = null;
  foundry.applications.api.DialogV2 = {
    async prompt(value) {
      options = value;
      return null;
    }
  };
  let repeatCalls = 0;
  tool.repeatTimer = async () => {
    repeatCalls += 1;
  };

  assert.equal(await tool.confirmRepeatTimer("active"), null);
  assert.match(options.content, /value="keep" checked/);
  assert.doesNotMatch(options.content, /value="delete" checked/);
  assert.equal(repeatCalls, 0);
});

test("repeat prompt exposes cancel separately and reads the selected radio from the dialog form", async () => {
  installGame();
  const now = Date.now();
  const tool = new TimerTool();
  tool.state = {
    version: 2,
    timers: {
      active: createTimer({
        id: "active",
        startAt: now,
        endsAt: now + 60_000,
        duration: 60_000
      })
    }
  };
  let options = null;
  foundry.applications.api.DialogV2 = {
    async prompt(value) {
      options = value;
      return value.ok.callback(null, {
        form: {
          elements: {
            repeatDisposition: { value: "delete" }
          }
        }
      });
    }
  };
  const order = [];
  tool.repeatTimer = async (timerId) => {
    order.push(`repeat:${timerId}`);
    return { id: "repeated" };
  };
  tool.deleteTimer = async (timerId) => {
    order.push(`delete:${timerId}`);
  };

  const repeated = await tool.confirmRepeatTimer("active");
  assert.deepEqual(repeated, { id: "repeated" });
  assert.doesNotMatch(options.content, /<form\b/i);
  assert.match(options.content, /class="dmicher-timer-repeat-form"/);
  assert.match(options.content, /value="keep" checked/);
  assert.deepEqual(options.buttons, [{
    action: "cancel",
    label: "DMICHERSPOTLIGHTTOOLS.Timers.Repeat.Cancel",
    icon: "fa-solid fa-xmark"
  }]);
  assert.deepEqual(order, ["repeat:active", "delete:active"]);
});

test("repeat preflight blocks an expired break when another break is active", async () => {
  installGame();
  const now = Date.now();
  const tool = new TimerTool();
  tool.state = {
    version: 2,
    timers: {
      expired: createTimer({
        id: "expired",
        kind: TIMER_KIND.break,
        startAt: now - 120_000,
        endsAt: now - 60_000,
        duration: 60_000
      }),
      active: createTimer({
        id: "active",
        kind: TIMER_KIND.break,
        startAt: now - 1_000,
        endsAt: now + 60_000,
        duration: 61_000
      })
    }
  };
  let dialogCalls = 0;
  foundry.applications.api.DialogV2 = {
    async prompt() {
      dialogCalls += 1;
      return "keep";
    }
  };
  const warnings = [];
  ui.notifications.warn = (message) => warnings.push(message);
  let repeatCalls = 0;
  tool.repeatTimer = async () => {
    repeatCalls += 1;
  };

  assert.equal(await tool.confirmRepeatTimer("expired"), null);
  assert.equal(dialogCalls, 0);
  assert.equal(repeatCalls, 0);
  assert.deepEqual(warnings, [
    "DMICHERSPOTLIGHTTOOLS.Timers.Break.AlreadyActive"
  ]);
});

test("pause rollback keeps the world paused when persisted state gained an active break", async () => {
  const { values } = installGame();
  const now = Date.now();
  values.set("dmicher-spotlight-tools.timers", {
    version: 2,
    timers: {
      competing: createTimer({
        id: "competing",
        kind: TIMER_KIND.break,
        startAt: now - 1_000,
        endsAt: now + 60_000,
        duration: 61_000
      })
    }
  });
  const pauseCalls = [];
  game.togglePause = async (paused) => {
    pauseCalls.push(paused);
    game.paused = Boolean(paused);
    return game.paused;
  };
  const tool = new TimerTool();
  tool.state = { version: 2, timers: {} };

  await assert.rejects(
    tool.startBreakTimer({
      durationMilliseconds: 60_000,
      mode: TIMER_MODE.duration
    }),
    /Timers\.Break\.AlreadyActive/
  );
  assert.deepEqual(pauseCalls, [true]);
  assert.equal(game.paused, true);
});

test("expired Premium makes existing custom timer selections use a built-in signal", async () => {
  const { values } = installGame();
  values.set("dmicher-spotlight-tools.requestConfiguration", {
    timerSounds: {
      timer: { custom: true, url: "https://example.test/timer.ogg", volume: 0.4 },
      break: { custom: true, url: "https://example.test/break.ogg", volume: 0.2 }
    }
  });
  const tool = new TimerTool({ volumeController: {} });
  const { registerPremiumFixture } = await import("./fixtures/premium.mjs");
  assert.equal(tool.getSoundSource(TIMER_SOUND.custom), "https://example.test/timer.ogg");
  registerPremiumFixture(null);
  assert.equal(tool.getSoundSource(TIMER_SOUND.custom), tool.getSoundSource(TIMER_SOUND.signal1));
  assert.equal(tool.getSoundSource(TIMER_SOUND.breakCustom), tool.getSoundSource(TIMER_SOUND.signal1));
  assert.equal(tool.getSoundBaseVolume(TIMER_SOUND.custom), 1);
});
