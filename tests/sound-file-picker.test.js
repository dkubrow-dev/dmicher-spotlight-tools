import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

globalThis.foundry = { applications: {
  api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {} }, apps: {}
} };
globalThis.HTMLElement = class {};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.window = globalThis;
const { generics } = await import("../dmicher-spotlight-tools/scripts/generics.js");
const { getPremiumSoundPickerOptions, getPremiumStatus } = await import("../dmicher-spotlight-tools/scripts/premium-provider.js");
const { registerRequestSettings } = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-settings.js");
const { createDefaultRequestConfiguration, getRequestConfiguration } = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-config.js");
const { spotlightExtension } = await import("../../dmicher-premium/dmicher-premium/sctipts/features/spotlight/index.js");
let registration;
test.afterEach(() => { registration?.dispose(); registration = null; });

function fixture({ generation = 14, active = true, canBrowse = true, canUpload = true, methods = spotlightExtension.methods } = {}) {
  const state = { active, canBrowse, canUpload, attached: true, pickers: [], changes: [], writes: [], warnings: [], errors: [] };
  const configuration = createDefaultRequestConfiguration(), menus = new Map();
  globalThis.game = {
    release: { generation }, user: { role: 4, can: permission => permission === "FILES_BROWSE" ? state.canBrowse : state.canUpload },
    i18n: { lang: "en", localize: key => key },
    settings: { register() {}, registerMenu(_id, name, options) { menus.set(name, options.type); },
      get: (_id, key) => key === "requestConfiguration" ? configuration : "",
      async set(id, key, value) { state.writes.push({ id, key, value }); } }
  };
  globalThis.ui = { notifications: { warn: message => state.warnings.push(message),
    error: message => state.errors.push(message), info() {} } };
  foundry.applications.apps.FilePicker = { implementation: class {
    constructor(options) { this.options = options; state.pickers.push(this); }
    async browse() { this.browsed = true; }
  } };
  registration = generics.premium.registerProvider({ apiVersion: 1, hasAccess: () => state.active,
    extensions: [{ ...spotlightExtension, methods }] });
  registerRequestSettings({});
  const app = new (menus.get("requestMasterSettings"))();
  app.rendered = true;
  app.render = async () => app;
  const input = { value: "https://example.test/prior.ogg", dispatchEvent: event => state.changes.push(event.type) };
  const toggle = { checked: true, dataset: { resourcePrefix: "commonSound" } };
  const button = { dataset: { resourcePrefix: "commonSound" } };
  const form = { elements: { commonSoundUrl: input, commonSoundCustom: toggle }, querySelector: () => button };
  app.element = { contains: candidate => state.attached && candidate === form };
  return { state, app, form, input, toggle, button, configuration };
}

test("the file picker is an additive licensed value override and an older provider keeps URL access", () => {
  assert.equal(getPremiumSoundPickerOptions("sounds/bell.ogg"), null);
  const { state } = fixture({ active: false });
  assert.equal(getPremiumSoundPickerOptions("sounds/bell.ogg"), null);
  state.active = true;
  assert.deepEqual(getPremiumSoundPickerOptions(" sounds/bell.ogg "), { type: "audio", current: "sounds/bell.ogg" });
  state.active = false;
  assert.equal(getPremiumSoundPickerOptions("sounds/bell.ogg"), null);
  registration.dispose();
  const { app, toggle, button, form } = fixture({ methods: { resolveConfiguration: spotlightExtension.methods.resolveConfiguration,
    mergeConfiguration: spotlightExtension.methods.mergeConfiguration } });
  assert.equal(getPremiumStatus().active, true);
  assert.equal(getPremiumSoundPickerOptions("sounds/bell.ogg"), null);
  app.updateCustomResourceControls(toggle, form);
  assert.equal(button.disabled, true);
});

for (const generation of [13, 14]) test(`Foundry ${generation}: native audio picker edits only the draft and leaves uploads to native permissions`, async () => {
  const { state, app, input, form, button } = fixture({ generation, canUpload: false });
  await app.openSoundPicker(button, form);
  const picker = state.pickers[0];
  assert.equal(picker.browsed, true);
  assert.equal(picker.options.type, "audio");
  assert.equal(picker.options.current, "https://example.test/prior.ogg");
  assert.equal(Object.hasOwn(picker.options, "allowUpload"), false);
  assert.equal(Object.hasOwn(picker.options, "field"), false, "native field writes must not bypass the late-result guard");
  picker.options.callback("worlds/test/sounds/uploaded bell.ogg");
  assert.equal(input.value, "worlds/test/sounds/uploaded bell.ogg");
  assert.deepEqual(state.changes, ["change"]);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.errors, []);
});

