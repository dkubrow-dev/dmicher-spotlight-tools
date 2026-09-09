import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODULE_ID, REQUEST_TYPES } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  getPremiumStatus, isPremiumActive, openPremiumSettings,
  subscribePremiumChanges, waitForPremiumReady
} from "../dmicher-spotlight-tools/scripts/premium-provider.js";
import { registerPremiumFixture, notifyPremiumFixtureChanged } from "./fixtures/premium.mjs";
import {
  createDefaultRequestConfiguration, getRequestConfiguration, getStoredRequestConfiguration,
  getRequestImage, getRequestSound, getRequestBaseVolume, mergeRequestConfigurationUpdate,
  normalizeRequestConfiguration
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-config.js";
import { isTechnicalChatEnabled } from "../dmicher-spotlight-tools/scripts/technical-chat.js";

const ru = JSON.parse(readFileSync(new URL("../dmicher-spotlight-tools/lang/ru.json", import.meta.url), "utf8"));
function localize(key) { return key.split(".").reduce((value, part) => value?.[part], ru) ?? key; }
function installWorld(stored = createDefaultRequestConfiguration()) {
  globalThis.game = {
    settings: {
      get: (_namespace, key) => key === "requestConfiguration" ? stored : undefined,
      set: () => assert.fail("Policy reads must not rewrite saved preferences")
    },
    modules: new Map([[MODULE_ID, { title: "Spotlight Tools", version: "1.3.0" }]]),
    i18n: {
      localize,
      format: (key, data) => localize(key).replace(/\{(\w+)\}/g, (_match, name) => data[name] ?? "")
    }
  };
  return stored;
}
function customConfiguration() {
  const stored = createDefaultRequestConfiguration();
  stored.chatEnabled = false;
  stored.soundsEnabled = false;
  stored.feed = { enabled: false, showToPlayers: false, showTime: false };
  stored.chatNotifications = { polls: false, timers: false };
  stored.blockWhenEnvironment = false;
  stored.images.common = { custom: true, url: "https://example.test/custom.webp" };
  stored.sounds.common = { custom: true, url: "https://example.test/custom.ogg", volume: 0.25 };
  stored.timerSounds.timer = { custom: true, url: "https://example.test/timer.ogg", volume: 0.4 };
  return stored;
}
test.beforeEach(() => registerPremiumFixture(null));
test.afterEach(() => registerPremiumFixture(null));

test("the free base forces only Premium defaults and never rewrites stored preferences", () => {
  const stored = installWorld(customConfiguration());
  const snapshot = structuredClone(stored);
  const effective = getRequestConfiguration();
  assert.equal(getPremiumStatus().available, false);
  assert.equal(effective.chatEnabled, true);
  assert.equal(effective.soundsEnabled, true);
  assert.equal(effective.feed.showTime, true);
  assert.equal(effective.feed.enabled, false);
  assert.equal(effective.feed.showToPlayers, false);
  assert.equal(effective.blockWhenEnvironment, false);
  assert.deepEqual(effective.chatNotifications, stored.chatNotifications);
  assert.deepEqual(effective.limits, stored.limits);
  assert.equal(getRequestImage("common"), REQUEST_TYPES.common.image);
  assert.equal(getRequestSound("common"), REQUEST_TYPES.common.sound);
  assert.equal(getRequestBaseVolume("common"), 1);
  assert.equal(effective.timerSounds.timer.custom, false);
  assert.equal(isTechnicalChatEnabled(), true);
  assert.equal(isTechnicalChatEnabled("polls"), false);
  assert.deepEqual(stored, snapshot);
  assert.deepEqual(getStoredRequestConfiguration(), snapshot);
});

test("Premium changes apply dynamically and restore saved resources after access returns", () => {
  const stored = installWorld(customConfiguration());
  let active = true;
  let changes = 0;
  const unsubscribe = subscribePremiumChanges(() => { changes += 1; });
  try {
    registerPremiumFixture({ isActive: () => active, resolveConfiguration: (raw) => raw });
    assert.equal(isPremiumActive(), true);
    assert.equal(isTechnicalChatEnabled(), false);
    assert.equal(getRequestImage("common"), stored.images.common.url);
    assert.equal(getRequestConfiguration().feed.showTime, false);
    active = false;
    notifyPremiumFixtureChanged();
    assert.equal(isTechnicalChatEnabled(), true);
    assert.equal(getRequestImage("common"), REQUEST_TYPES.common.image);
    active = true;
    notifyPremiumFixtureChanged();
    assert.equal(getRequestSound("common"), stored.sounds.common.url);
    assert.equal(changes, 3);
  } finally { unsubscribe(); }
});

test("a satellite cannot overwrite common options or mutate their stored input", () => {
  const stored = installWorld(customConfiguration());
  const snapshot = structuredClone(stored);
  registerPremiumFixture({
    isActive: () => true,
    resolveConfiguration(raw, defaults) {
      raw.feed.enabled = true;
      raw.chatNotifications.polls = true;
      raw.limits = {};
      defaults.images.common.url = "https://example.test/changed.webp";
      return raw;
    }
  });
  const effective = getRequestConfiguration();
  assert.equal(effective.feed.enabled, false);
  assert.equal(effective.chatNotifications.polls, false);
  assert.deepEqual(effective.limits, snapshot.limits);
  assert.deepEqual(stored, snapshot);
});

test("a free settings save preserves locked values while accepting common changes", () => {
  const stored = customConfiguration();
  const submitted = createDefaultRequestConfiguration();
  submitted.feed.showToPlayers = true;
  const merged = mergeRequestConfigurationUpdate(stored, submitted);
  assert.equal(merged.chatEnabled, false);
  assert.equal(merged.soundsEnabled, false);
  assert.equal(merged.feed.showTime, false);
  assert.equal(merged.feed.showToPlayers, true);
  assert.deepEqual(merged.images, stored.images);
  assert.deepEqual(merged.sounds, stored.sounds);
  assert.deepEqual(merged.timerSounds, stored.timerSounds);
});

test("throwing and asynchronous providers fall back to free configuration", (t) => {
  t.mock.method(console, "warn", () => undefined);
  installWorld(customConfiguration());
  registerPremiumFixture({ isActive: () => true, resolveConfiguration: () => { throw new Error("unavailable"); } });
  assert.equal(getRequestConfiguration().chatEnabled, true);
  assert.equal(isPremiumActive(), false);
  registerPremiumFixture({ isActive: () => true, resolveConfiguration: async (raw) => raw });
  assert.equal(getRequestConfiguration().images.common.custom, false);
  assert.equal(isPremiumActive(), false);
  registerPremiumFixture({ isActive: () => { throw new Error("expired"); }, resolveConfiguration: (raw) => raw });
  assert.equal(getRequestConfiguration().feed.showTime, true);
});

test("rejected asynchronous provider methods cannot create unhandled rejections", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  installWorld(customConfiguration());
  registerPremiumFixture({
    isActive: async () => { throw new Error("asynchronous activity failure"); },
    resolveConfiguration: (raw) => raw
  });
  assert.equal(getRequestConfiguration().chatEnabled, true);
  registerPremiumFixture({
    isActive: () => true,
    resolveConfiguration: async () => { throw new Error("asynchronous configuration failure"); }
  });
  assert.equal(getRequestConfiguration().images.common.custom, false);
  await new Promise((resolve) => setImmediate(resolve));
});

