import assert from "node:assert/strict";
import { installTechnicalChatFixture } from "./technical-chat.mjs";

const generation = Number(process.argv[2]);
assert.ok([12, 13, 14].includes(generation), "expected Foundry generation 12, 13, or 14");

class TestCollection extends Map {
  constructor(items = []) {
    super(items.map((item) => [item.id, item]));
  }

  [Symbol.iterator]() {
    return this.values();
  }

  filter(predicate) {
    return Array.from(this).filter(predicate);
  }

  find(predicate) {
    return Array.from(this).find(predicate);
  }

  map(mapper) {
    return Array.from(this).map(mapper);
  }
}

class HookBus {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
  }

  on(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
    return listeners.length;
  }

  once(name, listener) {
    const listeners = this.onceListeners.get(name) ?? [];
    listeners.push(listener);
    this.onceListeners.set(name, listeners);
    return listeners.length;
  }

  callAll(name, ...args) {
    return this.call(name, ...args);
  }

  call(name, ...args) {
    const listeners = [
      ...(this.listeners.get(name) ?? []),
      ...(this.onceListeners.get(name) ?? [])
    ];
    this.onceListeners.delete(name);
    return listeners.map((listener) => listener(...args));
  }

  count(name) {
    return (this.listeners.get(name)?.length ?? 0) + (this.onceListeners.get(name)?.length ?? 0);
  }
}

class MockHTMLElement {
  constructor() {
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  setAttribute() {}

  addEventListener() {}

  replaceChildren() {}
}

class MockApplicationV2 {
  constructor(options = {}) {
    this.options = options;
    this.element = new MockHTMLElement();
    this.rendered = false;
  }

  async _prepareContext() {
    return {};
  }

  _onRender() {}

  _onClose() {}

  async render() {
    this.rendered = true;
    return this;
  }

  async close() {
    this.rendered = false;
    return this;
  }

  bringToFront() {}
}

class MockLegacySidebarTab extends MockApplicationV2 {
  async getData() {
    return {
      cssId: "requests",
      cssClass: "tab sidebar-tab dmicher-request-feed",
      tabName: "requests"
    };
  }
}
class MockConfiguredChat extends MockLegacySidebarTab {}
class MockAbstractSidebarTab extends MockApplicationV2 {
  _onActivate() {}
}

class MockImage {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  set src(value) {
    this._src = value;
    queueMicrotask(() => this.listeners.get("load")?.());
  }

  get src() {
    return this._src;
  }
}

class MockChatMessage {
  static created = [];

  static async create(data) {
    this.created.push(data);
    return data;
  }

  static getSpeaker() {
    return {};
  }

  static applyRollMode(data) {
    return data;
  }

