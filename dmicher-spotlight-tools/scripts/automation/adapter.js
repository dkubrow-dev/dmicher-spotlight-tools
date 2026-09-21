import { MODULE_ID } from "../config.js";
import { isModerator, isPrimaryModerator } from "../utils.js";
import { authorizePremiumAutomation } from "../premium-provider.js";
import { EVENTS, EVENT_LABELS, FUNCTIONS, normalizeOwner, OWNER_LABELS } from "./catalog.js";
import { registerAutomationEvents, activateAutomationEvents, subscribeAutomation, isAutomationAuthority } from "./events.js";
import { compareActiveRequestEntries } from "../tools/requests/request-config.js";
import { AUDIT_METRICS } from "../tools/focus/focus-utils.js";

const clone = (value) => structuredClone(value);
export class SpotlightAutomation {
  constructor({ requestTool, pollTool, timerTool, stopwatchTool, focusAuditTool }) {
    Object.assign(this, { requestTool, pollTool, timerTool, stopwatchTool, focusAuditTool });
    this.apiVersion = 1;
    this.tail = Promise.resolve();
    this.pending = 0;
  }
  registerSettings() {
    registerAutomationEvents();
    game.settings.register(MODULE_ID, "automationBindings", {
      scope: "world", config: false, type: Object, default: {}
    });
  }
  activate() { activateAutomationEvents(); }
  sources() {
    const owners = ["requests", "break", "stopwatch", "focus"].map((type) => ({ type, id: type, label: OWNER_LABELS[type][game.i18n?.lang === "ru" ? "ru" : "en"] }));
    for (const template of Object.values(this.pollTool.state.templates ?? {})) owners.push({ type: "polls", id: template.id, label: template.name });
    for (const template of this.timerTool.getTimerTemplates()) if (template.kind !== "break" && !template.builtIn) owners.push({ type: "timers", id: template.id, label: template.name });
    return owners.map((owner) => {
      const events = EVENTS[owner.type].map((name) => `${owner.type}.${name}`);
      return { ...owner, owner: { type: owner.type, id: owner.id }, events,
        eventLabels: Object.fromEntries(events.map(event => [event, clone(EVENT_LABELS[event])])) };
    });
  }
  functions(owner) {
    const { type } = normalizeOwner(owner);
    const functions = clone(FUNCTIONS.filter((fn) => fn.ownerTypes.includes(type)));
    const choice = (value, label) => ({ value, label: { ru: label, en: label } });
    for (const fn of functions) {
      if (fn.fields.userId) fn.fields.userId.options = [choice("", "—"), ...Array.from(game.users ?? []).filter(user => !isModerator(user)).map(user => choice(user.id, user.name))];
      if (fn.fields.actorUuid) fn.fields.actorUuid.options = [choice("", "—"), ...Array.from(game.actors?.values?.() ?? game.actors ?? []).filter(actor => !actor.hasPlayerOwner).map(actor => choice(actor.uuid, actor.name))];
      if (fn.fields.timerId) fn.fields.timerId.options = [{ value: "", label: { ru: "Все таймеры шаблона", en: "All template timers" } }, ...Object.values(this.timerTool.state.timers).filter(timer => timer.templateId === owner.id).map(timer => choice(timer.id, timer.name))];
    }
    return functions;
  }
  subscribe(listener) { return subscribeAutomation(listener); }
  canExecute(id) {
    const fn = FUNCTIONS.find((item) => item.id === id);
    return Boolean(fn && (!fn.premium || authorizePremiumAutomation(id.slice("spotlight.".length))));
  }
  validateOwner(owner) {
    owner = normalizeOwner(owner);
    if (owner.type === "polls" && !this.pollTool.getTemplate(owner.id)) throw new Error("Poll template no longer exists");
    if (owner.type === "timers" && !this.timerTool.getTimerTemplate(owner.id)) throw new Error("Timer template no longer exists");
    if (owner.type === "timers" && this.timerTool.getTimerTemplate(owner.id)?.kind === "break") throw new Error("Use the break automation owner");
    return owner;
  }
  readBindings(owner) {
    owner = this.validateOwner(owner);
    const all = game.settings.get(MODULE_ID, "automationBindings") ?? {};
    return clone(all[`${owner.type}:${owner.id}`] ?? { revision: 0, subscriptions: [], registeredMacroUuids: [] });
  }
  saveBindings(owner, data, { expectedRevision } = {}) {
    if (!isModerator()) return Promise.reject(new Error("Moderator required"));
    // All preparation writes go through the elected moderator, so the revision
    // check and write cannot race another moderator's local queue.
    if (!isPrimaryModerator()) return Promise.reject(new Error("Save on the executing moderator client"));
    if (this.pending >= 100) return Promise.reject(new Error("Automation save queue full"));
    this.pending += 1;
    const task = this.tail.then(async () => {
      if (!isPrimaryModerator()) throw new Error("Executing moderator changed");
      owner = this.validateOwner(owner);
      const current = this.readBindings(owner);
      if (expectedRevision !== current.revision) throw new Error("Automation revision conflict");
      if (!Array.isArray(data?.subscriptions) || data.subscriptions.length > 100) throw new Error("Invalid subscriptions");
      const ids = new Set();
      const subscriptions = data.subscriptions.map((row) => {
        if (!row.id || ids.has(row.id)) throw new Error("Unique subscription ID required");
        ids.add(row.id);
        const source = normalizeOwner(row.source);
        if (!EVENTS[source.type].some((event) => `${source.type}.${event}` === row.event)) throw new Error("Unknown source event");
        if (!row.script || typeof row.script !== "object") throw new Error("Script required");
        return { id: String(row.id), enabled: row.enabled !== false, source, event: row.event, script: clone(row.script) };
      });
      const rawMacros = data.registeredMacroUuids ?? current.registeredMacroUuids ?? [];
      if (!Array.isArray(rawMacros) || rawMacros.length > 100 || rawMacros.some((id) => typeof id !== "string" || !id || id.length > 256)) throw new Error("Invalid registered macros");
      const saved = { revision: current.revision + 1, subscriptions, registeredMacroUuids: [...new Set(rawMacros)] };
      const all = clone(game.settings.get(MODULE_ID, "automationBindings") ?? {});
      all[`${owner.type}:${owner.id}`] = saved;
      await game.settings.set(MODULE_ID, "automationBindings", all);
      return clone(saved);
    });
    this.tail = task.catch(() => {}).finally(() => { this.pending -= 1; });
    return task;
  }
  async execute(id, params = {}, context = {}) {
    const fn = FUNCTIONS.find((item) => item.id === id);
    if (!fn) throw new Error("Unknown Spotlight operation");
    const owner = this.validateOwner(context.owner);
    if (!fn.ownerTypes.includes(owner.type)) throw new Error("Incompatible Spotlight owner");
    const operation = id.slice("spotlight.".length);
    const check = () => {
      if (!isAutomationAuthority()) throw new Error("Executing moderator required");
      if (typeof context.current !== "function" || !context.current()) throw new Error("Automation cancelled");
      this.validateOwner(owner);
      if (fn.premium && !authorizePremiumAutomation(operation)) throw new Error("Premium required");
    };
    check.automationCause = context.causality;
    check();
    const result = await this.perform(operation, owner, params, check);
    check();
    return result;
  }
  async perform(operation, owner, params, check) {
    const requests = this.requestTool, polls = this.pollTool, timers = this.timerTool, watch = this.stopwatchTool, focus = this.focusAuditTool;
    switch (operation) {
      case "requests.environment": return requests.processSubmission(requests.createSubmissionPayload("stop"), { check });
      case "requests.resetTimeouts": return requests.processRequestTimeoutReset(game.user.id, { check });
      case "requests.grantNext": {
        const next = [...requests.state.entries].sort(compareActiveRequestEntries)[0];
        return next ? requests.processResolution(next.id, true, game.user.id, { check }) : false;
      }
      case "requests.cancelAll":
        for (const entry of [...requests.state.entries]) { check(); await requests.processResolution(entry.id, false, game.user.id, { check }); }
        return true;
      case "requests.submitNpc": {
        if (!["common", "urgent", "stop"].includes(params.urgency)) throw new Error("Invalid urgency");
        const actor = await fromUuid(String(params.actorUuid ?? ""));
        check();
        if (actor?.documentName !== "Actor" || actor.hasPlayerOwner) throw new Error("NPC Actor required");
        return requests.processSubmission({ ...requests.createSubmissionPayload(params.urgency), actorId: actor.id, characterName: actor.name, portrait: actor.img, tokenId: "", sceneId: "" }, { check });
      }
      case "polls.start": return polls.launchPoll(owner.id, {}, { check });
      case "polls.results": return polls.postResultsToChat(owner.id);
      case "polls.finish":
        if (polls.state.activePoll?.templateId !== owner.id) return false;
        return polls.clearActivePoll({ check });
      case "timers.start": return timers.startTimerTemplate(owner.id, { check });
      case "timers.cancel": {
        const matching = Object.values(timers.state.timers).filter((timer) => timer.templateId === owner.id && (!params.timerId || timer.id === params.timerId));
        return timers.deleteTimers(matching.map((timer) => timer.id), { check });
      }
      case "break.start": {
        const minutes = Number(params.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Positive break minutes required");
        return timers.startBreakTimer({ durationMilliseconds: minutes * 60000 }, { check });
      }
      case "break.finish": {
        const timer = timers.getActiveBreakTimer();
        return timer ? timers.deleteTimers([timer.id], { check }) : false;
      }
      case "stopwatch.start": return watch.transition("start", check);
      case "stopwatch.pause": return watch.transition("pause", check);
      case "stopwatch.resume": return watch.transition("resume", check);
      case "stopwatch.finish": return watch.transition("finish", check);
      case "stopwatch.reset": return watch.transition("reset", check);
      case "stopwatch.event":
        if (!["sign1", "sign2", "sign3", "sign4"].includes(params.eventType)) throw new Error("Invalid stopwatch event");
        return watch.recordEvent(params.eventType, check);
      case "stopwatch.results": return watch.postEventsToChat();
      case "focus.resetIndicator":
      case "focus.resetAll": {
        if (!game.users.get(params.userId)) throw new Error("Player required");
        const metrics = operation === "focus.resetAll" ? Object.keys(AUDIT_METRICS) : [params.indicator];
        if (metrics.some((metric) => !Object.hasOwn(AUDIT_METRICS, metric))) throw new Error("Unknown indicator");
        return focus.updateState((state) => {
          check();
          const entry = focus.getMutableEntry(state, params.userId);
          for (const metric of metrics) {
            entry[AUDIT_METRICS[metric].timestampKey] = Date.now();
            if (metric === "activeRequest") entry.activeRequests = Object.fromEntries(Object.keys(entry.activeRequests).map((id) => [id, Date.now()]));
          }
        }, { causality: check.automationCause });
      }
      case "focus.request": {
        const user = game.users.get(params.userId);
        const minutes = Number(params.neglectedMinutes);
        if (!user || isModerator(user) || !["common", "urgent", "stop"].includes(params.urgency) || !Number.isFinite(minutes) || minutes <= 0) throw new Error("Invalid attention request");
        const entry = focus.state.players[user.id];
        if (!entry?.enabled || !entry.lastGrantedAt || Date.now() - entry.lastGrantedAt < minutes * 60000) return false;
        return requests.processSubmission({ ...requests.createSubmissionPayload(params.urgency), authorId: user.id, authorName: user.name, actorId: user.character?.id ?? "", characterName: user.character?.name ?? "", portrait: user.character?.img ?? user.avatar, tokenId: "", sceneId: "" }, { check, attention: true });
      }
    }
  }
}
