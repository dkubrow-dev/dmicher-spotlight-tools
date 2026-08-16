import assert from "node:assert/strict";
import test from "node:test";

import { FLAGS, MODULE_ID } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  buildWelcomeMessageContent,
  getRequestAnchorId,
  renderRequestChatMessage
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-message.js";

class MockClassList {
  values = new Set();

  add(...names) {
    for (const name of names) this.values.add(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MockElement {
  constructor() {
    this.dataset = {};
    this.classList = new MockClassList();
    this.childNodes = [];
    this.hidden = false;
    this.listeners = new Map();
    this.queries = new Map();
    this.attributes = new Map();
    this.textContent = "";
    this.id = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    return this.queries.get(selector) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  append(...nodes) {
    this.childNodes.push(...nodes);
  }
}

function createRequestDom() {
  const root = new MockElement();
  const card = new MockElement();
  const heading = new MockElement();
  const image = new MockElement();
  const actions = new MockElement();
  const cancelButton = new MockElement();
  const grantButton = new MockElement();
  const cancelLabel = new MockElement();
  const grantLabel = new MockElement();

  cancelButton.dataset.requestAction = "cancel";
  grantButton.dataset.requestAction = "grant";
  cancelButton.closest = () => cancelButton;
  grantButton.closest = () => grantButton;
  cancelButton.queries.set('[data-request-action-label="cancel"]', cancelLabel);
  grantButton.queries.set('[data-request-action-label="grant"]', grantLabel);

  root.queries.set(".dmicher-request-card", card);
  root.queries.set("[data-request-label], .dmicher-request-card h3", heading);
  root.queries.set(".dmicher-request-card-image", image);
  root.queries.set(".dmicher-request-actions", actions);
  root.queries.set(".dmicher-request-technical", null);
  actions.queries.set('[data-request-action="cancel"]', cancelButton);
  actions.queries.set('[data-request-action="grant"]', grantButton);

  return {
    root,
    card,
    heading,
    image,
    actions,
    cancelButton,
    grantButton,
    cancelLabel,
    grantLabel
  };
}

function installFoundryGlobals() {
  globalThis.HTMLElement = MockElement;
  globalThis.Node = { TEXT_NODE: 3 };
  globalThis.document = { createElement: () => new MockElement() };
  globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 } };
  globalThis.game = {
    user: { id: "player-1", role: 1 },
    i18n: {
      localize: (key) => key,
      format: (key) => key,
      lang: "en"
    },
    time: { serverTime: Date.now() }
  };
}

test("request renderer accepts the jQuery-like wrapper supplied by v12", () => {
  installFoundryGlobals();
  const dom = createRequestDom();
  const requestData = {
    urgency: "speak",
    authorId: "player-1"
  };
  const message = {
    id: "message-42",
    getFlag(namespace, key) {
      assert.equal(namespace, MODULE_ID);
      return key === FLAGS.request ? requestData : null;
    }
  };
  const resolutions = [];

  renderRequestChatMessage(message, { 0: dom.root, length: 1 }, {
    resolveRequest: (...args) => resolutions.push(args)
  });

  assert.equal(dom.card.id, getRequestAnchorId(message.id));
  assert.equal(dom.card.dataset.dmicherRequestMessageId, message.id);
  assert.equal(dom.cancelButton.hidden, false);
  assert.equal(dom.grantButton.hidden, true);
  assert.equal(dom.actions.classList.contains("is-available"), true);
  assert.ok(dom.actions.attributes.get("aria-label").endsWith("Requests.Chat.Actions"));

  let prevented = false;
  dom.actions.listeners.get("click")({
    target: dom.cancelButton,
    preventDefault: () => {
      prevented = true;
    }
  });
  assert.equal(prevented, true);
  assert.deepEqual(resolutions, [[message, "cancel"]]);
});

test("request renderer also accepts the raw HTMLElement supplied by v13 and v14", () => {
  installFoundryGlobals();
  game.user.role = 4;
  const dom = createRequestDom();
  const requestData = { urgency: "stop", authorId: "other-user" };
  const message = {
    id: "message-raw",
    getFlag(_namespace, key) {
      return key === FLAGS.request ? requestData : null;
    }
  };

  renderRequestChatMessage(message, dom.root, { resolveRequest() {} });

  assert.equal(dom.card.id, getRequestAnchorId(message.id));
  assert.equal(dom.cancelButton.hidden, false);
  assert.equal(dom.grantButton.hidden, false);
  assert.equal(dom.actions.classList.contains("is-available"), true);
});

test("welcome actions cannot trigger browser navigation and work with every supported chat wrapper", () => {
  installFoundryGlobals();
  const content = buildWelcomeMessageContent(true);
  assert.doesNotMatch(content, /<a\b|href\s*=/i);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="settings"/);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="help"/);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="thanks"/);

  for (const wrap of [(root) => ({ 0: root, length: 1 }), (root) => root]) {
    const root = new MockElement();
    const welcome = new MockElement();
    const settings = new MockElement();
    const help = new MockElement();
    const thanks = new MockElement();
    root.queries.set(".dmicher-request-card", null);
    root.queries.set(".dmicher-request-technical", null);
    root.queries.set(".dmicher-request-welcome", welcome);
    welcome.queries.set('[data-request-welcome-action="settings"]', settings);
    welcome.queries.set('[data-request-welcome-action="help"]', help);
    welcome.queries.set('[data-request-welcome-action="thanks"]', thanks);
    const message = {
      getFlag(_namespace, key) {
        return key === FLAGS.requestWelcome ? { userId: "player-1" } : null;
      }
    };
    const calls = [];
    renderRequestChatMessage(message, wrap(root), {
      resolveRequest() {},
      openSettings: () => calls.push("settings"),
      openHelp: () => calls.push("help"),
      openThankAuthor: () => calls.push("thanks")
    });

    for (const [element, expected] of [[settings, "settings"], [help, "help"], [thanks, "thanks"]]) {
      let prevented = false;
      let stopped = false;
      element.listeners.get("click")({
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; }
      });
      assert.equal(prevented, true);
      assert.equal(stopped, true);
      assert.equal(calls.at(-1), expected);
    }
  }
});

test("saved legacy welcome anchors are replaced before interaction", () => {
  installFoundryGlobals();
  const root = new MockElement();
  const welcome = new MockElement();
  const legacyAnchor = new MockElement();
  legacyAnchor.tagName = "A";
  legacyAnchor.textContent = "settings";
  legacyAnchor.className = "legacy";
  legacyAnchor.replaceWith = (replacement) => { legacyAnchor.replacement = replacement; };
  root.queries.set(".dmicher-request-card", null);
  root.queries.set(".dmicher-request-technical", null);
  root.queries.set(".dmicher-request-welcome", welcome);
  welcome.queries.set('[data-request-welcome-action="settings"]', legacyAnchor);
  const message = {
    getFlag(_namespace, key) {
      return key === FLAGS.requestWelcome ? { userId: "player-1" } : null;
    }
  };
  let opened = false;

  renderRequestChatMessage(message, root, {
    resolveRequest() {},
    openSettings: () => { opened = true; }
  });

  const replacement = legacyAnchor.replacement;
  assert.ok(replacement);
  assert.equal(replacement.type, "button");
  assert.equal(replacement.dataset.requestWelcomeAction, "settings");
  assert.equal(replacement.classList.contains("dmicher-inline-link"), true);
  replacement.listeners.get("click")({ preventDefault() {}, stopPropagation() {} });
  assert.equal(opened, true);
});
