import assert from "node:assert/strict";
import test from "node:test";

globalThis.SidebarTab = class {};
globalThis.foundry = {
  applications: {
    sidebar: {},
    api: { ApplicationV2: class {} }
  },
  utils: { mergeObject: (_base, options) => options }
};

const {
  RequestFeedSidebar,
  dispatchRequestFeedClick,
  dispatchRequestFeedDragStart
} = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-feed.js");

function eventFor(selectors, extras = {}) {
  let prevented = 0;
  let stopped = 0;
  const event = {
    target: {
      closest(selector) {
        return selectors[selector] ?? null;
      }
    },
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; },
    ...extras
  };
  return { event, prevented: () => prevented, stopped: () => stopped };
}

test("request feed delegates every click action from its persistent root", async () => {
  const requestButton = { dataset: { requestId: "request-1", feedRequestAction: "grant" } };
  const requestEvent = eventFor({
    "[data-feed-request-action][data-request-id]": requestButton
  });
  const resolutions = [];
  dispatchRequestFeedClick(requestEvent.event, {
    controller: { resolve: (...args) => resolutions.push(args) },
    actions: {}
  });
  assert.deepEqual(resolutions, [["request-1", "grant"]]);
  assert.equal(requestEvent.prevented(), 1);
  assert.equal(requestEvent.stopped(), 1);

  const macro = { dataset: { urgency: "urgent" } };
  const macroEvent = eventFor({
    "[data-feed-macro]": macro
  });
  const submissions = [];
  dispatchRequestFeedClick(macroEvent.event, {
    controller: null,
    actions: { submitRequest: (type) => submissions.push(type) }
  });
  assert.deepEqual(submissions, ["urgent"]);

  for (const action of ["settings", "help", "management"]) {
    const calls = [];
    const actionEvent = eventFor({
      "[data-feed-action]": { dataset: { feedAction: action } }
    });
    dispatchRequestFeedClick(actionEvent.event, {
      controller: null,
      actions: {
        openSettings: () => calls.push("settings"),
        openHelp: () => calls.push("help"),
        openManagement: () => calls.push("management")
      }
    });
    assert.deepEqual(calls, [action]);
  }
});

test("request feed preserves the macro drag target under event delegation", () => {
  const macro = { dataset: { urgency: "common" } };
  const dataTransfer = {};
  const sourceEvent = eventFor({
    "[data-feed-macro]": macro
  }, { dataTransfer });
  let delegatedEvent;
  dispatchRequestFeedDragStart(sourceEvent.event, {
    actions: { onRequestDragStart: (event) => { delegatedEvent = event; } }
  });
  assert.equal(delegatedEvent.currentTarget, macro);
  assert.equal(delegatedEvent.dataTransfer, dataTransfer);
  delegatedEvent.preventDefault();
  assert.equal(sourceEvent.prevented(), 1);
});

test("request feed registers one stable pair of delegated listeners", () => {
  const listeners = [];
  const root = {
    dataset: {},
    addEventListener: (type, handler) => listeners.push([type, handler])
  };
  const application = new RequestFeedSidebar();
  application.activateFeedListeners(root);
  application.activateFeedListeners(root);
  assert.deepEqual(listeners.map(([type]) => type), ["click", "dragstart"]);
  assert.equal(listeners[0][1], application.handleFeedClick);
  assert.equal(listeners[1][1], application.handleFeedDragStart);
});
