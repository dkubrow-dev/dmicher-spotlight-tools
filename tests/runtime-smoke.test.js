import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const childPath = fileURLToPath(new URL("./fixtures/foundry-runtime-smoke.mjs", import.meta.url));

for (const generation of [13, 14]) {
  test(`isolated init/setup/ready runtime smoke succeeds for Foundry v${generation}`, () => {
    const result = spawnSync(process.execPath, ["--import", "./scripts/esm-loader.mjs", childPath, String(generation)], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      timeout: 10_000
    });

    assert.equal(
      result.status,
      0,
      [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n")
    );
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.generation, generation);
    assert.equal(summary.apiInstalled, true);
    assert.equal(summary.readyCompleted, true);
    assert.equal(summary.setupCompleted, true);
    assert.equal(summary.invalidScopes.length, 0);
    assert.equal(
      summary.chatRenderHook,
      generation === 12 ? "renderChatMessage" : "renderChatMessageHTML"
    );
    assert.equal(summary.requestSettingScope, generation === 12 ? "client" : "user");
  });
}

for (const generation of [13, 14]) {
  for (const role of [1, 2, 3, 4]) {
    for (const [audience, enabled, showToPlayers] of [
      ["moderators", true, false],
      ["everyone", true, true],
      ["disabled", false, false]
    ]) {
      for (const showTime of [true, false]) {
        test(`Foundry v${generation} feed setup: role ${role}, ${audience}, stored time ${showTime}`, () => {
          const scenario = { role, enabled, showToPlayers, showTime };
          const result = spawnSync(process.execPath, ["--import", "./scripts/esm-loader.mjs", childPath, String(generation), JSON.stringify(scenario)], {
            cwd: fileURLToPath(new URL("..", import.meta.url)),
            encoding: "utf8",
            timeout: 10_000
          });
          assert.equal(result.status, 0, [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n"));
          const summary = JSON.parse(result.stdout.trim());
          assert.equal(summary.setupCompleted, true);
          assert.equal(summary.feedRegistered, enabled && (showToPlayers || role >= 3));
          assert.equal(summary.generation, generation);
          assert.equal(summary.role, role);
        });
      }
    }
  }
}
