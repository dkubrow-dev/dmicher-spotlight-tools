import assert from "node:assert/strict";
import test from "node:test";

class MockApplicationV2 {}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};
globalThis.HTMLElement = class {};
globalThis.document = {
  createElement: () => ({
    style: {
      cssText: "",
      getPropertyPriority: () => "",
      getPropertyValue: () => ""
    }
  })
};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };

const { REQUEST_TYPES } = await import("../dmicher-spotlight-tools/scripts/config.js");
const {
  migrateLegacyClientRequestSettings
} = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-settings.js");

function installSettings(generation, legacyValues, existingKeys = []) {
  const writes = [];
  const existing = new Set(existingKeys);
  globalThis.game = {
    release: { generation },
    settings: {
      storage: new Map([["client", {
        getItem: (key) => legacyValues.get(key) ?? null
      }]]),
      get(_namespace, key, options) {
        assert.deepEqual(options, { document: true });
        return existing.has(key) ? { id: `existing-${key}` } : { id: null, value: null };
      },
      async set(namespace, key, value) {
        writes.push([namespace, key, value]);
      }
    }
  };
  return writes;
}

test("v12 keeps request settings in client storage without migration", async () => {
  const request = Object.values(REQUEST_TYPES)[0];
  const legacyValues = new Map([
    [`dmicher-spotlight-tools.${request.textSetting}`, JSON.stringify("legacy")]
  ]);
  const writes = installSettings(12, legacyValues);

  await migrateLegacyClientRequestSettings();

  assert.deepEqual(writes, []);
});

test("v13+ migrates legacy client values only when a user value is absent", async () => {
  const [first, second] = Object.values(REQUEST_TYPES);
  const legacyValues = new Map([
    [`dmicher-spotlight-tools.${first.textSetting}`, JSON.stringify("legacy text")],
    [`dmicher-spotlight-tools.${first.styleSetting}`, "legacy unquoted style"],
    [`dmicher-spotlight-tools.${second.textSetting}`, JSON.stringify("must stay current")]
  ]);
  for (const generation of [13, 14]) {
    const writes = installSettings(generation, legacyValues, [second.textSetting]);

    await migrateLegacyClientRequestSettings();

    assert.deepEqual(writes, [
      ["dmicher-spotlight-tools", first.textSetting, "legacy text"],
      ["dmicher-spotlight-tools", first.styleSetting, "legacy unquoted style"]
    ]);
  }
});
