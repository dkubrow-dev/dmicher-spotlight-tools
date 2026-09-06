import assert from "node:assert/strict";
import test from "node:test";
import { installTechnicalChatFixture } from "./fixtures/technical-chat.mjs";

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
  installTechnicalChatFixture();
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


test("timeout feedback includes the remaining digital duration", () => {
  const now = 1000000;
  const warnings = [];
  globalThis.game = {
    user: { id: "player", role: 1 },
    i18n: {
      localize: (key) => key,
      format: (key, data) => key + ":" + data.time
    }
  };
  globalThis.ui = { notifications: { warn: (message) => warnings.push(message) } };
  const tool = new RequestTool();
  const configuration = {
    limits: {
      common: { timeoutMode: "submission", timeoutDuration: 300000 },
      urgent: { timeoutMode: "none", timeoutDuration: 300000 }
    }
  };
  const state = {
    entries: [],
    cooldowns: { player: { common: { submittedAt: now } } }
  };
  tool.showLimitViolation("timeout", {
    type: "common",
    authorId: "player",
    state,
    configuration,
    now: now + 1000
  });
  assert.deepEqual(warnings, ["DMICHERSPOTLIGHTTOOLS.Requests.Limits.TimeoutNotice:00:04:59"]);
});


test("primary moderator reset clears cooldowns without removing active requests", async () => {
  const gm = { id: "gm", name: "GM", role: 4, active: true };
  const allUsers = [gm];
  const users = {
    get: (id) => allUsers.find((user) => user.id === id),
    filter: (predicate) => allUsers.filter(predicate),
    find: (predicate) => allUsers.find(predicate),
    some: (predicate) => allUsers.some(predicate)
  };
  let activeState = {
    initialized: true,
    revision: 2,
    entries: [{
      id: "active",
      authorId: "gm",
      authorName: "GM",
      urgency: "common",
      submittedAt: 1000,
      createdAt: 1000,
      sequence: 0
    }],
    cooldowns: { gm: { common: { submittedAt: 1000 } } },
    cooldownsResetAt: 0
  };
  const notices = [];
  globalThis.game = {
    user: gm,
    users,
    messages: [],
    socket: { emit() {} },
    settings: {
      get(_namespace, key) {
        if (key === "requestConfiguration") {
          return { limits: { common: { timeoutMode: "submission", timeoutDuration: 300000 } } };
        }
        if (key === "activeRequests") return activeState;
        return "";
      },
      async set(_namespace, key, value) {
        if (key === "activeRequests") activeState = structuredClone(value);
        return value;
      }
    },
    i18n: { localize: (key) => key, format: (key) => key }
  };
  globalThis.ui = {
    notifications: {
      warn: (message) => notices.push(["warn", message]),
      error: (message) => notices.push(["error", message]),
      info: (message) => notices.push(["info", message])
    }
  };

  const tool = new RequestTool();
  tool.applyState(activeState);
  assert.equal(await tool.resetRequestTimeouts(), true);
  assert.equal(activeState.entries.length, 1);
  assert.deepEqual(activeState.cooldowns, {});
  assert.equal(activeState.cooldownsResetAt > 1000, true);
  assert.equal(activeState.revision, 3);
  assert.deepEqual(notices, [["info", "DMICHERSPOTLIGHTTOOLS.Requests.Limits.ResetSuccess"]]);
});
test("speech grant popup shows portrait, request type, and two text lines", () => {
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = {};
      this.classNames = new Set();
      this.classList = { add: (...names) => names.forEach((name) => this.classNames.add(name)) };
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    remove() {}
  }

  let popup = null;
  let emitted = null;
  globalThis.document = {
    createElement: (tagName) => new MockElement(tagName),
    body: { append: (element) => { popup = element; } }
  };
  globalThis.window = { setTimeout: () => 1 };
  globalThis.game = {
    user: { id: "gm", name: "GM", role: 4 },
    settings: { get: () => ({}) },
    socket: { emit: (_channel, payload) => { emitted = payload; } },
    i18n: {
      localize: (key) => key.endsWith("Requests.Popup.Granted") ? "The floor is granted" : key,
      format: (key) => key
    }
  };

  const tool = new RequestTool({ volumeController: { play: async () => undefined } });
  tool.broadcastSpeechGranted({
    urgency: "common",
    authorName: "Player",
    characterName: "Hero",
    portrait: "token.webp"
  });

  assert.equal(emitted.portrait, "token.webp");
  assert.equal(popup.children.length, 3);
  const [portrait, typeImage, text] = popup.children;
  assert.equal(portrait.src, "token.webp");
  assert.equal(portrait.classNames.has("dmicher-speech-popup-portrait"), true);
  assert.equal(typeImage.classNames.has("dmicher-speech-popup-type"), true);
  assert.equal(text.children[0].textContent, "The floor is granted");
  assert.equal(text.children[1].textContent, "Player \u2014 Hero");
  assert.equal(text.children[1].classNames.has("dmicher-speech-popup-person"), true);
});

