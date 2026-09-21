import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generics } from "../dmicher-spotlight-tools/scripts/generics.js";

globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => Base } },
  utils: { randomID: () => `id-${++sequence}`, deepClone: structuredClone }, documents: {}, audio: { AudioHelper: {} } };
let sequence = 0;
const { SpotlightAutomation } = await import("../dmicher-spotlight-tools/scripts/automation/adapter.js");
const { StopwatchTool } = await import("../dmicher-spotlight-tools/scripts/tools/stopwatch/stopwatch-tool.js");
const { TimerTool } = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-tool.js");
const { FocusAutomationObserver, allInZone } = await import("../dmicher-spotlight-tools/scripts/automation/focus-observer.js");
const { publishAutomation, deliverAutomationEvent } = await import("../dmicher-spotlight-tools/scripts/automation/events.js");
const { createAutomationDraft } = await import("../dmicher-spotlight-tools/scripts/automation/ui.js");
const { FUNCTIONS } = await import("../dmicher-spotlight-tools/scripts/automation/catalog.js");
const MODULE = "dmicher-spotlight-tools";
let premium;
function setup() {
  premium?.dispose();
  const values = new Map(), definitions = new Map(), writes = [];
  const gm = { id: "gm", role: 4, active: true, name: "GM" };
  const player = { id: "p", role: 1, active: true, name: "Player" };
  const users = [gm, player]; users.get = (id) => users.find((user) => user.id === id);
  globalThis.game = { user: gm, users, i18n: { localize: (key) => key, lang: "en" },
    modules: new Map(), messages: [], settings: {
      register(_namespace, key, definition) { definitions.set(key, definition); if (!values.has(key)) values.set(key, structuredClone(definition.default)); },
      get: (_namespace, key) => values.get(key),
      async set(_namespace, key, value) { writes.push(key); values.set(key, structuredClone(value)); definitions.get(key)?.onChange?.(value); return value; }
    } };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  delete globalThis.canvas;
  const cancelled = [];
  const requestTool = { state: { entries: [{ id: "environment", urgency: "stop" }, { id: "player", urgency: "common" }] },
    async processResolution(id, completed, _user, { check } = {}) { check?.(); cancelled.push([id, completed]); return true; } };
  const pollTool = { state: { templates: { poll: { id: "poll", name: "Poll" } }, activePoll: { templateId: "other" } },
    getTemplate(id) { return this.state.templates[id]; } };
  const timerTool = { state: { timers: { a: { id: "a", templateId: "timer" }, b: { id: "b", templateId: "other" } } },
    getTimerTemplates: () => [{ id: "timer", name: "Timer" }], getTimerTemplate: (id) => id === "timer" ? { id } : null,
    async deleteTimers(ids) { return ids; } };
  const stopwatchTool = new StopwatchTool(); stopwatchTool.registerSettings();
  const focusAuditTool = { state: { players: { p: { enabled: true, lastGrantedAt: Date.now() - 2000000 } } },
    async updateState(mutator) { return mutator(this.state); }, getMutableEntry(state, id) { return state.players[id]; } };
  const api = new SpotlightAutomation({ requestTool, pollTool, timerTool, stopwatchTool, focusAuditTool });
  api.registerSettings(); api.activate();
  game.modules.set(MODULE, { api: { automation: api }, active: true });
  return { api, values, writes, gm, player, cancelled, stopwatchTool, timerTool, pollTool, focusAuditTool };
}
const owner = { type: "requests", id: "requests" };
const context = (owner) => ({ owner, current: () => true });
const subscription = () => ({ id: "s", enabled: true, source: owner, event: "requests.submitted", script: { steps: [] } });
function allowPremium() {
  premium = generics.premium.registerProvider({ apiVersion: 1, hasAccess: () => true,
    extensions: [{ moduleId: MODULE, apiVersion: 1, methods: { authorizeAutomation: () => true } }] });
}

test("world sources and reads need no scene and never seed preparation", () => {
  const { api, writes } = setup();
  assert.equal(api.sources().length, 6);
  assert.deepEqual(api.readBindings(owner), { revision: 0, subscriptions: [], registeredMacroUuids: [] });
  assert.deepEqual(writes, []);
  for (const fn of FUNCTIONS) assert.equal(api.functions({ type: fn.ownerTypes[0], id: "template" }).some((candidate) => candidate.id === fn.id), true);
});

