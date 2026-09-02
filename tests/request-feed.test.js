import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

class MockHTMLElement {}
class MockLegacySidebarTab {}
class MockConfiguredChat extends MockLegacySidebarTab {}

globalThis.HTMLElement = MockHTMLElement;
globalThis.game = { release: { generation: 12 }, version: "12.999" };
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
globalThis.SidebarTab = undefined;
globalThis.CONFIG = { ui: { chat: MockConfiguredChat } };
globalThis.foundry = {
  applications: {
    sidebar: {},
    api: { ApplicationV2: class {} }
  },
  utils: { mergeObject: (_base, options) => options }
};

const {
  RequestFeedSidebar,
  applyLegacyRequestFeedLayout,
  canViewRequestFeed,
  dispatchRequestFeedClick,
  ensureLegacyRequestFeedRendered,
  getLegacySidebarBase,
  handleLegacyRequestFeedTabClick,
  dispatchRequestFeedDragStart
} = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-feed.js");

test("request feed is public by default and moderator-only when configured", () => {
  const player = { role: 1 };
  const assistant = { role: 3 };
  const gamemaster = { role: 4 };

  assert.equal(canViewRequestFeed({ feed: { enabled: true, showToPlayers: true } }, player), true);
  assert.equal(canViewRequestFeed({ feed: { enabled: true } }, player), true);
  assert.equal(canViewRequestFeed({ feed: { enabled: true, showToPlayers: false } }, player), false);
  assert.equal(canViewRequestFeed({ feed: { enabled: true, showToPlayers: false } }, assistant), true);
  assert.equal(canViewRequestFeed({ feed: { enabled: true, showToPlayers: false } }, gamemaster), true);
  assert.equal(canViewRequestFeed({ feed: { enabled: false, showToPlayers: true } }, gamemaster), false);
});

test("v12 request feed uses SidebarTab and remounts missing content", () => {
  assert.equal(getLegacySidebarBase(), MockLegacySidebarTab);
  assert.ok(RequestFeedSidebar.prototype instanceof MockLegacySidebarTab);
  const staleRoot = new MockHTMLElement();
  staleRoot.isConnected = false;
  const renders = [];
  globalThis.ui = {
    requests: {
      rendered: true,
      element: [staleRoot],
      _element: [staleRoot],
      render: (...args) => renders.push(args)
    }
  };
  const root = { querySelector: () => null };

  ensureLegacyRequestFeedRendered(root);

  assert.equal(ui.requests._element, null);
  assert.deepEqual(renders, [[true]]);
});

test("v12 expands one sidebar tab slot only while request feed is enabled", () => {
  const classes = new Set(["dmicher-request-feed-enabled"]);
  const root = {
    classList: {
      remove(name) {
        classes.delete(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };

  assert.equal(applyLegacyRequestFeedLayout(root, true), true);
  assert.equal(classes.has("dmicher-request-feed-enabled"), false);
  assert.equal(classes.has("dmicher-request-feed-enabled-v12"), true);
  assert.equal(applyLegacyRequestFeedLayout(root, false), false);
  assert.equal(classes.has("dmicher-request-feed-enabled-v12"), false);

  const css = fs.readFileSync(
    new URL("../dmicher-spotlight-tools/styles/dmicher-spotlight-tools.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /#sidebar\.dmicher-request-feed-enabled-v12:not\(\.collapsed\)[\s\S]*?width: calc\(var\(--sidebar-width\) \+ 24px\);/);
  assert.doesNotMatch(css, /#sidebar\.dmicher-request-feed-enabled:not/);
});

test("v12 collapsed request feed opens as a popout and stays hidden in the sidebar", () => {
  const calls = [];
  let prevented = 0;
  const application = {
    rendered: true,
    renderPopout: (value) => calls.push(["popout", value]),
    activate: () => calls.push(["activate"])
  };
  const root = { querySelector: () => ({}) };
  globalThis.ui = {
    requests: application,
    sidebar: {
      _collapsed: true,
      activateTab: (tab) => calls.push(["tab", tab])
    }
  };

  const mode = handleLegacyRequestFeedTabClick({ preventDefault: () => { prevented += 1; } }, root);

  assert.equal(mode, "popout");
  assert.equal(prevented, 1);
  assert.deepEqual(calls, [["popout", application]]);

  const css = fs.readFileSync(
    new URL("../dmicher-spotlight-tools/styles/dmicher-spotlight-tools.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /#sidebar\.collapsed > #requests\.dmicher-request-feed-shell\s*\{\s*display: none;/);
});

test("v12 expanded request feed keeps the embedded sidebar behavior", () => {
  const calls = [];
  const application = {
    rendered: true,
    activate: () => calls.push(["activate"])
  };
  const root = {
    querySelector: (selector) => selector === "#requests.dmicher-request-feed-shell" ? {} : null
  };
  globalThis.ui = {
    requests: application,
    sidebar: {
      _collapsed: false,
      activateTab: (tab) => calls.push(["tab", tab])
    }
  };

  const mode = handleLegacyRequestFeedTabClick({ preventDefault() {} }, root);

  assert.equal(mode, "embedded");
  assert.deepEqual(calls, [["tab", "requests"], ["activate"]]);
});

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

  for (const action of ["settings", "management"]) {
    const calls = [];
    const actionEvent = eventFor({
      "[data-feed-action]": { dataset: { feedAction: action } }
    });
    dispatchRequestFeedClick(actionEvent.event, {
      controller: null,
      actions: {
        openSettings: () => calls.push("settings"),
        openManagement: () => calls.push("management")
      }
    });
    assert.deepEqual(calls, [action]);
  }

  const resetCalls = [];
  const resetEvent = eventFor({
    "[data-feed-action]": { dataset: { feedAction: "reset-timeouts" } }
  });
  dispatchRequestFeedClick(resetEvent.event, {
    controller: { confirmResetTimeouts: () => resetCalls.push("reset") },
    actions: {}
  });
  assert.deepEqual(resetCalls, ["reset"]);
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


test("request feed uses its canonical heading, removes help, and conditions the moderator timeout reset control", () => {
  const template = fs.readFileSync(
    new URL("../dmicher-spotlight-tools/templates/requests/feed.hbs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(template, /data-feed-action="help"/);
  assert.match(template, /{{#if showResetTimeouts}}[\s\S]*data-feed-action="reset-timeouts"/);
  for (const locale of ["ru", "en"]) {
    const messages = JSON.parse(fs.readFileSync(
      new URL("../dmicher-spotlight-tools/lang/" + locale + ".json", import.meta.url),
      "utf8"
    ));
    const feed = messages.DMICHERSPOTLIGHTTOOLS.Requests.Feed;
    assert.equal(feed.Heading, feed.Tab);
    assert.equal(messages.DMICHERSPOTLIGHTTOOLS.Requests.Feed.Help, undefined);
  }
});
