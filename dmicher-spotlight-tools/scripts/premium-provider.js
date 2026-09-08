import { MODULE_ID } from "./config.js";
import { generics } from "./generics.js";

export const PREMIUM_API_VERSION = 1;
if (generics.premium?.apiVersion !== PREMIUM_API_VERSION) {
  throw new Error("dmicher-spotlight-tools requires the Generics Premium bridge API 1; update dmicher-generics.");
}
const premium = generics.premium.forModule(MODULE_ID, {
  apiVersion: PREMIUM_API_VERSION,
  methods: ["resolveConfiguration", "mergeConfiguration"]
});

const clone = (value) => JSON.parse(JSON.stringify(value));
export const waitForPremiumReady = (timeoutMs = 50_000) => premium.waitUntilReady(timeoutMs);
export const getPremiumStatus = () => premium.getStatus();
export const isPremiumActive = () => getPremiumStatus().active;
export const openPremiumSettings = () => premium.openSettings();
export const subscribePremiumChanges = (listener) => premium.subscribe(listener);

// These fields belong to Spotlight's configuration contract, not to Generics.
function applyPremiumFields(base, selected) {
  return {
    ...base,
    chatEnabled: selected.chatEnabled,
    soundsEnabled: selected.soundsEnabled,
    showWelcome: selected.showWelcome,
    welcome: { ...base.welcome, gm: selected.welcome.gm, players: selected.welcome.players },
    feed: { ...base.feed, showTime: selected.feed.showTime },
    images: clone(selected.images),
    sounds: clone(selected.sounds),
    timerSounds: clone(selected.timerSounds)
  };
}

function freeConfiguration(stored, defaults) {
  return applyPremiumFields(clone(stored), {
    ...defaults,
    chatEnabled: true, soundsEnabled: true, showWelcome: true,
    welcome: { gm: true, players: true }, feed: { showTime: true }
  });
}

function freeConfigurationUpdate(stored, proposed) {
  return applyPremiumFields(clone(proposed), stored);
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function validPremiumFields(value, expected) {
  if (!isRecord(value) || !isRecord(value.welcome) || !isRecord(value.feed)) return false;
  if (![value.chatEnabled, value.soundsEnabled, value.showWelcome,
    value.welcome.gm, value.welcome.players, value.feed.showTime].every((item) => typeof item === "boolean")) return false;
  const validResources = ["images", "sounds", "timerSounds"].every((group) => isRecord(value[group])
    && Object.keys(expected[group]).every((key) => {
      const resource = value[group][key];
      return isRecord(resource) && typeof resource.custom === "boolean" && typeof resource.url === "string"
        && (group === "images" || (typeof resource.volume === "number" && Number.isFinite(resource.volume)));
    }));
  if (!validResources) return false;
  // Serialization errors must be handled by the bridge before the result is applied.
  for (const group of ["images", "sounds", "timerSounds"]) clone(value[group]);
  return true;
}

export function resolvePremiumConfiguration(stored, defaults) {
  const base = freeConfiguration(stored, defaults);
  const resolved = premium.invoke("resolveConfiguration", [clone(stored), clone(defaults)],
    freeConfiguration, (value) => validPremiumFields(value, defaults));
  // A faulty extension cannot alter free settings or the saved input.
  return applyPremiumFields(base, resolved);
}

export function mergePremiumConfiguration(stored, proposed) {
  const base = freeConfigurationUpdate(stored, proposed);
  const resolved = premium.invoke("mergeConfiguration", [clone(stored), clone(proposed)],
    freeConfigurationUpdate, (value) => validPremiumFields(value, stored));
  return applyPremiumFields(base, resolved);
}