  static applyMode(data) {
    return data;
  }
}

class MockMacro {
  static async create(data) {
    return {
      ...data,
      id: `macro-${Math.random()}`,
      isOwner: true,
      async update(changes) {
        Object.assign(this, changes);
        return this;
      },
      getFlag() {
        return undefined;
      }
    };
  }
}

const hooks = new HookBus();
const scheduledTimeouts = [];
const intervalCallbacks = [];
const registeredSettings = new Map();
const registeredMenus = new Map();
const settingValues = new Map();
const invalidScopes = [];
const socketListeners = new Map();
const audioPreloads = [];
const playerRenderCalls = [];
const sceneControlInitializations = [];
const asyncErrors = [];
let randomId = 0;

process.on("unhandledRejection", (error) => asyncErrors.push(error));

globalThis.HTMLElement = MockHTMLElement;
globalThis.Node = { TEXT_NODE: 3 };
globalThis.Image = MockImage;
globalThis.SidebarTab = undefined;
globalThis.Hooks = hooks;
globalThis.CONST = {
  USER_ROLES: {
    PLAYER: 1,
    TRUSTED: 2,
    ASSISTANT: 3,
    GAMEMASTER: 4
  }
};

const documentRoot = { setAttribute() {} };
const sidebarClasses = new Set(["dmicher-request-feed-enabled"]);
const sidebarRoot = new MockHTMLElement();
sidebarRoot.classList = {
  add: (...names) => names.forEach((name) => sidebarClasses.add(name)),
  remove: (...names) => names.forEach((name) => sidebarClasses.delete(name)),
  toggle(name, enabled) {
    if (enabled) sidebarClasses.add(name);
    else sidebarClasses.delete(name);
  }
};
globalThis.document = {
  documentElement: documentRoot,
  body: documentRoot,
  createElement: () => new MockHTMLElement(),
  getElementById: () => null,
  querySelector: (selector) => selector === "#sidebar" ? sidebarRoot : null
};
globalThis.window = {
  setTimeout(callback) {
    scheduledTimeouts.push(callback);
    return scheduledTimeouts.length;
  },
  clearTimeout() {},
  setInterval(callback) {
    intervalCallbacks.push(callback);
    return intervalCallbacks.length;
  },
  clearInterval() {},
  confirm: () => true,
  open: () => ({})
};

const settings = {
  register(namespace, key, config) {
    const allowedScopes = generation === 12
      ? new Set(["client", "world"])
      : new Set(["client", "world", "user"]);
    if (!allowedScopes.has(config.scope)) invalidScopes.push({ namespace, key, scope: config.scope });
    const id = `${namespace}.${key}`;
    registeredSettings.set(id, config);
    settingValues.set(id, structuredClone(config.default));
  },

  registerMenu(namespace, key, config) {
    registeredMenus.set(`${namespace}.${key}`, config);
  },

  get(namespace, key) {
    if ((namespace === "core") && (key === "rollMode")) return "publicroll";
    return settingValues.get(`${namespace}.${key}`);
  },

  async set(namespace, key, value) {
    const id = `${namespace}.${key}`;
    settingValues.set(id, structuredClone(value));
    registeredSettings.get(id)?.onChange?.(value);
    return value;
  }
};

const currentUser = {
  id: "gm-1",
  name: "GM",
  role: CONST.USER_ROLES.GAMEMASTER,
  active: true,
  hotbar: {},
  can: () => true,
  async assignHotbarMacro() {}
};
const moduleRecord = { id: "dmicher-spotlight-tools", api: null };

globalThis.game = {
  release: { generation },
  version: `${generation}.999`,
  user: currentUser,
  users: new TestCollection([currentUser]),
  messages: new TestCollection(),
  macros: new TestCollection(),
  modules: new TestCollection([moduleRecord]),
  settings,
  time: { serverTime: Date.now() },
  paused: false,
  i18n: {
    lang: "en",
    localize: (key) => key,
    format: (key, data = {}) => `${key}:${JSON.stringify(data)}`
  },
  socket: {
    on(channel, listener) {
      const listeners = socketListeners.get(channel) ?? [];
      listeners.push(listener);
      socketListeners.set(channel, listeners);
    },
    emit() {}
  },
  togglePause(paused) {
    this.paused = Boolean(paused);
    return this.paused;
  }
};

class MockSidebar {
  static TABS = {
    chat: {},
    combat: {},
    scenes: {}
  };
}

globalThis.CONFIG = {
  ChatMessage: { documentClass: MockChatMessage },
  Macro: { documentClass: MockMacro },
  ui: { sidebar: MockSidebar, chat: MockConfiguredChat }
};
globalThis.foundry = {
  applications: {
    sidebar: generation >= 13 ? { AbstractSidebarTab: MockAbstractSidebarTab } : undefined,
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {
        static usesHandlebarsApplicationMixin = true;
      },
      DialogV2: { confirm: async () => true }
    }
  },
  audio: {
    AudioHelper: {
      async play(data) {
        return data;
      },
      async preloadSound(src) {
        audioPreloads.push(src);
        return src;
      }
    }
  },
  documents: {
    ChatMessage: MockChatMessage,
    Macro: MockMacro
  },
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => `random-${++randomId}`,
    timeSince: () => "now"
  }
};

globalThis.ui = {
  notifications: {
    info() {},
    warn() {},
    error() {}
  },
  players: {
    render(...args) {
      playerRenderCalls.push(args);
    }
  },
  chat: {
    rendered: true,
    updateTimestamps() {},
    activate() {}
  },
  sidebar: {
    changeTab() {},
    activateTab() {}
  },
  controls: {
    initialize(options) {
      sceneControlInitializations.push(options);
    }
  }
};
globalThis.canvas = { tokens: { controlled: [] } };

const runtimeRelease = game.release;
const runtimeVersion = game.version;
if (generation >= 13) {
  game.release = undefined;
  game.version = "";
}
await import("../../dmicher-spotlight-tools/scripts/dmicher-spotlight-tools.js");
game.release = runtimeRelease;
game.version = runtimeVersion;
assert.equal(hooks.count("init"), 1);
assert.equal(hooks.count("ready"), 1);

