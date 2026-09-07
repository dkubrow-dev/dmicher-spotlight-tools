import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODULE_ID, REQUEST_TYPES } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  getPremiumStatus, isPremiumActive, notifyPremiumChanged,
  registerPremiumProvider, subscribePremiumChanges, waitForPremiumReady
} from "../dmicher-spotlight-tools/scripts/premium-provider.js";
import {
  createDefaultRequestConfiguration, getRequestConfiguration, getStoredRequestConfiguration,
  getRequestImage, getRequestSound, getRequestBaseVolume, mergeRequestConfigurationUpdate,
  normalizeRequestConfiguration
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-config.js";
import { isTechnicalChatEnabled } from "../dmicher-spotlight-tools/scripts/technical-chat.js";
import { buildWelcomeMessageContent } from "../dmicher-spotlight-tools/scripts/tools/requests/request-message.js";

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
  stored.welcome = { gm: false, players: false, showPremiumStatus: false };
  stored.feed = { enabled: false, showToPlayers: false, showTime: false };
  stored.chatNotifications = { polls: false, timers: false };
  stored.blockWhenEnvironment = false;
  stored.images.common = { custom: true, url: "https://example.test/custom.webp" };
  stored.sounds.common = { custom: true, url: "https://example.test/custom.ogg", volume: 0.25 };
  stored.timerSounds.timer = { custom: true, url: "https://example.test/timer.ogg", volume: 0.4 };
  return stored;
}
test.beforeEach(() => registerPremiumProvider(null));
test.afterEach(() => registerPremiumProvider(null));

test("the free base forces only Premium defaults and never rewrites stored preferences", () => {
  const stored = installWorld(customConfiguration());
  const snapshot = structuredClone(stored);
  const effective = getRequestConfiguration();
  assert.equal(getPremiumStatus().available, false);
  assert.equal(effective.chatEnabled, true);
  assert.equal(effective.soundsEnabled, true);
  assert.equal(effective.feed.showTime, true);
  assert.deepEqual(effective.welcome, { gm: true, players: true, showPremiumStatus: false });
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
    registerPremiumProvider({ isActive: () => active, resolveConfiguration: (raw) => raw });
    assert.equal(isPremiumActive(), true);
    assert.equal(isTechnicalChatEnabled(), false);
    assert.equal(getRequestImage("common"), stored.images.common.url);
    assert.equal(getRequestConfiguration().feed.showTime, false);
    active = false;
    notifyPremiumChanged();
    assert.equal(isTechnicalChatEnabled(), true);
    assert.equal(getRequestImage("common"), REQUEST_TYPES.common.image);
    active = true;
    notifyPremiumChanged();
    assert.equal(getRequestSound("common"), stored.sounds.common.url);
    assert.deepEqual(getRequestConfiguration().welcome, stored.welcome);
    assert.equal(changes, 3);
  } finally { unsubscribe(); }
});

test("a satellite cannot overwrite common options or mutate their stored input", () => {
  const stored = installWorld(customConfiguration());
  const snapshot = structuredClone(stored);
  registerPremiumProvider({
    isActive: () => true,
    resolveConfiguration(raw, defaults) {
      raw.feed.enabled = true;
      raw.chatNotifications.polls = true;
      raw.limits = {};
      raw.welcome.showPremiumStatus = true;
      defaults.images.common.url = "https://example.test/changed.webp";
      return raw;
    }
  });
  const effective = getRequestConfiguration();
  assert.equal(effective.feed.enabled, false);
  assert.equal(effective.chatNotifications.polls, false);
  assert.equal(effective.welcome.showPremiumStatus, false);
  assert.deepEqual(effective.limits, snapshot.limits);
  assert.deepEqual(stored, snapshot);
});

test("a free settings save preserves locked values while accepting common changes", () => {
  const stored = customConfiguration();
  const submitted = createDefaultRequestConfiguration();
  submitted.feed.showToPlayers = true;
  submitted.welcome.showPremiumStatus = true;
  const merged = mergeRequestConfigurationUpdate(stored, submitted);
  assert.equal(merged.chatEnabled, false);
  assert.equal(merged.soundsEnabled, false);
  assert.equal(merged.feed.showTime, false);
  assert.equal(merged.feed.showToPlayers, true);
  assert.equal(merged.welcome.gm, false);
  assert.equal(merged.welcome.players, false);
  assert.equal(merged.welcome.showPremiumStatus, true);
  assert.deepEqual(merged.images, stored.images);
  assert.deepEqual(merged.sounds, stored.sounds);
  assert.deepEqual(merged.timerSounds, stored.timerSounds);
});

