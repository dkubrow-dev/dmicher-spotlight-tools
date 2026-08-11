import assert from "node:assert/strict";
import test from "node:test";

import {
  applyChatMessageMode,
  createSerialTaskQueue,
  getChatMessageRenderHook,
  getFoundryGeneration,
  getUserSettingScope,
  openSingletonApplication,
  runAfterApplicationLifecycle,
  setGamePaused
} from "../dmicher-spotlight-tools/scripts/utils.js";

function installGame(generation, { rollMode = "selfroll" } = {}) {
  const calls = [];
  globalThis.game = {
    release: { generation },
    version: `${generation}.999`,
    settings: {
      get(namespace, key) {
        assert.equal(namespace, "core");
        assert.equal(key, "rollMode");
        return rollMode;
      }
    },
    togglePause(...args) {
      calls.push(args);
      return `pause-${generation}`;
    }
  };
  return calls;
}

test("generation detection prefers game.release and falls back to game.version", () => {
  globalThis.game = { release: { generation: 14 }, version: "12.331" };
  assert.equal(getFoundryGeneration(), 14);

  globalThis.game = { version: "13.348" };
  assert.equal(getFoundryGeneration(), 13);
});

test("chat hook and setting scope follow the v12 versus v13+ contracts", () => {
  const expected = new Map([
    [12, { hook: "renderChatMessage", scope: "client" }],
    [13, { hook: "renderChatMessageHTML", scope: "user" }],
    [14, { hook: "renderChatMessageHTML", scope: "user" }]
  ]);

  for (const [generation, contract] of expected) {
    installGame(generation);
    assert.equal(getChatMessageRenderHook(), contract.hook);
    assert.equal(getUserSettingScope(), contract.scope);
  }
});

test("pause adapter passes a boolean socket flag to v12", () => {
  const calls = installGame(12);
  assert.equal(setGamePaused(true, { broadcast: false }), "pause-12");
  assert.deepEqual(calls, [[true, false]]);
});

test("pause adapter passes an options object to v13 and v14", () => {
  for (const generation of [13, 14]) {
    const calls = installGame(generation);
    assert.equal(setGamePaused(false, { broadcast: true }), `pause-${generation}`);
    assert.deepEqual(calls, [[false, { broadcast: true }]]);
  }
});

test("chat visibility uses applyRollMode on v12 and v13", () => {
  for (const generation of [12, 13]) {
    installGame(generation, { rollMode: "gmroll" });
    const calls = [];
    const ChatMessageClass = {
      applyRollMode(data, mode) {
        calls.push([data, mode]);
        data.whisper = ["gm"];
        return data;
      }
    };
    const messageData = { content: "test" };

    assert.equal(applyChatMessageMode(messageData, ChatMessageClass), messageData);
    assert.deepEqual(calls, [[messageData, "gmroll"]]);
    assert.deepEqual(messageData.whisper, ["gm"]);
  }
});

test("chat visibility prefers applyMode on v14 and lets Foundry choose its default", () => {
  installGame(14);
  const calls = [];
  const ChatMessageClass = {
    applyMode(...args) {
      calls.push(args);
      return args[0];
    },
    applyRollMode() {
      assert.fail("v14 compatibility path must not call applyRollMode");
    }
  };
  const messageData = { content: "test" };

  assert.equal(applyChatMessageMode(messageData, ChatMessageClass), messageData);
  assert.deepEqual(calls, [[messageData]]);
});

test("serial task queue preserves order and continues after a rejection", async () => {
  const enqueue = createSerialTaskQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = enqueue(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = enqueue(async () => {
    events.push("second");
    throw new Error("expected failure");
  });
  const third = enqueue(async () => {
    events.push("third");
    return 3;
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();

  assert.equal(await first, 1);
  await assert.rejects(second, /expected failure/);
  assert.equal(await third, 3);
  assert.deepEqual(events, ["first:start", "first:end", "second", "third"]);
});

test("application lifecycle continuation is synchronous for v12 and ordered after promises", async () => {
  const events = [];
  const syncResult = runAfterApplicationLifecycle(undefined, () => events.push("v12"));
  assert.equal(syncResult, undefined);
  assert.deepEqual(events, ["v12"]);

  let finishParent;
  const parent = new Promise((resolve) => {
    finishParent = resolve;
  });
  const pending = runAfterApplicationLifecycle(parent, () => events.push("v13+"));
  assert.deepEqual(events, ["v12"]);
  finishParent();
  await pending;
  assert.deepEqual(events, ["v12", "v13+"]);
});

test("singleton application helper reuses rendered windows and opens new ones", async () => {
  let broughtForward = 0;
  const existing = {
    rendered: true,
    bringToFront() {
      broughtForward += 1;
    }
  };
  assert.equal(openSingletonApplication(existing, () => assert.fail()), existing);
  assert.equal(broughtForward, 1);

  let renderOptions;
  const created = {
    rendered: false,
    async render(options) {
      renderOptions = options;
    }
  };
  assert.equal(openSingletonApplication(null, () => created), created);
  await Promise.resolve();
  assert.deepEqual(renderOptions, { force: true });
});

test("singleton application helper reuses a window while its first render is pending", async () => {
  let finishRender;
  const pendingRender = new Promise((resolve) => {
    finishRender = resolve;
  });
  const application = {
    rendered: false,
    render() {
      return pendingRender;
    }
  };

  const first = openSingletonApplication(null, () => application);
  const second = openSingletonApplication(first, () => assert.fail("created a duplicate"));
  assert.equal(second, first);
  finishRender();
  await pendingRender;
  await Promise.resolve();
});
