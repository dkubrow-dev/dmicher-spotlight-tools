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
  utils: { randomID: () => "request-1" }
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

test("a cancelled request message creation does not mutate the queue or play sound", async () => {
  let soundCount = 0;
  let errorCount = 0;
  let persistedState = null;
  const gm = { id: "gm", name: "GM", role: 4, active: true, avatar: "" };
  const users = {
    get: (id) => id === gm.id ? gm : undefined,
    filter: (predicate) => [gm].filter(predicate),
    find: (predicate) => [gm].find(predicate),
    some: (predicate) => [gm].some(predicate)
  };
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
    user: gm,
    users,
    messages: [],
    time: { serverTime: 10 },
    settings: {
      get: () => persistedState ?? "",
      set: async (_namespace, _key, value) => {
        persistedState = value;
        return value;
      }
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

  const tool = new RequestTool({
    volumeController: {
      async play() {
        soundCount += 1;
      }
    }
  });
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const submitted = await tool.submitRequest("common");
    assert.equal(submitted, false);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(soundCount, 0);
  assert.equal(errorCount, 1);
  assert.equal(persistedState, null);
});


test("a request can enter the active queue without a chat card", async () => {
  let soundCount = 0;
  let messageCount = 0;
  let activeState = { initialized: true, revision: 0, entries: [] };
  const gm = { id: "gm", name: "GM", role: 4, active: true, avatar: "" };
  const users = {
    get: (id) => id === gm.id ? gm : undefined,
    filter: (predicate) => [gm].filter(predicate),
    find: (predicate) => [gm].find(predicate),
    some: (predicate) => [gm].some(predicate)
  };
  globalThis.window = {
    setTimeout: () => 1,
    clearTimeout() {}
  };
  globalThis.CONFIG.ChatMessage.documentClass = {
    getSpeaker: () => ({}),
    create: async () => {
      messageCount += 1;
      return { id: "message" };
    }
  };
  globalThis.game = {
    user: gm,
    users,
    messages: [],
    time: { serverTime: 20 },
    socket: { emit() {} },
    settings: {
      get: (_namespace, key) => {
        if (key === "requestConfiguration") return { chatEnabled: false };
        if (key === "activeRequests") return activeState;
        return "";
      },
      set: async (_namespace, key, value) => {
        if (key === "activeRequests") activeState = structuredClone(value);
        return value;
      }
    },
    i18n: {
      localize: (key) => key,
      format: (key) => key
    }
  };
  globalThis.ui.notifications = { error() {}, warn() {}, info() {} };

  const tool = new RequestTool({
    volumeController: {
      async play() {
        soundCount += 1;
      }
    }
  });
  const submitted = await tool.submitRequest("common");

  assert.equal(submitted, true);
  assert.equal(messageCount, 0);
  assert.equal(activeState.entries.length, 1);
  assert.equal(activeState.entries[0].authorId, gm.id);
  assert.equal(activeState.cooldowns.gm.common.submittedAt > 0, true);
  assert.equal(soundCount, 1);

  const cancelledId = activeState.entries[0].id;
  assert.equal(await tool.resolveRequest(cancelledId, "cancel"), true);
  assert.equal(activeState.cooldowns.gm.common.grantedAt, undefined);

  assert.equal(await tool.submitRequest("common"), true);
  const grantedId = activeState.entries[0].id;
  tool.broadcastSpeechGranted = () => undefined;
  assert.equal(await tool.resolveRequest(grantedId, "grant"), true);
  assert.equal(activeState.cooldowns.gm.common.grantedAt > 0, true);
});


test("v14 and v12-v13 authoritative moderator rejects requests while environment is active", async () => {
  for (const generation of [14, 12, 13]) {
    let activeState = {
      initialized: true,
      revision: 1,
      entries: [{
        id: "environment",
        authorId: "gm",
        authorName: "GM",
        urgency: "stop",
        submittedAt: 10,
        createdAt: 10,
        sequence: 0
      }]
    };
    let feedback = null;
    let localFeedback = null;
    let messageCount = 0;
    let soundCount = 0;
    const gm = { id: "gm", name: "GM", role: 4, active: true, avatar: "" };
    const player = { id: "player", name: "Player", role: 1, active: true, avatar: "" };
    const allUsers = [gm, player];
    const users = {
      get: (id) => allUsers.find((user) => user.id === id),
      filter: (predicate) => allUsers.filter(predicate),
      find: (predicate) => allUsers.find(predicate),
      some: (predicate) => allUsers.some(predicate)
    };
    globalThis.CONFIG = {
      ChatMessage: {
        documentClass: {
          getSpeaker: () => ({}),
          create: async () => {
            messageCount += 1;
            return { id: "message" };
          }
        }
      },
      Macro: {}
    };
    globalThis.game = {
      release: { generation },
      version: String(generation) + ".999",
      user: gm,
      users,
      messages: [],
      time: { serverTime: 20 },
      socket: {
        emit(_channel, payload) {
          if (payload.action === "requestFeedback") feedback = payload;
        }
      },
      settings: {
        get(_namespace, key) {
          if (key === "requestConfiguration") {
            return {
              blockWhenEnvironment: true,
              limits: { urgent: { mode: "forbidden", count: 1 } }
            };
          }
          if (key === "activeRequests") return activeState;
          return "";
        },
        async set(_namespace, key, value) {
          if (key === "activeRequests") activeState = structuredClone(value);
          return value;
        }
      },
      i18n: {
        localize: (key) => key,
        format: (key) => key
      }
    };
    globalThis.ui = {
      notifications: {
        error() {},
        warn(value) {
          localFeedback = value;
        },
        info() {}
      }
    };

    const tool = new RequestTool({
      volumeController: {
        async play() {
          soundCount += 1;
        }
      }
    });
    const submitted = await tool.processSubmission({
      id: "request-" + generation,
      urgency: "urgent",
      authorId: player.id,
      submittedAt: 20,
      createdAt: 20
    });

    assert.equal(submitted, false);
    assert.equal(activeState.revision, 1);
    assert.equal(activeState.entries.length, 1);
    assert.equal(messageCount, 0);
    assert.equal(soundCount, 0);
    assert.equal(feedback?.key, "Requests.Limits.EnvironmentNotice");
    assert.equal(feedback?.userId, player.id);

    const repeatedEnvironment = await tool.processSubmission({
      id: "environment-repeat-" + generation,
      urgency: "stop",
      authorId: gm.id,
      submittedAt: 21,
      createdAt: 21
    });

    assert.equal(repeatedEnvironment, false);
    assert.equal(activeState.revision, 1);
    assert.equal(activeState.entries.length, 1);
    assert.equal(messageCount, 0);
    assert.equal(soundCount, 0);
    assert.equal(localFeedback?.endsWith("Requests.Limits.EnvironmentNotice"), true);
  }
});