hooks.call("init");
assert.equal(invalidScopes.length, 0);
assert.ok(moduleRecord.api);
const { generics: genericApi } = await import("../../dmicher-spotlight-tools/scripts/generics.js");
assert.equal(genericApi.modules.get("dmicher-spotlight-tools"), moduleRecord.api);
assert.equal(moduleRecord.api.apiVersion, 1);
assert.ok(genericApi.modules.list()[0].capabilities.includes("openFocusAudit"));
assert.ok(CONFIG.ui.requests);
if (generation === 12) {
  assert.equal(CONFIG.ui.requests.usesHandlebarsApplicationMixin, undefined);
  assert.equal(hooks.count("renderSidebar"), 1);
} else {
  assert.equal(CONFIG.ui.requests.usesHandlebarsApplicationMixin, true);
  assert.equal(hooks.count("renderSidebar"), 0);
  assert.deepEqual(Object.keys(CONFIG.ui.sidebar.TABS), ["chat", "combat", "requests", "scenes"]);
}
assert.equal(sidebarClasses.has("dmicher-request-feed-enabled"), false);
assert.equal(sidebarClasses.has("dmicher-request-feed-enabled-v12"), generation === 12);
assert.deepEqual(
  Array.from(registeredMenus.keys()).filter((key) => key.includes("request") || key.includes("thankAuthor")),
  [
    "dmicher-spotlight-tools.requestsSettings",
    "dmicher-spotlight-tools.requestMasterSettings",
    "dmicher-spotlight-tools.requestsHelp",
    "dmicher-spotlight-tools.thankAuthor"
  ]
);
assert.equal(registeredMenus.get("dmicher-spotlight-tools.requestsSettings")?.restricted, false);
assert.equal(registeredMenus.get("dmicher-spotlight-tools.requestMasterSettings")?.restricted, true);
assert.equal(hooks.count("renderSettingsConfig"), 1);
assert.equal(hooks.count("renderSettingsConfigHTML"), 1);
const requestConfiguration = registeredSettings.get("dmicher-spotlight-tools.requestConfiguration");
assert.equal(requestConfiguration.default.feed.enabled, true);
assert.equal(requestConfiguration.default.feed.showToPlayers, true);
assert.equal(requestConfiguration.default.feed.showTime, true);
assert.equal(requestConfiguration.default.showWelcome, true);
assert.equal(requestConfiguration.default.soundsEnabled, true);
assert.equal(requestConfiguration.default.blockWhenEnvironment, true);
assert.equal(requestConfiguration.default.limits.common.mode, "none");
assert.equal(requestConfiguration.default.limits.common.timeoutMode, "none");
assert.equal(requestConfiguration.default.limits.urgent.mode, "count");
assert.equal(requestConfiguration.default.limits.urgent.count, 1);
assert.equal(requestConfiguration.default.limits.urgent.timeoutMode, "grant");
assert.equal(requestConfiguration.default.limits.urgent.timeoutDuration, 10 * 60 * 1000);

const feedApplication = new CONFIG.ui.requests();
if (generation === 12) assert.ok(feedApplication instanceof MockLegacySidebarTab);
const feedContext = generation >= 13
  ? await feedApplication._prepareContext({})
  : await feedApplication.getData({});
assert.equal(feedContext.legacy, generation === 12);
if (generation === 12) {
  assert.equal(feedContext.cssId, "requests");
  assert.match(feedContext.cssClass, /sidebar-tab/);
  assert.equal(feedContext.tabName, "requests");
}
const feedRenderCalls = [];
feedApplication.render = (...args) => {
  feedRenderCalls.push(args);
  return Promise.resolve(feedApplication);
};
feedApplication._onActivate();
assert.deepEqual(feedRenderCalls, generation >= 13 ? [[{force: true}]] : [[true]]);

const expectedChatHook = generation === 12 ? "renderChatMessage" : "renderChatMessageHTML";
assert.ok(hooks.count(expectedChatHook) >= 3);
assert.equal(hooks.count("getSceneControlButtons"), 1);

const renderedMessage = new MockHTMLElement();
const chatHtml = generation === 12 ? { 0: renderedMessage, length: 1 } : renderedMessage;
hooks.call(expectedChatHook, {
  id: "empty-message",
  getFlag: () => null
}, chatHtml);

const sceneControls = generation === 12 ? [] : {};
hooks.call("getSceneControlButtons", sceneControls);
if (generation === 12) {
  assert.equal(sceneControls[0]?.name, "dmicher-spotlight-tools");
  assert.ok(Array.isArray(sceneControls[0]?.tools));
  assert.notEqual(sceneControls[0]?.layer, "tokens");
  assert.equal(typeof canvas[sceneControls[0]?.layer]?.activate, "function");
  canvas[sceneControls[0].layer].activate();
  assert.deepEqual(sceneControlInitializations, [{ control: "dmicher-spotlight-tools" }]);
} else {
  assert.ok(sceneControls["dmicher-spotlight-tools"]);
  assert.equal(Array.isArray(sceneControls["dmicher-spotlight-tools"].tools), false);
}

installTechnicalChatFixture({ empty: true });
await Promise.all(hooks.call("ready"));
for (const callback of scheduledTimeouts.splice(0)) callback();
for (const callback of intervalCallbacks) callback();
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

assert.equal(asyncErrors.length, 0, asyncErrors.map((error) => error?.stack ?? String(error)).join("\n"));
assert.ok(socketListeners.size > 0);
assert.ok(audioPreloads.length > 0);
assert.deepEqual(playerRenderCalls.at(-1), [true]);

const requestTextSetting = Array.from(registeredSettings.entries()).find(([id]) => id.endsWith(".requestCommonText"));
assert.ok(requestTextSetting, "request text setting was not registered");

process.stdout.write(JSON.stringify({
  generation,
  apiInstalled: Boolean(moduleRecord.api),
  readyCompleted: true,
  invalidScopes,
  chatRenderHook: expectedChatHook,
  requestSettingScope: requestTextSetting[1].scope,
  registeredSettings: registeredSettings.size,
  registeredMenus: registeredMenus.size
}));
