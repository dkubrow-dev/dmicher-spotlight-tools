import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  migrateLegacyClientRequestSettings,
  registerRequestSettings
} = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-settings.js");
const {
  createDefaultRequestConfiguration
} = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-config.js");

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

test("master settings retain only the informer creation and deletion hint", () => {
  const template = readFileSync(new URL(
    "../dmicher-spotlight-tools/templates/request-master-settings.hbs",
    import.meta.url
  ), "utf8");
  const hints = template.match(/<p\b[^>]*\bclass=["'][^"']*\bhint\b[^"']*["'][^>]*>[\s\S]*?<\/p>/g) ?? [];

  assert.equal(hints.length, 1);
  assert.match(hints[0], /TechnicalChat\.IdentityWarning/);
  assert.doesNotMatch(template, /TechnicalChat\.PollsHint/);
});

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

test("master settings save player feed visibility and offer a reload", async () => {
  const previous = createDefaultRequestConfiguration();
  const writes = [];
  const menus = new Map();
  const errors = [];
  let identitySynchronizations = 0;
  globalThis.game = {
    release: { generation: 14 },
    user: { role: 4 },
    i18n: { localize: (key) => key },
    settings: {
      register() {},
      registerMenu(_namespace, key, configuration) {
        menus.set(key, configuration);
      },
      get(_namespace, key) {
        return key === "requestConfiguration" ? previous : "";
      },
      async set(namespace, key, value) {
        writes.push([namespace, key, value]);
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info() {},
      error: (message) => errors.push(message)
    }
  };
  registerRequestSettings({ synchronizeChatIdentity: async () => { identitySynchronizations += 1; } });
  const MasterSettings = menus.get("requestMasterSettings").type;
  const application = new MasterSettings();
  let reloadOffers = 0;
  application.render = async () => application;
  application.offerReload = async () => { reloadOffers += 1; };

  const values = new Map([
    ["chatEnabled", "on"],
    ["chatPollNotifications", "on"],
    ["chatTimerNotifications", "on"],
    ["soundsEnabled", "on"],
    ["blockWhenEnvironment", "on"],
    ["showWelcome", "on"],
    ["feedEnabled", "on"],
    ["feedShowTime", "on"],
    ["commonLimitMode", "none"],
    ["commonLimitCount", "1"],
    ["urgentLimitMode", "count"],
    ["urgentLimitCount", "1"]
  ]);
  const form = {
    formData: values,
    elements: {
      commonTimeoutMode: { value: "none" },
      commonTimeoutTime: { value: "00:05:00" },
      urgentTimeoutMode: { value: "grant" },
      urgentTimeoutTime: { value: "00:10:00" }
    },
    querySelector: () => ({ disabled: false })
  };
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(source) {
      this.values = source.formData;
    }

    get(key) {
      return this.values.get(key) ?? null;
    }

    has(key) {
      return this.values.has(key);
    }
  };
  try {
    await application._saveSettings({ preventDefault() {}, currentTarget: form });
  } finally {
    globalThis.FormData = NativeFormData;
  }

  assert.deepEqual(errors, []);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], [
    "dmicher-spotlight-tools",
    "requestConfiguration",
    {
      ...previous,
      feed: { ...previous.feed, showToPlayers: false }
    }
  ]);
  assert.equal(reloadOffers, 1);
  assert.equal(identitySynchronizations, 1);
});