test("legacy welcome choices migrate to both audiences without changing free defaults", () => {
  const migrated = normalizeRequestConfiguration({ showWelcome: false });
  assert.deepEqual(migrated.welcome, { gm: false, players: false, showPremiumStatus: true });
  installWorld(migrated);
  assert.equal(getRequestConfiguration().welcome.gm, true);
  registerPremiumProvider({ isActive: () => true, resolveConfiguration: (raw) => raw });
  assert.equal(getRequestConfiguration().welcome.players, false);
  const partial = normalizeRequestConfiguration({ showWelcome: false, welcome: { gm: true } });
  assert.equal(partial.welcome.gm, true);
  assert.equal(partial.welcome.players, false);
});

test("throwing and asynchronous providers fall back to free configuration", (t) => {
  t.mock.method(console, "warn", () => undefined);
  installWorld(customConfiguration());
  registerPremiumProvider({ isActive: () => true, resolveConfiguration: () => { throw new Error("unavailable"); } });
  assert.equal(getRequestConfiguration().chatEnabled, true);
  assert.equal(isPremiumActive(), false);
  registerPremiumProvider({ isActive: () => true, resolveConfiguration: async (raw) => raw });
  assert.equal(getRequestConfiguration().images.common.custom, false);
  assert.equal(isPremiumActive(), false);
  registerPremiumProvider({ isActive: () => { throw new Error("expired"); }, resolveConfiguration: (raw) => raw });
  assert.equal(getRequestConfiguration().feed.showTime, true);
});

test("version status uses the requested audience-specific text and can be hidden for free", () => {
  const stored = installWorld();
  const messages = ru.DMICHERSPOTLIGHTTOOLS.Requests.Welcome;
  const gm = buildWelcomeMessageContent(true);
  assert.ok(gm.includes(messages.FreeMasterBefore));
  assert.match(gm, /href="https:\/\/boosty\.to\/dmicher"/);
  const player = buildWelcomeMessageContent(false);
  assert.ok(player.includes(messages.FreePlayer));
  assert.doesNotMatch(player, /href="https:\/\/boosty\.to/);
  registerPremiumProvider({ isActive: () => true, resolveConfiguration: (raw) => raw });
  assert.ok(buildWelcomeMessageContent(true).includes(messages.PremiumActive));
  assert.ok(buildWelcomeMessageContent(false).includes(messages.PremiumActive));
  assert.doesNotMatch(buildWelcomeMessageContent(true), /href="https:\/\/boosty\.to/);
  registerPremiumProvider(null);
  stored.welcome.showPremiumStatus = false;
  assert.doesNotMatch(buildWelcomeMessageContent(true), /dmicher-request-welcome-support|dmicher-request-welcome-divider/);
});

test("rejected asynchronous provider methods cannot create unhandled rejections", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  installWorld(customConfiguration());
  registerPremiumProvider({
    isActive: async () => { throw new Error("asynchronous activity failure"); },
    resolveConfiguration: (raw) => raw
  });
  assert.equal(getRequestConfiguration().chatEnabled, true);
  registerPremiumProvider({
    isActive: () => true,
    resolveConfiguration: async () => { throw new Error("asynchronous configuration failure"); }
  });
  assert.equal(getRequestConfiguration().images.common.custom, false);
  await new Promise((resolve) => setImmediate(resolve));
});

test("startup ignores a missing or inactive satellite and shares one pending check", async () => {
  installWorld();
  await waitForPremiumReady(1);
  game.modules.set("dmicher-premium", {active:false, api:{readyPromise:new Promise(() => {})}});
  await waitForPremiumReady(1);
  let complete;
  const readyPromise = new Promise((resolve) => { complete = resolve; });
  game.modules.set("dmicher-premium", {active:true, api:{readyPromise}});
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
  game.modules.set("dmicher-premium", {active:true, api:{readyPromise:Promise.reject(new Error("startup failed"))}});
  await waitForPremiumReady();
  const readyPromise = new Promise(() => {});
  game.modules.set("dmicher-premium", {active:true, api:{readyPromise}});
  const bounded = waitForPremiumReady(1);
  await bounded;
  assert.equal(waitForPremiumReady(), bounded);
  assert.equal(getRequestConfiguration().chatEnabled, true);
});