test("submission payload snapshots the original token and otherwise uses the player avatar", () => {
  const player = {
    id: "player",
    name: "Player",
    role: 1,
    avatar: "player-avatar.webp",
    character: { id: "assigned-actor", name: "Assigned Hero", img: "actor.webp" }
  };
  const actor = {
    id: "actor-1",
    name: "Hero",
    img: "actor.webp",
    prototypeToken: { texture: { src: "prototype.webp" } }
  };
  const token = {
    id: "token-1",
    name: "Hero Token",
    actor,
    texture: { src: "" },
    document: {
      id: "token-1",
      parent: { id: "scene-original" },
      texture: { src: "original-token.webm" }
    }
  };
  globalThis.game = {
    user: player,
    time: { serverTime: 1234 },
    settings: { get: () => "" },
    i18n: { localize: (key) => key, format: (key) => key }
  };
  globalThis.document = {
    createElement: () => ({
      style: {
        cssText: "",
        getPropertyPriority: () => "",
        getPropertyValue: () => ""
      }
    })
  };
  globalThis.canvas = {
    scene: { id: "scene-original" },
    tokens: { controlled: [token] }
  };
  const tool = new RequestTool();

  const withToken = tool.createSubmissionPayload("common");
  assert.equal(withToken.characterName, "Hero");
  assert.equal(withToken.actorId, "actor-1");
  assert.equal(withToken.tokenId, "token-1");
  assert.equal(withToken.sceneId, "scene-original");
  assert.equal(withToken.portrait, "original-token.webm");

  canvas.tokens.controlled = [];
  const withoutToken = tool.createSubmissionPayload("common");
  assert.equal(withoutToken.characterName, "Assigned Hero");
  assert.equal(withoutToken.actorId, "assigned-actor");
  assert.equal(withoutToken.tokenId, "");
  assert.equal(withoutToken.portrait, "player-avatar.webp");
});

test("grant and cancellation use the informer and retain request details after a scene change", async () => {
  const gm = { id: "gm", name: "GM", role: 4, active: true, avatar: "gm-avatar.webp" };
  const player = { id: "player", name: "Player", role: 1, active: true, avatar: "player-avatar.webp" };
  const allUsers = [gm, player];
  const users = {
    get: (id) => allUsers.find((user) => user.id === id),
    filter: (predicate) => allUsers.filter(predicate)
  };
  const created = [];
  globalThis.CONFIG = {
    ChatMessage: {
      documentClass: {
        getSpeaker() {
          assert.fail("technical messages must not inspect the GM controlled token");
        },
        async create(data) {
          created.push(data);
          return { id: `technical-${created.length}` };
        }
      }
    },
    Macro: {}
  };
  globalThis.game = {
    user: gm,
    users,
    time: { serverTime: 2000 },
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key, data = {}) => `${key}:${JSON.stringify(data)}`
    }
  };
  globalThis.canvas = {
    scene: { id: "scene-secret" },
    tokens: {
      controlled: [{
        id: "token-secret",
        actor: { id: "actor-secret", name: "Secret Villain" }
      }]
    }
  };
  const requestData = {
    id: "request-original",
    urgency: "common",
    authorId: player.id,
    authorName: player.name,
    characterName: "Hero",
    actorId: "actor-original",
    tokenId: "token-original",
    sceneId: "scene-original",
    portrait: "original-token.webp",
    submittedAt: 1000
  };
  installTechnicalChatFixture();
  const tool = new RequestTool();

  await tool.createTechnicalMessage(requestData, true, 1000, gm);
  await tool.createTechnicalMessage(requestData, false, 2000, gm);

  assert.equal(created.length, 4);
  for (const message of created) {
    assert.equal(message.author, "informer-user");
    assert.deepEqual(message.speaker, {
      scene: null,
      actor: "informer-actor",
      token: null,
      alias: "Informer"
    });
    assert.equal(message.flags["dmicher-spotlight-tools"].resolution.requestData, requestData);
    assert.equal(message.whisper.length, 1);
  }
  assert.deepEqual(created.map((message) => message.whisper), [[gm.id], [player.id], [gm.id], [player.id]]);
});

test("welcome is authored by the informer and whispered only to the joining user", async () => {
  const gm = { id: "gm", name: "GM", role: 4, active: true, avatar: "gm-avatar.webp" };
  const player = { id: "player", name: "Player", role: 1, active: true, avatar: "player-avatar.webp" };
  const allUsers = [gm, player];
  const users = {
    get: (id) => allUsers.find((user) => user.id === id),
    filter: (predicate) => allUsers.filter(predicate),
    find: (predicate) => allUsers.find(predicate),
    some: (predicate) => allUsers.some(predicate)
  };
  let created;
  globalThis.CONFIG = {
    ChatMessage: {
      documentClass: {
        getSpeaker() {
          assert.fail("welcome messages must not inspect a controlled token");
        },
        async create(data) {
          created = data;
          return { id: "welcome-message" };
        }
      }
    },
    Macro: {}
  };
  globalThis.game = {
    user: gm,
    users,
    modules: new Map(),
    settings: {
      get: (_namespace, key) => key === "requestConfiguration" ? { showWelcome: true } : ""
    },
    i18n: {
      localize: (key) => key,
      format: (key) => key
    }
  };
  const tool = new RequestTool();

  installTechnicalChatFixture();
  await tool.createWelcomeMessage(player.id);

  assert.equal(created.author, "informer-user");
  assert.deepEqual(created.speaker, {
    scene: null,
    actor: "informer-actor",
    token: null,
    alias: "Informer"
  });
  assert.deepEqual(created.whisper, [player.id]);
  assert.equal(created.flags["dmicher-spotlight-tools"].requestWelcome.userId, player.id);
});