test("expired access, denied browse permission and a non-moderator cannot open the picker", async () => {
  const { state, app, form, button } = fixture({ active: false });
  await app.openSoundPicker(button, form);
  state.active = true; state.canBrowse = false;
  await app.openSoundPicker(button, form);
  state.canBrowse = true; game.user.role = 1;
  await app.openSoundPicker(button, form);
  assert.deepEqual(state.pickers, []);
  assert.equal(state.warnings.length, 2);
});

test("late selection cannot modify a closed, replaced, disabled or no-longer-licensed form", async () => {
  const { state, app, form, button, input, toggle } = fixture();
  await app.openSoundPicker(button, form);
  const select = state.pickers[0].options.callback;
  state.active = false; select("sounds/expired.ogg"); state.active = true;
  app.rendered = false; select("sounds/closed.ogg"); app.rendered = true;
  state.attached = false; select("sounds/replaced.ogg"); state.attached = true;
  toggle.checked = false; select("sounds/disabled.ogg");
  assert.equal(input.value, "https://example.test/prior.ogg");
  assert.deepEqual(state.changes, []);
});

test("custom toggle disables the picker and cancelling it preserves the previous draft", async () => {
  const { state, app, form, button, input, toggle } = fixture();
  await app.openSoundPicker(button, form);
  assert.equal(input.value, "https://example.test/prior.ogg");
  assert.deepEqual(state.writes, []);
  toggle.checked = false;
  app.updateCustomResourceControls(toggle, form);
  assert.equal(button.disabled, true);
  await app.openSoundPicker(button, form);
  assert.equal(state.pickers.length, 1);
});

test("relative sound files and external URLs are validated, saved and resolved through the same Premium configuration", async t => {
  const { state, app, configuration } = fixture();
  const paths = { commonSound: "worlds/test/sounds/local.ogg", timerTimerSound: "sounds/timer.ogg", breakTimerSound: "https://example.test/break.ogg" };
  const values = new Map([["chatEnabled", "on"], ["soundsEnabled", "on"], ["feedEnabled", "on"], ["feedShowToPlayers", "on"], ["feedShowTime", "on"]]);
  for (const [prefix, path] of Object.entries(paths)) { values.set(prefix + "Custom", "on"); values.set(prefix + "Url", path); }
  const PreviousFormData = globalThis.FormData;
  globalThis.FormData = class { get(key) { return values.get(key) ?? null; } has(key) { return values.has(key); } };
  t.after(() => { globalThis.FormData = PreviousFormData; });
  const fetched = [];
  t.mock.method(globalThis, "fetch", async (url, options) => { fetched.push({ url, options }); return { ok: true, blob: async () => new Blob(["audio"]) }; });
  const PreviousAudio = globalThis.Audio;
  globalThis.Audio = class extends EventTarget { constructor() { super(); this.readyState = 1; } load() { queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata"))); } };
  t.after(() => { if (PreviousAudio) globalThis.Audio = PreviousAudio; else delete globalThis.Audio; });
  await app._saveSettings({ preventDefault() {}, currentTarget: { elements: {}, querySelector: () => ({ disabled: false }) } });
  assert.deepEqual(state.errors, []);
  assert.deepEqual(fetched.map(entry => entry.url), Object.values(paths));
  assert.ok(fetched.every(entry => entry.options.credentials === "same-origin"));
  assert.equal(state.writes.length, 1);
  Object.assign(configuration, state.writes[0].value);
  let effective = getRequestConfiguration();
  assert.equal(effective.sounds.common.url, paths.commonSound);
  assert.equal(effective.timerSounds.timer.url, paths.timerTimerSound);
  assert.equal(effective.timerSounds.break.url, paths.breakTimerSound);
  state.active = false;
  effective = getRequestConfiguration();
  assert.equal(effective.sounds.common.custom, false);
  assert.equal(configuration.sounds.common.url, paths.commonSound);
});

test("all sound rows accept native relative paths while image rows retain their URL control", () => {
  const template = readFileSync(new URL("../dmicher-spotlight-tools/templates/request-master-settings.hbs", import.meta.url), "utf8");
  const soundRows = template.slice(template.indexOf("{{#each soundResources}}"));
  assert.match(soundRows, /type="text" name="\{\{prefix\}\}Url"/);
  assert.match(soundRows, /data-sound-file-picker/);
  assert.doesNotMatch(soundRows, /type="url"/);
  assert.match(template.slice(0, template.indexOf("{{#each soundResources}}")), /type="url" name="\{\{prefix\}\}Url"/);
});
