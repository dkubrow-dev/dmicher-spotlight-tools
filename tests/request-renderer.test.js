import assert from "node:assert/strict";
import test from "node:test";

import { FLAGS, MODULE_ID } from "../dmicher-spotlight-tools/scripts/config.js";
import {
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