test("binding revision checks validate the owner without cloning preparation or writing settings", async () => {
  const {api,writes}=setup();
  assert.equal(api.getBindingsRevision(owner),0);
  await api.saveBindings(owner,{subscriptions:[subscription()]},{expectedRevision:0});
  const before=writes.length;
  api.readBindings=()=>assert.fail("Revision checks must not copy the complete preparation");
  assert.equal(api.getBindingsRevision(owner),1);
  assert.throws(()=>api.getBindingsRevision({type:"polls",id:"missing"}),/no longer exists/);
  assert.equal(writes.length,before);
});

test("Spotlight subscription limits count disabled self rows and use only Spotlight grants", async () => {
  const {api,values}=setup();
  const rows=Array.from({length:8},(_,index)=>({...subscription(),id:`s${index}`,enabled:false}));
  await api.saveBindings(owner,{subscriptions:rows},{expectedRevision:0});
  assert.deepEqual(api.getAutomationLimits(),{scriptSteps:16,subscriptions:8,actions:4,chainHandlers:8});
  await assert.rejects(api.saveBindings(owner,{subscriptions:[...rows,{...subscription(),id:"ninth"}]},{expectedRevision:1}),/8/);
  premium=generics.premium.registerProvider({apiVersion:1,hasAccess:id=>id === "dmicher-master-screen",extensions:[{
    moduleId:"dmicher-master-screen",apiVersion:1,methods:{resolveAutomationLimits:()=>({scriptSteps:null,subscriptions:null,actions:null,chainHandlers:null})}
  }]});
  assert.equal(api.getAutomationLimits().subscriptions,8);
  premium.dispose();
  premium=generics.premium.registerProvider({apiVersion:1,hasAccess:id=>id === MODULE,extensions:[{
    moduleId:MODULE,apiVersion:1,methods:{resolveAutomationLimits:()=>({scriptSteps:null,subscriptions:null,actions:null,chainHandlers:null})}
  }]});
  const saved=await api.saveBindings(owner,{subscriptions:[...rows,{...subscription(),id:"ninth"}]},{expectedRevision:1});
  assert.equal(saved.subscriptions.length,9);
  premium.dispose();
  assert.equal(api.readBindings(owner).subscriptions.length,9);
  await api.saveBindings(owner,{subscriptions:saved.subscriptions.map(row=>({...row,enabled:true}))},{expectedRevision:2});
  await assert.rejects(api.saveBindings(owner,{subscriptions:[...saved.subscriptions,{...subscription(),id:"tenth"}]},{expectedRevision:3}),/8/);
  await api.saveBindings(owner,{subscriptions:rows},{expectedRevision:3});
  assert.equal(values.get("automationBindings")["requests:requests"].subscriptions.length,8);
});

test("Premium Spotlight preparation accepts more than the former hundred-subscription cap", async () => {
  const {api}=setup();
  premium=generics.premium.registerProvider({apiVersion:1,hasAccess:()=>true,extensions:[{moduleId:MODULE,apiVersion:1,
    methods:{resolveAutomationLimits:()=>({scriptSteps:null,subscriptions:null,actions:null,chainHandlers:null})}}]});
  const saved=await api.saveBindings(owner,{subscriptions:Array.from({length:101},(_,index)=>({...subscription(),id:`sub-${index}`}))},{expectedRevision:0});
  assert.equal(saved.subscriptions.length,101);premium.dispose();
  assert.equal(api.readBindings(owner).subscriptions.length,101);
});

