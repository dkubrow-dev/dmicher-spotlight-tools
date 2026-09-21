import { MODULE_ID } from "../config.js";
import { escapeHTML, localize } from "../utils.js";
import { EVENTS, EVENT_LABELS, OWNER_LABELS } from "./catalog.js";

export const automationHost = () => game.modules.get(MODULE_ID)?.api?.automation;
const provider = () => game.modules.get("dmicher-master-screen")?.active ? game.modules.get("dmicher-master-screen")?.api?.automation : null;
const placeholder = () => `<section class="dmicher-automation-placeholder"><p>${escapeHTML(localize("Automation.Unavailable"))}</p><fieldset disabled><legend>${escapeHTML(localize("Automation.Example"))}</legend><label>${escapeHTML(localize("Automation.Signal"))}<select><option>${escapeHTML(localize("Automation.SignalExample"))}</option></select></label><button type="button" disabled>${escapeHTML(localize("Automation.AddSubscription"))}</button></fieldset></section>`;

export function mountAutomation(element, owner, host = automationHost()) {
  if (!element) return () => {};
  const integration = provider();
  if (integration?.mountEditor && host) {
    const mounted = integration.mountEditor(element, owner, host);
    return () => { Promise.resolve(mounted).then(dispose); };
  }
  element.innerHTML = placeholder();
  return () => element.replaceChildren();
}
function dispose(value) { if (typeof value === "function") value(); else value?.dispose?.(); }
export function openAutomation(owner, host = automationHost()) {
  const integration = provider();
  if (integration?.openEditor && host) return integration.openEditor(owner, host);
  return foundry.applications.api.DialogV2.wait({
    window: { title: localize("Automation.Title") },
    content: placeholder(), buttons: [{ action: "close", label: localize("Automation.Close"), default: true }]
  });
}

export function mountAutomationTabs(app, root, owner, { host = automationHost(), label = "Automation.Content" } = {}) {
  app.automationDispose?.();
  if (!root) return;
  const content = document.createElement("div");
  content.className = "dmicher-automation-original";
  content.append(...root.childNodes);
  const nav = document.createElement("nav");
  nav.className = "dmicher-automation-tabs";
  nav.setAttribute("role", "tablist");
  const panel = document.createElement("div");
  panel.className = "dmicher-automation-panel";
  let mounted = false;
  let cleanup = () => {};
  for (const [id, key] of [["content", label], ["automation", "Automation.Title"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.textContent = localize(key);
    button.addEventListener("click", () => { app.automationTab = id; refresh(); });
    button.dataset.automationTab = id;
    nav.append(button);
  }
  const refresh = () => {
    const selected = app.automationTab === "automation";
    content.hidden = selected;
    panel.hidden = !selected;
    for (const button of nav.children) button.setAttribute("aria-selected", String((button.dataset.automationTab === "automation") === selected));
    if (selected && !mounted) { cleanup = mountAutomation(panel, owner, host); mounted = true; }
  };
  root.append(nav, content, panel);
  refresh();
  app.automationDispose = () => { cleanup(); app.automationDispose = null; };
}

// Template editors share one local preparation draft. Saving inside the mounted
// editor only changes this draft; the tool's Save button commits it explicitly.
export function createAutomationDraft(owner, { saved = true } = {}) {
  const host = automationHost();
  if (!host) return null;
  const original = saved ? host.readBindings(owner) : { revision: 0, subscriptions: [], registeredMacroUuids: [] };
  let draft = structuredClone(original), dirty = false;
  const staged = Object.create(host);
  staged.readBindings = () => structuredClone(draft);
  staged.saveBindings = async (_owner, data, { expectedRevision } = {}) => {
    if (expectedRevision !== draft.revision) throw new Error("Automation draft revision conflict");
    draft = { revision: draft.revision + 1, subscriptions: structuredClone(data.subscriptions), registeredMacroUuids: structuredClone(data.registeredMacroUuids ?? draft.registeredMacroUuids ?? []) };
    dirty = true;
    return structuredClone(draft);
  };
  staged.sources = () => {
    const sources = host.sources();
    if (!saved) {
      const events = EVENTS[owner.type].map((event) => `${owner.type}.${event}`);
      sources.push({ ...owner, owner, label: OWNER_LABELS[owner.type][game.i18n?.lang === "ru" ? "ru" : "en"], events,
        eventLabels: Object.fromEntries(events.map(event => [event, structuredClone(EVENT_LABELS[event])])) });
    }
    return sources;
  };
  return { owner, host: staged, async commit(target = owner) {
    if (!dirty) return;
    const data = structuredClone(draft);
    for (const row of data.subscriptions) if (row.source?.type === owner.type && row.source.id === owner.id) row.source = target;
    await host.saveBindings(target, data, { expectedRevision: original.revision });
    dirty = false;
  } };
}
