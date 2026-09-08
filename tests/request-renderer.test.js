import assert from "node:assert/strict";
import test from "node:test";
import { MockElement } from "./fixtures/chat-dom.mjs";

import { FLAGS, MODULE_ID } from "../dmicher-spotlight-tools/scripts/config.js";
import { applyChatPortrait, getChatDisplayPortrait, renderChatPortrait } from "../dmicher-spotlight-tools/scripts/chat-portrait.js";
import {
  buildRequestMessageContent,
  buildWelcomeMessageContent,
  getRequestAnchorId,
  renderRequestChatMessage
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-message.js";

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
    messages: new Map(),
    i18n: {
      localize: (key) => key,
      format: (key, data = {}) => key + ":" + JSON.stringify(data),
      lang: "en"
    },
    modules: new Map([[MODULE_ID, { title: "Manifest Title", version: "1.2.0" }]]),
    time: { serverTime: Date.now() }
  };
}

test("request text renders HTML and CSS-like input strictly as text", () => {
  installFoundryGlobals();
  const content = buildRequestMessageContent(
    "common",
    '<img src=x onerror="alert(1)">\n<style>body { display: none; }</style>',
    "color: #000000; text-align: center;",
    "modules/example/request.webp"
  );

  assert.doesNotMatch(content, /<img src=x|<style>/i);
  assert.match(content, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(content, /&lt;style&gt;body \{ display: none; \}&lt;\/style&gt;/);
  assert.match(content, /<br>/);
});

test("request renderer accepts the jQuery-like wrapper supplied by v12", () => {
  installFoundryGlobals();
  const dom = createRequestDom();
  const requestData = {
    urgency: "speak",
    authorId: "player-1"
  };
  const message = {
    id: "message-42",
    visible: true, isContentVisible: true,
    getFlag(namespace, key) {
      assert.equal(namespace, MODULE_ID);
      return key === FLAGS.request ? requestData : null;
    }
  };
  const resolutions = [];
  game.messages.set(message.id, message);

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
    visible: true, isContentVisible: true,
    getFlag(_namespace, key) {
      return key === FLAGS.request ? requestData : null;
    }
  };
  game.messages.set(message.id, message);
  renderRequestChatMessage(message, dom.root, { resolveRequest() {} });

  assert.equal(dom.card.id, getRequestAnchorId(message.id));
  assert.equal(dom.cancelButton.hidden, false);
  assert.equal(dom.grantButton.hidden, false);
  assert.equal(dom.actions.classList.contains("is-available"), true);
});

