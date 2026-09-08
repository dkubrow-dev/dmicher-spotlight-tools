import { generics } from "../../dmicher-spotlight-tools/scripts/generics.js";
import { MODULE_ID } from "../../dmicher-spotlight-tools/scripts/config.js";

let registration;
export function registerPremiumFixture(options) {
  registration?.dispose();
  registration = null;
  if (options === null) return null;
  const {
    isActive = () => true,
    resolveConfiguration = (stored) => stored,
    mergeConfiguration = (_stored, proposed) => proposed,
    readyPromise,
    openSettings
  } = options;
  registration = generics.premium.registerProvider({
    apiVersion: 1, readyPromise, openSettings, hasAccess: isActive,
    extensions: [{
      moduleId: MODULE_ID, apiVersion: 1,
      methods: {
        resolveConfiguration: (base, ...args) => resolveConfiguration(...args, base),
        mergeConfiguration: (base, ...args) => mergeConfiguration(...args, base)
      }
    }]
  });
  return registration;
}

export const notifyPremiumFixtureChanged = () => registration?.notifyChanged();

// The fixture registers an extension through the same bridge used by Premium.
export const installPremiumFixture = () => registerPremiumFixture({});
