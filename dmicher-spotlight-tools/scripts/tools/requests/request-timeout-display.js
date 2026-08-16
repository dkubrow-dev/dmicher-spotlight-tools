import { formatDigitalDuration } from "../../utils.js";

export const REQUEST_TIMEOUT_TICK_MS = 1000;

export function updateRequestTimeoutCounters(root, now = Date.now()) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll("[data-request-timeout-countdown]")) {
    const expiresAt = Number(element.dataset.requestTimeoutExpiresAt);
    const remaining = Math.max(0, expiresAt - Number(now));
    if (!Number.isFinite(expiresAt) || remaining <= 0) {
      element.remove();
      continue;
    }
    element.textContent = formatDigitalDuration(remaining);
  }
}
