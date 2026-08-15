import assert from "node:assert/strict";
import test from "node:test";

class MockApplicationV2 {}

globalThis.HTMLElement = class {};
globalThis.Node = { TEXT_NODE: 3 };
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  },
  audio: { AudioHelper: {} },
  documents: {},
  utils: {}
};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.document = {
  createElement: () => ({
    style: {
      cssText: "",
      getPropertyPriority: () => "",
      getPropertyValue: () => ""
    }
  })
};
globalThis.canvas = { tokens: { controlled: [] } };

const { RequestTool } = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-tool.js");

test("a cancelled request creation does not play its announcement sound", async () => {
  let soundCount = 0;
  let errorCount = 0;
  globalThis.CONFIG = {
    ChatMessage: {
      documentClass: {
        getSpeaker: () => ({}),
        create: async () => undefined
      }
    },
    Macro: {}
  };
  globalThis.game = {
    user: { id: "player", name: "Player", role: 1 },
    time: { serverTime: 10 },
    settings: {
      get: () => ""
    },
    i18n: {
      localize: (key) => key,
      format: (key) => key
    }
  };
  globalThis.ui = {
    notifications: {
      error: () => {
        errorCount += 1;
      },
      warn() {}
    }
  };

  const tool = new RequestTool();
  tool.playSound = async () => {
    soundCount += 1;
  };
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await tool.submitRequest("common");
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(soundCount, 0);
  assert.equal(errorCount, 1);
});
