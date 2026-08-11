import assert from "node:assert/strict";
import test from "node:test";

class MockApplicationV2 {}
class TestCollection extends Array {
  get(id) {
    return this.find((item) => item.id === id);
  }
}

globalThis.HTMLElement = class {};
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  },
  audio: { AudioHelper: {} },
  documents: {},
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: (() => {
      let id = 0;
      return () => `id-${++id}`;
    })(),
    timeSince: () => "now"
  }
};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.CONFIG = { ChatMessage: {}, Macro: {} };
globalThis.window = {
  setTimeout: () => 1,
  clearTimeout() {}
};

const { MODULE_ID, SETTINGS } = await import("../dmicher-spotlight-tools/scripts/config.js");
const {
  POLL_DEFAULTS_VERSION,
  POLL_TYPE,
  normalizePollState
} = await import("../dmicher-spotlight-tools/scripts/tools/polls/poll-utils.js");
const { PollTool } = await import("../dmicher-spotlight-tools/scripts/tools/polls/poll-tool.js");

function installGame() {
  const gm = { id: "gm", name: "GM", role: 4, active: true };
  const player = { id: "player", name: "Player", role: 1, active: true };
  let state = normalizePollState({
    defaultsVersion: POLL_DEFAULTS_VERSION,
    templates: {
      template: {
        id: "template",
        name: "Check",
        question: "Ready?",
        type: POLL_TYPE.buttons,
        options: [{ id: "yes", label: "Yes", enabled: true }],
        participants: { player: true },
        timerEnabled: true,
        timerTime: "00:01:00",
        timerSound: "none",
        createdAt: 1,
        updatedAt: 1
      }
    },
    activePoll: null,
    lastRuns: {}
  });

  globalThis.ui = {
    notifications: { warn() {}, error() {} }
  };
  globalThis.game = {
    user: gm,
    users: new TestCollection(gm, player),
    messages: new TestCollection(),
    settings: {
      get(namespace, key) {
        assert.equal(namespace, MODULE_ID);
        assert.equal(key, SETTINGS.polls);
        return state;
      },
      async set(namespace, key, value) {
        assert.equal(namespace, MODULE_ID);
        assert.equal(key, SETTINGS.polls);
        state = structuredClone(value);
        return state;
      }
    },
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key) => key
    }
  };

  return { getState: () => state };
}

test("a poll reserves active state before starting its public timer", async () => {
  const { getState } = installGame();
  let releaseTimer;
  let reportTimerStarted;
  const timerStarted = new Promise((resolve) => {
    reportTimerStarted = resolve;
  });
  let timerStarts = 0;
  const timerTool = {
    async startTimer() {
      timerStarts += 1;
      reportTimerStarted();
      await new Promise((resolve) => {
        releaseTimer = resolve;
      });
      return { id: "poll-timer", startAt: 10, endsAt: 70 };
    },
    async deleteTimer() {}
  };
  const tool = new PollTool({ timerTool });
  tool.createRequestMessage = async () => ({ id: "request-message" });
  tool.openResultsWindow = () => null;

  const first = tool.launchPoll("template");
  await Promise.resolve();
  await Promise.resolve();
  const second = tool.launchPoll("template");

  assert.equal(await second, null);
  await timerStarted;
  assert.equal(timerStarts, 1);
  assert.equal(getState().activePoll?.templateId, "template");

  releaseTimer();
  const run = await first;
  assert.equal(run.timerId, "poll-timer");
  assert.equal(getState().activePoll.timerId, "poll-timer");
});

test("a partial request launch rolls back its messages, timer, and state", async () => {
  const { getState } = installGame();
  const secondPlayer = { id: "player-2", name: "Player 2", role: 1, active: true };
  game.users.push(secondPlayer);
  getState().templates.template.participants[secondPlayer.id] = true;

  const rolledBackTimers = [];
  const timerTool = {
    async startTimer() {
      return { id: "poll-timer", startAt: 10, endsAt: 70 };
    },
    async rollbackTimerStart(timerId) {
      rolledBackTimers.push(timerId);
    }
  };
  const tool = new PollTool({ timerTool });
  let requests = 0;
  let deleted = 0;
  tool.createRequestMessage = async () => {
    requests += 1;
    if (requests === 2) throw new Error("request failed");
    return {
      id: "request-1",
      async delete() {
        deleted += 1;
      }
    };
  };

  await assert.rejects(tool.launchPoll("template"), /request failed/);
  assert.equal(deleted, 1);
  assert.deepEqual(rolledBackTimers, ["poll-timer"]);
  assert.equal(getState().activePoll, null);
  assert.equal(getState().lastRuns.template, undefined);
});

test("parallel response reconciliation creates one result message", async () => {
  installGame();
  const tool = new PollTool();
  let releaseCreate;
  let createCount = 0;
  const createBarrier = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  CONFIG.ChatMessage.documentClass = {
    getSpeaker: () => ({}),
    async create(data) {
      createCount += 1;
      await createBarrier;
      const message = {
        id: "result-message",
        getFlag(namespace, key) {
          return data.flags?.[namespace]?.[key];
        }
      };
      game.messages.push(message);
      return message;
    }
  };

  const processed = {
    messageId: "",
    userId: "player",
    run: {
      id: "run",
      templateId: "template",
      name: "Check",
      question: "Ready?",
      type: POLL_TYPE.buttons,
      options: [{ id: "yes", label: "Yes", enabled: true }]
    },
    response: {
      status: "answered",
      value: "yes",
      answeredAt: 10,
      userName: "Player"
    }
  };

  try {
    const first = tool.finalizePollResponse(processed);
    const second = tool.finalizePollResponse(processed);
    await Promise.resolve();
    assert.equal(createCount, 1);
    releaseCreate();
    await Promise.all([first, second]);
    assert.equal(createCount, 1);
  } finally {
    CONFIG.ChatMessage.documentClass = undefined;
  }
});

test("a cancelled result creation schedules reconciliation retry", async () => {
  installGame();
  const tool = new PollTool();
  const scheduled = [];
  const originalSetTimeout = window.setTimeout;
  const originalConsoleWarn = console.warn;
  window.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return scheduled.length;
  };
  console.warn = () => undefined;
  CONFIG.ChatMessage.documentClass = {
    getSpeaker: () => ({}),
    create: async () => undefined
  };

  try {
    await tool.finalizePollResponse({
      messageId: "",
      userId: "player",
      run: {
        id: "run-cancelled",
        templateId: "template",
        name: "Check",
        question: "Ready?",
        type: POLL_TYPE.buttons,
        options: [{ id: "yes", label: "Yes", enabled: true }]
      },
      response: {
        status: "answered",
        value: "yes",
        answeredAt: 10,
        userName: "Player"
      }
    }, 1);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 500);
  } finally {
    CONFIG.ChatMessage.documentClass = undefined;
    window.setTimeout = originalSetTimeout;
    console.warn = originalConsoleWarn;
  }
});
