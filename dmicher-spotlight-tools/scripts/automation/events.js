import { MODULE_ID } from "../config.js";
import { isModerator, isPrimaryModerator } from "../utils.js";

const listeners = new Set();
export const isAutomationAuthority = () => Number(game.user?.role) === 4 && isPrimaryModerator();
const seen = new Set();
let active = false;
let pending = 0;
let tail = Promise.resolve();
export function registerAutomationEvents() {
  game.settings.register(MODULE_ID, "automationEvent", {
    scope: "world", config: false, type: Object, default: {},
    onChange: deliverAutomationEvent
  });
}
export function activateAutomationEvents() { active = true; }
export function subscribeAutomation(listener) {
  if (typeof listener !== "function") throw new TypeError("Expected listener");
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function deliverAutomationEvent(event) {
  if (!active || !isAutomationAuthority() || !event?.id || seen.has(event.id)) return;
  seen.add(event.id);
  if (seen.size > 256) seen.delete(seen.values().next().value);
  for (const listener of listeners) {
    try { Promise.resolve(listener(structuredClone(event))).catch(console.error); }
    catch (error) { console.error(`${MODULE_ID} | Automation event listener`, error); }
  }
}
// The world setting is a single delivery slot, not a replay log. Only moderators
// may write it. Reading it at startup deliberately does not deliver old events.
export function publishAutomation(owner, name, parameters, causality) {
  if (!active || !isModerator()) return Promise.resolve();
  if (pending >= 100) return Promise.resolve();
  pending += 1;
  const data = structuredClone(parameters);
  if (owner.type === "requests") Object.assign(data, { requestId: data.id, userId: data.authorId,
    userUuid: data.authorId ? `User.${data.authorId}` : "", actorUuid: data.actorId ? `Actor.${data.actorId}` : "",
    level: data.urgency, time: data.submittedAt });
  const event = { id: foundry.utils.randomID(), owner, name, parameters: data, at: Date.now(),
    ...(causality ? { causality: structuredClone(causality) } : {}) };
  const task = tail.then(() => game.settings.set(MODULE_ID, "automationEvent", event));
  tail = task.catch((error) => console.error(`${MODULE_ID} | Automation publication`, error)).finally(() => { pending -= 1; });
  return tail;
}
