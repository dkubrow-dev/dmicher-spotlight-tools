import { registerPremiumProvider } from "../../dmicher-spotlight-tools/scripts/premium-provider.js";

// Legacy chat/timer behavior is now configurable only with an active Premium provider.
export function installPremiumFixture() {
  registerPremiumProvider({ isActive: () => true, resolveConfiguration: (stored) => stored });
}