test("welcome internal actions remain buttons and only Boosty uses an external link", () => {
  installFoundryGlobals();
  const content = buildWelcomeMessageContent(true);
  assert.match(content, /Manifest Title/);
  assert.match(content, /1\.2\.0/);
  assert.match(content, /<a href="https:\/\/boosty\.to\/dmicher" target="_blank" rel="noopener noreferrer">Boosty<\/a>/);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="settings"/);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="master-settings"/);
  assert.match(content, /<button type="button"[^>]+data-request-welcome-action="help"/);
  assert.doesNotMatch(content, /data-request-welcome-action="thanks"/);
  assert.match(content, /<hr class="dmicher-request-welcome-divider">/);
  assert.match(content, /<p class="dmicher-request-welcome-support">/);
  assert.equal((content.match(/class="dmicher-inline-link-tail"/g) ?? []).length, 1);
  assert.ok(content.indexOf("dmicher-request-welcome-divider") < content.indexOf("dmicher-request-welcome-support"));
  assert.doesNotMatch(buildWelcomeMessageContent(false), /data-request-welcome-action="master-settings"/);

  for (const wrap of [(root) => ({ 0: root, length: 1 }), (root) => root]) {
    const root = new MockElement();
    const welcome = new MockElement();
    const settings = new MockElement();
    const masterSettings = new MockElement();
    const help = new MockElement();
    const thanks = new MockElement();
    root.queries.set(".dmicher-request-card", null);
    root.queries.set(".dmicher-request-technical", null);
    root.queries.set(".dmicher-request-welcome", welcome);
    welcome.queries.set('[data-request-welcome-action="settings"]', settings);
    welcome.queries.set('[data-request-welcome-action="master-settings"]', masterSettings);
    welcome.queries.set('[data-request-welcome-action="help"]', help);
    welcome.queries.set('[data-request-welcome-action="thanks"]', thanks);
    for (const [element, action] of [[settings, "settings"], [masterSettings, "master-settings"], [help, "help"], [thanks, "thanks"]]) {
      element.dataset.requestWelcomeAction = action;
    }
    const message = {
      id: "welcome",
      visible: true, isContentVisible: true,
      getFlag(_namespace, key) {
        return key === FLAGS.requestWelcome ? { userId: "player-1" } : null;
      }
    };
    game.messages.set(message.id, message);
    const calls = [];
    renderRequestChatMessage(message, wrap(root), {
      resolveRequest() {},
      openSettings: () => calls.push("settings"),
      openMasterSettings: () => calls.push("master-settings"),
      openHelp: () => calls.push("help"),
      openThankAuthor: () => calls.push("thanks")
    });

    for (const [element, expected] of [[settings, "settings"], [masterSettings, "master-settings"], [help, "help"], [thanks, "thanks"]]) {
      let prevented = false;
      let stopped = false;
      welcome.listeners.get("click")({
        target: element,
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
  legacyAnchor.replaceWith = (replacement) => {
    legacyAnchor.replacement = replacement;
    welcome.queries.set('[data-request-welcome-action="settings"]', replacement);
  };
  root.queries.set(".dmicher-request-card", null);
  root.queries.set(".dmicher-request-technical", null);
  root.queries.set(".dmicher-request-welcome", welcome);
  welcome.queries.set('[data-request-welcome-action="settings"]', legacyAnchor);
  const message = {
    id: "legacy-welcome",
    visible: true, isContentVisible: true,
    getFlag(_namespace, key) {
      return key === FLAGS.requestWelcome ? { userId: "player-1" } : null;
    }
  };
  game.messages.set(message.id, message);
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
  welcome.listeners.get("click")({ target: replacement, preventDefault() {}, stopPropagation() {} });
  assert.equal(opened, true);
});

test("request actions rebind once and reject stale, concealed or newly unauthorized cards", () => {
  installFoundryGlobals();
  const dom = createRequestDom();
  let requestData = { urgency: "speak", authorId: game.user.id };
  const message = {
    id: "changing-request", visible: true, isContentVisible: true,
    getFlag: (_namespace, key) => key === FLAGS.request ? requestData : undefined
  };
  game.messages.set(message.id, message);
  const resolutions = [];
  const callbacks = { resolveRequest: (...args) => resolutions.push(args) };
  renderRequestChatMessage(message, dom.root, callbacks);
  renderRequestChatMessage(message, dom.root, callbacks);
  const click = (button) => dom.actions.listeners.get("click")({ target: button, preventDefault() {} });
  assert.equal(dom.actions.listenerSets.get("click").size, 1);
  click(dom.cancelButton);
  assert.deepEqual(resolutions, [[message, "cancel"]]);

  click(dom.grantButton);
  assert.equal(resolutions.length, 1, "a player cannot grant even through a directly dispatched click");
  requestData = { ...requestData, authorId: "another-player" };
  click(dom.cancelButton);
  assert.equal(resolutions.length, 1, "authorization uses current flags");
  game.user.role = 4;
  message.isContentVisible = false;
  click(dom.grantButton);
  assert.equal(resolutions.length, 1, "a concealed message does not execute controls");
  message.isContentVisible = true;
  game.messages.delete(message.id);
  click(dom.grantButton);
  assert.equal(resolutions.length, 1, "deleted documents cannot execute their old DOM");
});

test("request double clicks share one pending resolution and allow a later attempt", async () => {
  installFoundryGlobals();
  const dom = createRequestDom();
  const message = {
    id: "pending-request", visible: true, isContentVisible: true,
    getFlag: (_namespace, key) => key === FLAGS.request ? { urgency: "speak", authorId: game.user.id } : undefined
  };
  game.messages.set(message.id, message);
  let complete;
  let calls = 0;
  renderRequestChatMessage(message, dom.root, {
    resolveRequest: () => { calls++; return new Promise((resolve) => { complete = resolve; }); }
  });
  const click = () => dom.actions.listeners.get("click")({ target: dom.cancelButton, preventDefault() {} });
  click();
  click();
  assert.equal(calls, 1);
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  click();
  assert.equal(calls, 2);
  complete();
});

test("request portrait integrations use the saved snapshot and player fallback", () => {
  installFoundryGlobals();
  game.users = {
    get: (id) => id === "player-1" ? { id, avatar: "player-avatar.webp" } : undefined
  };
  const requestData = {
    authorId: "player-1",
    portrait: "original-token.webp"
  };
  const message = {
    getFlag(_namespace, key) {
      return key === FLAGS.resolution ? { requestData } : null;
    }
  };
  const customData = { customIconPortraitImage: "gm-token.webp" };

  assert.equal(applyChatPortrait(customData, message), customData);
  assert.equal(customData.customIconPortraitImage, "original-token.webp");
  assert.equal(getChatDisplayPortrait({ authorId: "player-1", portrait: "  " }), "player-avatar.webp");

  game.users.get = () => ({ avatar: "" });
  assert.equal(getChatDisplayPortrait({ authorId: "player-1", portrait: "" }), "icons/svg/mystery-man.svg");
});

test("technical identity takes precedence over the resolved request portrait", () => {
  installFoundryGlobals();
  const technical = {
    authorId: "informer-user",
    authorName: "Informer",
    characterName: "Informer NPC",
    portrait: "informer.webp"
  };
  const requestData = {
    authorId: "player-1",
    characterName: "Hero",
    portrait: "request-token.webp"
  };
  const message = {
    getFlag(_namespace, key) {
      if (key === FLAGS.technical) return technical;
      if (key === FLAGS.resolution) return { requestData };
      return null;
    }
  };
  const customData = { customIconPortraitImage: "request-token.webp" };
  applyChatPortrait(customData, message);
  assert.equal(customData.customIconPortraitImage, "informer.webp");

  const root = new MockElement();
  const portrait = new MockElement();
  root.queries.set(".message-sender .avatar img, .message-sender .avatar video", portrait);
  renderChatPortrait(message, root);
  assert.equal(portrait.src, "informer.webp");
  assert.equal(portrait.alt, "Informer NPC");
});

test("ordinary chat messages keep their existing portrait and integration data", () => {
  installFoundryGlobals();
  const message = { getFlag: () => undefined };
  const customData = { customIconPortraitImage: "ordinary.webp", other: "preserved" };
  const originalData = structuredClone(customData);
  assert.equal(applyChatPortrait(customData, message), customData);
  assert.deepEqual(customData, originalData);

  const root = new MockElement();
  const portrait = new MockElement();
  portrait.src = "ordinary.webp";
  portrait.alt = "Ordinary speaker";
  root.queries.set(".message-sender .avatar img, .message-sender .avatar video", portrait);
  renderChatPortrait(message, root);
  assert.equal(portrait.src, "ordinary.webp");
  assert.equal(portrait.alt, "Ordinary speaker");
  assert.deepEqual(portrait.dataset, {});
  assert.equal(portrait.listeners.size, 0);
});

test("dnd5e portrait rendering switches media type and follows a finite fallback chain", () => {
  installFoundryGlobals();
  game.users = {
    get: (id) => id === "player-1" ? { id, avatar: "player-avatar.webp" } : undefined
  };
  let currentPortrait;
  const createMedia = (tagName) => {
    const media = {
      tagName: tagName.toUpperCase(),
      dataset: {},
      listeners: new Map(),
      attributes: new Set(),
      addEventListener(type, listener, options = {}) {
        const registered = options.once
          ? (...args) => {
              this.listeners.delete(type);
              listener(...args);
            }
          : listener;
        this.listeners.set(type, registered);
      },
      removeEventListener(type) { this.listeners.delete(type); },
      toggleAttribute(name, enabled) {
        if (enabled) this.attributes.add(name);
        else this.attributes.delete(name);
      },
      replaceWith(replacement) {
        currentPortrait = replacement;
      }
    };
    return media;
  };
  currentPortrait = createMedia("img");
  globalThis.document = { createElement: createMedia };
  const root = new MockElement();
  root.querySelector = (selector) => selector === ".message-sender .avatar img, .message-sender .avatar video"
    ? currentPortrait
    : null;
  const requestData = {
    authorId: "player-1",
    authorName: "Player",
    characterName: "Hero",
    portrait: "original-token.webm"
  };
  const message = {
    getFlag(_namespace, key) {
      return key === FLAGS.resolution ? { requestData } : null;
    }
  };

  renderChatPortrait(message, root);
  assert.equal(currentPortrait.tagName, "VIDEO");
  assert.equal(currentPortrait.src, "original-token.webm");
  assert.equal(currentPortrait.alt, "Hero");
  assert.equal(currentPortrait.attributes.has("autoplay"), true);

  const firstPortrait = currentPortrait;
  renderChatPortrait(message, root);
  assert.equal(currentPortrait, firstPortrait);
  assert.equal(currentPortrait.listeners.size, 1);

  currentPortrait.listeners.get("error")();
  assert.equal(currentPortrait.tagName, "IMG");
  assert.equal(currentPortrait.src, "player-avatar.webp");
  currentPortrait.listeners.get("error")();
  assert.equal(currentPortrait.src, "icons/svg/mystery-man.svg");
  assert.equal(currentPortrait.listeners.size, 0);
});
