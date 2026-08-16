import assert from "node:assert/strict";
import test from "node:test";

import {
  updateRequestTimeoutCounters
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-timeout-display.js";

test("timeout counters update every second and remove themselves at expiry", () => {
  const active = {
    dataset: { requestTimeoutExpiresAt: "101500" },
    textContent: "",
    removed: false,
    remove() { this.removed = true; }
  };
  const expired = {
    dataset: { requestTimeoutExpiresAt: "100000" },
    textContent: "00:00:01",
    removed: false,
    remove() { this.removed = true; }
  };
  const root = {
    querySelectorAll: () => [active, expired]
  };

  updateRequestTimeoutCounters(root, 100000);
  assert.equal(active.textContent, "00:00:02");
  assert.equal(active.removed, false);
  assert.equal(expired.removed, true);

  active.dataset.requestTimeoutExpiresAt = "101000";
  updateRequestTimeoutCounters(root, 101000);
  assert.equal(active.removed, true);
});
