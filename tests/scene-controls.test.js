import assert from "node:assert/strict";
import test from "node:test";

import { MODULE_ID } from "../dmicher-spotlight-tools/scripts/config.js";
import { SpotlightControls } from "../dmicher-spotlight-tools/scripts/tools/spotlight-controls.js";

const ACTIONS = [
  "openHelp",
  "openRequests",
  "openTimers",
  "openBreakTimer",
  "openStopwatch",
  "openFocusAudit",
  "openPolls"
];

function installFoundryGlobals() {
  globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
  globalThis.game = {
    user: { role: 4 },
    i18n: { localize: (key) => key }
  };
}

function createControls() {
  const calls = [];
  const actions = Object.fromEntries(ACTIONS.map((name) => [name, () => calls.push(name)]));
  return { controls: new SpotlightControls(actions), calls };
}

const EXPECTED_TOOLS = [
  "spotlight-tools-root",
  "help",
  "requests",
  "polls",
  "break",
  "timers",
  "stopwatch",
  "focusAudit"
];

test("v12 SceneControls adapter appends an array control with help first", () => {
  installFoundryGlobals();
  const { controls: adapter, calls } = createControls();
  const sceneControls = [];
  adapter.renderSceneControls(sceneControls);

  assert.equal(sceneControls.length, 1);
  const control = sceneControls[0];
  assert.equal(control.name, MODULE_ID);
  assert.equal(control.layer, "controls");
  assert.equal(control.visible, true);
  assert.ok(Array.isArray(control.tools));
  assert.deepEqual(control.tools.map((tool) => tool.name), EXPECTED_TOOLS);
  assert.equal(control.tools[0].active, true);
  assert.equal(control.tools[0].visible, false);
  assert.equal(control.tools[1].name, "help");

  control.tools.find((tool) => tool.name === "help").onClick();
  control.tools.find((tool) => tool.name === "requests").onClick();
  assert.deepEqual(calls, ["openHelp", "openRequests"]);
});

for (const generation of [13, 14]) {
  test(`v${generation} SceneControls adapter writes a record with help first`, () => {
    installFoundryGlobals();
    const { controls: adapter, calls } = createControls();
    const sceneControls = {};
    adapter.renderSceneControls(sceneControls);

    const control = sceneControls[MODULE_ID];
    assert.ok(control);
    assert.equal(control.name, MODULE_ID);
    assert.equal(control.visible, true);
    assert.equal(Array.isArray(control.tools), false);
    assert.deepEqual(Object.keys(control.tools), EXPECTED_TOOLS);
    assert.equal(control.tools["spotlight-tools-root"].order, -1);
    assert.equal(control.tools.help.order, 0);
    assert.equal(control.tools.requests.order, 10);
    assert.equal(control.tools.focusAudit.order, 60);

    control.tools.timers.onChange();
    control.tools.stopwatch.onChange();
    assert.deepEqual(calls, ["openTimers", "openStopwatch"]);
  });
}

test("scene controls remain hidden for a non-moderator", () => {
  installFoundryGlobals();
  game.user.role = 2;
  const { controls: adapter } = createControls();
  const sceneControls = {};
  adapter.renderSceneControls(sceneControls);

  assert.equal(sceneControls[MODULE_ID].visible, false);
  assert.equal(sceneControls[MODULE_ID].tools.help.visible, false);
  assert.equal(sceneControls[MODULE_ID].tools.requests.visible, false);
});