test("startup ignores a missing bridge provider and shares one pending check", async () => {
  installWorld();
  await waitForPremiumReady(1);
  let complete;
  const readyPromise = new Promise((resolve) => { complete = resolve; });
  registerPremiumFixture({ isActive: () => false, readyPromise });
  const first = waitForPremiumReady();
  assert.equal(first, waitForPremiumReady());
  let started = false;
  void first.then(() => { started = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, false);
  complete();
  await first;
  assert.equal(started, true);
});

test("failed or stuck satellite startup cannot block the free base indefinitely", async () => {
  installWorld();
  registerPremiumFixture({ isActive: () => false, readyPromise: Promise.reject(new Error("startup failed")) });
  await waitForPremiumReady();
  const readyPromise = new Promise(() => {});
  registerPremiumFixture({ isActive: () => false, readyPromise });
  const bounded = waitForPremiumReady(1);
  await bounded;
  assert.equal(waitForPremiumReady(), bounded);
  assert.equal(getRequestConfiguration().chatEnabled, true);
});

test("configuration extensions can delegate to the free implementation without changing free fields", () => {
  const stored = installWorld(customConfiguration());
  const proposed = createDefaultRequestConfiguration();
  proposed.feed.enabled = true;
  const snapshot = structuredClone({ stored, proposed });
  registerPremiumFixture({
    resolveConfiguration(raw, defaults, base) {
      const free = base(raw, defaults);
      assert.equal(free.chatEnabled, true);
      return { ...raw, chatEnabled: false };
    },
    mergeConfiguration(raw, next, base) {
      const free = base(raw, next);
      assert.equal(free.chatEnabled, raw.chatEnabled);
      next.feed.enabled = false;
      raw.images.common.url = "https://example.test/mutated.webp";
      return next;
    }
  });
  assert.equal(getRequestConfiguration().chatEnabled, false);
  const merged = mergeRequestConfigurationUpdate(stored, proposed);
  assert.equal(merged.chatEnabled, true);
  assert.equal(merged.feed.enabled, true);
  assert.deepEqual({ stored, proposed }, snapshot);
});

test("a malformed merge preserves saved Premium fields and quarantines this extension until notification", (t) => {
  t.mock.method(console, "warn", () => undefined);
  const stored = installWorld(customConfiguration());
  const proposed = createDefaultRequestConfiguration();
  let broken = true;
  registerPremiumFixture({ mergeConfiguration: (_raw, next) => broken ? { ...next, images: {} } : next });
  const fallback = mergeRequestConfigurationUpdate(stored, proposed);
  assert.equal(fallback.chatEnabled, stored.chatEnabled);
  assert.deepEqual(fallback.images, stored.images);
  assert.equal(isPremiumActive(), false);
  assert.equal(getRequestConfiguration().chatEnabled, true);
  broken = false;
  notifyPremiumFixtureChanged();
  assert.equal(isPremiumActive(), true);
  assert.equal(mergeRequestConfigurationUpdate(stored, proposed).chatEnabled, true);
});

test("Premium settings are opened through the bridge and remain available without a grant", () => {
  installWorld();
  assert.equal(openPremiumSettings(), null);
  const application = {};
  let opened = 0;
  registerPremiumFixture({ isActive: () => false, openSettings: () => { opened += 1; return application; } });
  assert.equal(getPremiumStatus().active, false);
  assert.equal(getPremiumStatus().settingsAvailable, true);
  assert.equal(openPremiumSettings(), application);
  assert.equal(opened, 1);
});

const malformedResources = [
  (value) => { value.images = null; return value; },
  (value) => { value.images.extra = value; return value; },
  (value) => { value.sounds.common.extra = value.sounds; return value; },
  (value) => { value.timerSounds.extra = { invalid: 1n }; return value; }
];

test("malformed or unserializable resolve results use free defaults without losing stored preferences", (t) => {
  t.mock.method(console, "warn", () => undefined);
  for (const damage of malformedResources) {
    const stored = installWorld(customConfiguration());
    const snapshot = structuredClone(stored);
    registerPremiumFixture({ resolveConfiguration: damage });
    let effective;
    assert.doesNotThrow(() => { effective = getRequestConfiguration(); });
    assert.equal(effective.chatEnabled, true);
    assert.equal(effective.feed.showTime, true);
    assert.deepEqual(effective.images, createDefaultRequestConfiguration().images);
    assert.deepEqual(effective.sounds, createDefaultRequestConfiguration().sounds);
    assert.deepEqual(effective.timerSounds, createDefaultRequestConfiguration().timerSounds);
    assert.deepEqual(stored, snapshot);
    assert.equal(isPremiumActive(), false);
  }
});

test("malformed or unserializable merge results preserve saved paid values and accept free changes", (t) => {
  t.mock.method(console, "warn", () => undefined);
  for (const damage of malformedResources) {
    const stored = installWorld(customConfiguration());
    const proposed = createDefaultRequestConfiguration();
    proposed.feed.enabled = true;
    const snapshot = structuredClone({ stored, proposed });
    registerPremiumFixture({ mergeConfiguration: (_stored, next) => damage(next) });
    let merged;
    assert.doesNotThrow(() => { merged = mergeRequestConfigurationUpdate(stored, proposed); });
    assert.equal(merged.chatEnabled, stored.chatEnabled);
    assert.equal(merged.feed.showTime, stored.feed.showTime);
    assert.equal(merged.feed.enabled, true);
    assert.deepEqual(merged.images, stored.images);
    assert.deepEqual(merged.sounds, stored.sounds);
    assert.deepEqual(merged.timerSounds, stored.timerSounds);
    assert.deepEqual({ stored, proposed }, snapshot);
    assert.equal(isPremiumActive(), false);
  }
});
