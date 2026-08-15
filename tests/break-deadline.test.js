import assert from "node:assert/strict";
import test from "node:test";

import {
  MINUTE_MS,
  calculateRoundedDeadline
} from "../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js";

const BREAK_OPTIONS = [5, 10, 15, 20, 30];

test("break deadline rounds every configured interval up to a whole minute", () => {
  const now = Date.UTC(2026, 7, 11, 10, 15, 23, 456);

  for (const minutes of BREAK_OPTIONS) {
    const target = now + (minutes * MINUTE_MS);
    const expected = Math.ceil(target / MINUTE_MS) * MINUTE_MS;
    const actual = calculateRoundedDeadline(minutes, now);

    assert.equal(actual, expected, `${minutes}-minute option`);
    assert.equal(actual % MINUTE_MS, 0, `${minutes}-minute option must land on a whole minute`);
    assert.ok(actual >= target, `${minutes}-minute option must never round down`);
    assert.ok(actual - target < MINUTE_MS, `${minutes}-minute option may add less than one minute only`);
  }
});

test("an exact-minute target remains on that minute", () => {
  const now = Date.UTC(2026, 7, 11, 10, 15, 0, 0);
  assert.equal(
    calculateRoundedDeadline(15, now),
    Date.UTC(2026, 7, 11, 10, 30, 0, 0)
  );
});

test("one millisecond beyond a whole-minute target rounds to the next minute", () => {
  const now = Date.UTC(2026, 7, 11, 10, 15, 0, 1);
  assert.equal(
    calculateRoundedDeadline(15, now),
    Date.UTC(2026, 7, 11, 10, 31, 0, 0)
  );
});

test("a target ending at 59.999 seconds rounds across the minute boundary", () => {
  const now = Date.UTC(2026, 7, 11, 10, 15, 59, 999);
  assert.equal(
    calculateRoundedDeadline(5, now),
    Date.UTC(2026, 7, 11, 10, 21, 0, 0)
  );
});

test("rounding handles hour and day rollover", () => {
  const now = Date.UTC(2026, 7, 11, 23, 59, 30, 0);
  assert.equal(
    calculateRoundedDeadline(5, now),
    Date.UTC(2026, 7, 12, 0, 5, 0, 0)
  );
});
