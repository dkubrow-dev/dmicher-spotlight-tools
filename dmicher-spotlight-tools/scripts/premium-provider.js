export const PREMIUM_API_VERSION = 1;
export const PREMIUM_MODULE_ID = "dmicher-premium";
let provider = null;
let providerFailed = false;
const listeners = new Set();
const initialChecks = new WeakMap();

export function waitForPremiumReady(timeoutMs = 50_000) {
  const satellite = globalThis.game?.modules?.get?.(PREMIUM_MODULE_ID);
  const ready = satellite?.active ? satellite.api?.readyPromise : null;
  if (!ready || typeof ready.then !== "function") return Promise.resolve();
  if (initialChecks.has(ready)) return initialChecks.get(ready);
  let timeout;
  const settled = Promise.race([
    Promise.resolve(ready).then(() => undefined, () => undefined),
    new Promise((resolve) => { timeout = globalThis.setTimeout(resolve, timeoutMs); })
  ]).finally(() => globalThis.clearTimeout(timeout));
  // Every startup action shares one deadline, including early userConnected events.
  initialChecks.set(ready, settled);
  return settled;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function failProvider(error) {
  if (!providerFailed) console.warn("dmicher-spotlight-tools | Premium provider unavailable; using free defaults", error);
  providerFailed = true;
}

export function isPremiumActive() {
  if (!provider || providerFailed) return false;
  try {
    const active = provider.isActive();
    if (active && typeof active.then === "function") {
      Promise.resolve(active).catch(() => undefined);
      throw new TypeError("A Premium activity check must be synchronous.");
    }
    return active === true;
  } catch (error) { failProvider(error); return false; }
}

export function getPremiumStatus() {
  return { apiVersion: PREMIUM_API_VERSION, available: Boolean(provider), active: isPremiumActive() };
}

export function registerPremiumProvider(nextProvider) {
  if (nextProvider !== null && (!nextProvider || typeof nextProvider.isActive !== "function"
    || typeof nextProvider.resolveConfiguration !== "function")) {
    throw new TypeError("A Premium provider requires synchronous isActive and resolveConfiguration methods.");
  }
  provider = nextProvider;
  providerFailed = false;
  notifyPremiumChanged();
}

export function subscribePremiumChanges(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyPremiumChanged() {
  providerFailed = false;
  const status = getPremiumStatus();
  for (const listener of listeners) {
    try { listener(status); }
    catch (error) { console.warn("dmicher-spotlight-tools | Premium change listener failed", error); }
  }
  globalThis.Hooks?.callAll?.("dmicherSpotlightPremiumChanged", status);
  return status;
}

export function resolvePremiumConfiguration(stored, defaults) {
  const free = {
    ...clone(stored),
    chatEnabled: true,
    soundsEnabled: true,
    showWelcome: true,
    welcome: { ...stored.welcome, gm: true, players: true },
    feed: { ...stored.feed, showTime: true },
    images: clone(defaults.images),
    sounds: clone(defaults.sounds),
    timerSounds: clone(defaults.timerSounds)
  };
  if (!isPremiumActive()) return free;
  try {
    const resolved = provider.resolveConfiguration(clone(stored), clone(defaults));
    if (resolved && typeof resolved.then === "function") {
      Promise.resolve(resolved).catch(() => undefined);
      throw new TypeError("A Premium configuration must be synchronous.");
    }
    if (!resolved || typeof resolved !== "object") {
      throw new TypeError("A Premium configuration must be an object.");
    }
    // The satellite can override Premium fields only. Common settings remain authoritative.
    return {
      ...free,
      chatEnabled: resolved.chatEnabled,
      soundsEnabled: resolved.soundsEnabled,
      showWelcome: resolved.showWelcome,
      welcome: { ...free.welcome, gm: resolved.welcome?.gm, players: resolved.welcome?.players },
      feed: { ...free.feed, showTime: resolved.feed?.showTime },
      images: resolved.images,
      sounds: resolved.sounds,
      timerSounds: resolved.timerSounds
    };
  } catch (error) {
    failProvider(error);
    return free;
  }
}