test("every source event exposes independent bilingual labels without changing its ID", () => {
  const { api } = setup();
  const sources = api.sources();
  for (const source of sources) for (const event of source.events) {
    assert.equal(typeof source.eventLabels[event].ru, "string");
    assert.equal(typeof source.eventLabels[event].en, "string");
    assert.notEqual(source.eventLabels[event].ru, event);
    assert.notEqual(source.eventLabels[event].en, event);
  }
  sources[0].eventLabels["requests.submitted"].en = "Changed";
  assert.equal(api.sources()[0].eventLabels["requests.submitted"].en, "Request submitted");
  const draft = createAutomationDraft({ type: "polls", id: "new" }, { saved: false });
  assert.equal(draft.host.sources().at(-1).eventLabels["polls.started"].ru, "Опрос начат");
});
test("binding revision is checked inside the serialized write; failed saves preserve state", async () => {
  const { api } = setup();
  const results = await Promise.allSettled([1, 2].map(() => api.saveBindings(owner, { subscriptions: [subscription()] }, { expectedRevision: 0 })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(api.readBindings(owner).revision, 1);
  const copy = api.readBindings(owner); copy.subscriptions.length = 0;
  assert.equal(api.readBindings(owner).subscriptions.length, 1);
  await assert.rejects(api.saveBindings(owner, { subscriptions: [subscription(), subscription()] }, { expectedRevision: 1 }), /Unique/);
  assert.equal(api.readBindings(owner).revision, 1);
});
test("world delivery is once on the elected GM, never a rendered-window event", async () => {
  const { api, player, gm } = setup();
  const events = []; const unsubscribe = api.subscribe((event) => events.push(event));
  await publishAutomation(owner, "requests.submitted", { id: "request" });
  assert.equal(events.length, 1);
  deliverAutomationEvent(events[0]); assert.equal(events.length, 1);
  game.user = player;
  await publishAutomation(owner, "requests.cancelled", {});
  deliverAutomationEvent({ ...events[0], id: "new" }); assert.equal(events.length, 1);
  game.user = gm; unsubscribe();
});
test("cancel all includes environment; a cancelled invocation cannot reach the next request", async () => {
  const { api, cancelled } = setup();
  await api.execute("spotlight.requests.cancelAll", {}, context(owner));
  assert.deepEqual(cancelled.map(([id]) => id), ["environment", "player"]);
  let allowed = true;
  api.requestTool.processResolution = async (id) => { cancelled.push([id]); allowed = false; };
  await assert.rejects(api.execute("spotlight.requests.cancelAll", {}, { owner, current: () => allowed }), /cancelled/);
  assert.equal(cancelled.length, 3);
});
test("execution rejects players, absent current callback, wrong owner and missing templates", async () => {
  const { api, player } = setup();
  await assert.rejects(api.execute("spotlight.requests.cancelAll", {}, { owner }), /cancelled/);
  await assert.rejects(api.execute("spotlight.requests.cancelAll", {}, context({ type: "focus" })), /Incompatible/);
  await assert.rejects(api.execute("spotlight.polls.start", {}, context({ type: "polls", id: "missing" })), /no longer/);
  game.user = player;
  await assert.rejects(api.execute("spotlight.requests.cancelAll", {}, context(owner)), /moderator/);
});
test("timer cancellation is bounded by the binding template; poll finish cannot affect another run", async () => {
  const { api } = setup();
  assert.deepEqual(await api.execute("spotlight.timers.cancel", {}, context({ type: "timers", id: "timer" })), ["a"]);
  assert.deepEqual(await api.execute("spotlight.timers.cancel", { timerId: "b" }, context({ type: "timers", id: "timer" })), []);
  assert.equal(await api.execute("spotlight.polls.finish", {}, context({ type: "polls", id: "poll" })), false);
});
test("stopwatch manual lifecycle stays free and durable; automated operations require a current Premium provider", async () => {
  const { api, stopwatchTool: watch, values } = setup();
  const events = []; const off = api.subscribe((event) => events.push(event.name));
  await watch.transition("start"); await watch.transition("start");
  await watch.transition("pause"); await watch.transition("resume");
  await watch.transition("sign1"); await watch.transition("finish"); await watch.transition("clear");
  assert.equal(values.get("stopwatchState").finished, true);
  assert.equal(values.get("stopwatchState").events.length, 0);
  await assert.rejects(api.execute("spotlight.stopwatch.reset", {}, context({ type: "stopwatch" })), /Premium/);
  allowPremium();
  await api.execute("spotlight.stopwatch.reset", {}, context({ type: "stopwatch" }));
  assert.equal(values.get("stopwatchState").elapsedBeforeStart, 0);
  await publishAutomation(owner, "flush", {});
  assert.deepEqual(events.filter((name) => name.startsWith("stopwatch.")), ["stopwatch.started", "stopwatch.paused", "stopwatch.resumed", "stopwatch.finished", "stopwatch.cleared", "stopwatch.reset"]);
  off();
});
test("focus all-zone conditions are exact and exclude empty or entirely gray collections", () => {
  setup();
  assert.equal(allInZone({}, "doubt"), false);
  assert.equal(allInZone({ a: "muted" }, "deadline"), false);
  assert.equal(allInZone({ a: "doubt", b: "muted" }, "doubt"), true);
  assert.equal(allInZone({ a: "doubt", b: "deadline" }, "doubt"), false);
  assert.equal(allInZone({ a: "problem" }, "deadline"), false);
});
test("focus emits status and precise zone transitions once, with a native-receiver-safe deadline", async () => {
  const { api } = setup();
  const now = Date.now();
  const entry = { enabled: true, selfStatus: "playing", lastRequestAt: now, activeRequestAt: now, lastChatAt: now, lastGrantedAt: now, activeRequests: {} };
  const thresholds = Object.fromEntries(["lastRequest", "activeRequest", "lastChat", "lastGranted"].map((id) => [id, { doubt: 1, problem: 2, deadline: 3 }]));
  const tool = { state: { players: { p: entry } }, thresholds };
  const observer = new FocusAutomationObserver(tool);
  const events = []; const off = api.subscribe((event) => events.push(event));
  observer.observe({ baseline: true });
  for (const key of ["lastRequestAt", "activeRequestAt", "lastChatAt", "lastGrantedAt"]) entry[key] = now - 70000;
  entry.selfStatus = "listening";
  observer.observe(); observer.observe();
  await publishAutomation(owner, "flush", {});
  assert.equal(events.filter((event) => event.name === "focus.statusChanged").length, 1);
  assert.equal(events.filter((event) => event.name === "focus.indicatorChanged").length, 4);
  assert.equal(events.filter((event) => event.name === "focus.allYellow").length, 1);
  for (const key of ["lastRequestAt", "activeRequestAt", "lastChatAt", "lastGrantedAt"]) entry[key] = now - 190000;
  observer.observe(); observer.observe();
  await publishAutomation(owner, "flush", {});
  assert.equal(events.filter((event) => event.name === "focus.allRed").length, 1);
  observer.dispose(); off();
});
test("focus reset keeps requests and other indicators; reset-all changes only the addressed player", async () => {
  const { api, focusAuditTool } = setup();
  Object.assign(focusAuditTool.state.players.p, { lastChatAt: 1, activeRequestAt: 1, activeRequests: { r: 1 } });
  await api.execute("spotlight.focus.resetIndicator", { userId: "p", indicator: "activeRequest" }, context({ type: "focus" }));
  assert.ok(focusAuditTool.state.players.p.activeRequests.r > 1);
  assert.equal(focusAuditTool.state.players.p.lastChatAt, 1);
  await api.execute("spotlight.focus.resetAll", { userId: "p" }, context({ type: "focus" }));
  assert.ok(focusAuditTool.state.players.p.lastChatAt > 1);
  assert.ok(focusAuditTool.state.players.p.activeRequests.r > 1);
});
test("timer completion fires once and never replays already expired timers on authority acquisition", async () => {
  const { api } = setup();
  const timer = new TimerTool();
  timer.state = { timers: { old: { id: "old", endsAt: Date.now() - 1000 }, fresh: { id: "fresh", templateId: "timer", kind: "break", endsAt: Date.now() + 10000 } } };
  const events = []; const off = api.subscribe((event) => events.push(event));
  timer.observeAutomationExpirations();
  timer.state.timers.fresh.endsAt = Date.now() - 1;
  timer.observeAutomationExpirations(); timer.observeAutomationExpirations();
  await publishAutomation(owner, "flush", {});
  assert.deepEqual(events.filter((event) => event.name !== "flush").map((event) => event.name), ["timers.completed", "break.finished"]);
  off();
});
test("template automation edits stay in the shared draft until template Save", async () => {
  const { api, writes } = setup();
  const target = { type: "polls", id: "poll" };
  const draft = createAutomationDraft(target);
  await draft.host.saveBindings(target, { subscriptions: [subscription()] }, { expectedRevision: 0 });
  assert.deepEqual(writes, []);
  await draft.commit();
  assert.equal(api.readBindings(target).subscriptions.length, 1);
});
test("NPC lookup cancellation cannot submit a request after the awaited document resolves", async () => {
  const { api } = setup(); allowPremium();
  let current = true, submitted = false;
  globalThis.fromUuid = async () => { current = false; return { documentName: "Actor", id: "npc", hasPlayerOwner: false }; };
  api.requestTool.processSubmission = async () => { submitted = true; };
  await assert.rejects(api.execute("spotlight.requests.submitNpc", { actorUuid: "Actor.npc", urgency: "urgent" }, { owner, current: () => current }), /cancelled/);
  assert.equal(submitted, false);
});
test("attention request validates neglect duration and player, uses the informer route, and strips token context", async () => {
  const { api } = setup(); allowPremium();
  const submitted = [];
  api.requestTool.createSubmissionPayload = () => ({ sceneId: "scene", tokenId: "gm-token", authorId: "gm" });
  api.requestTool.processSubmission = async (payload, options) => { submitted.push({ payload, options }); return true; };
  assert.equal(await api.execute("spotlight.focus.request", { userId: "p", urgency: "urgent", neglectedMinutes: 10 }, context({ type: "focus" })), true);
  assert.equal(submitted[0].payload.authorId, "p");
  assert.equal(submitted[0].payload.tokenId, "");
  assert.equal(submitted[0].options.attention, true);
  assert.equal(await api.execute("spotlight.focus.request", { userId: "p", urgency: "urgent", neglectedMinutes: 100 }, context({ type: "focus" })), false);
  assert.equal(submitted.length, 1);
});
test("paused manual stopwatch remains available to another moderator without Premium", async () => {
  const { stopwatchTool } = setup();
  game.user = { id: "second-gm", role: 4, active: true };
  game.users.push(game.user);
  await stopwatchTool.transition("start");
  await stopwatchTool.transition("pause");
  assert.equal(stopwatchTool.running, false);
});
test("successful timer start, expiration and deletion are distinct transitions; cancelled launch publishes nothing", async () => {
  const { api } = setup();
  const tool = new TimerTool(); tool.registerSettings();
  tool.createTimerChatMessage = async () => [{ id: "message" }];
  tool.openTimerWindow = () => null;
  const events = []; const off = api.subscribe((event) => events.push(event));
  const timer = await tool.startTimer({ name: "Timer", mode: "duration", time: "00:01:00", visibility: "private", sound: "none", templateId: "timer" });
  tool.observeAutomationExpirations();
  tool.state.timers[timer.id].endsAt = Date.now() - 1;
  tool.observeAutomationExpirations();
  await tool.deleteTimer(timer.id);
  await publishAutomation(owner, "flush", {});
  assert.deepEqual(events.filter((event) => event.name !== "flush").map((event) => event.name), ["timers.started", "timers.completed", "timers.cancelled"]);
  let current = true;
  tool.createTimerChatMessage = async () => { current = false; return [{ id: "late" }]; };
  await assert.rejects(tool.startTimer({ name: "Late", mode: "duration", time: "00:01:00", visibility: "private", automationCheck: () => { if (!current) throw new Error("cancelled"); } }), /cancelled/);
  await publishAutomation(owner, "flush", {});
  assert.equal(events.filter((event) => event.name === "timers.started").length, 1);
  off();
});
test("UI provides always-visible integration points and inert localized placeholders", () => {
  const base = new URL("../dmicher-spotlight-tools/", import.meta.url);
  const ui = readFileSync(new URL("scripts/automation/ui.js", base), "utf8");
  assert.match(ui, /fieldset disabled/);
  assert.match(ui, /mountEditor\(element, owner, host\)/);
  assert.match(ui, /openEditor\(owner, host\)/);
  assert.match(readFileSync(new URL("templates/stopwatch/stopwatch.hbs", base), "utf8"), /data-stopwatch-action="automation"/);
  for (const lang of ["ru", "en"]) assert.ok(JSON.parse(readFileSync(new URL(`lang/${lang}.json`, base), "utf8")).DMICHERSPOTLIGHTTOOLS.Automation.Unavailable);
});
