import assert from "node:assert/strict";
import test from "node:test";
import { installPremiumFixture } from "./fixtures/premium.mjs";
test.beforeEach(() => installPremiumFixture());

import { FLAGS, MODULE_ID, SETTINGS } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  INFORMER_PORTRAIT,
  createTechnicalChatMessages,
  isTechnicalUser
} from "../dmicher-spotlight-tools/scripts/technical-chat.js";
import { DocumentCollection, installTechnicalChatFixture } from "./fixtures/technical-chat.mjs";

function installWorld({ empty = true, enabled = true, lang = "en" } = {}) {
  const configuration = { chatEnabled: enabled, chatNotifications: {} };
  const gm = { id: "gm", name: "Gamemaster", role: 4, active: true, isGM: true };
  const player = { id: "player", name: "Player", role: 1, active: true, isGM: false };
  let nextId = 0;
  globalThis.CONST = {
    USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 },
    USER_PERMISSIONS: {
      ACTOR_CREATE: {}, FILES_UPLOAD: {}, FILES_BROWSE: {}, MACRO_SCRIPT: {},
      MESSAGE_WHISPER: {}, SETTINGS_MODIFY: {}, TOKEN_CREATE: {}, SHOW_CURSOR: {}
    }
  };
  globalThis.foundry = { utils: { randomID: () => `delivery-${++nextId}` }, documents: {} };
  globalThis.window = globalThis;
  globalThis.game = {
    user: gm,
    users: new DocumentCollection([gm, player]),
    messages: new DocumentCollection(),
    modules: new Map([[MODULE_ID, { title: "Spotlight Tools" }]]),
    release: { generation: 14 },
    settings: {
      get(namespace, key) {
        if (namespace === MODULE_ID && key === SETTINGS.requestConfiguration) return configuration;
        return undefined;
      },
      async set(namespace, key, value) {
        if (namespace === MODULE_ID && key === SETTINGS.requestConfiguration) Object.assign(configuration, value);
        return value;
      }
    },
    i18n: {
      lang,
      localize(key) {
        if (key.endsWith("TechnicalChat.Informer")) return lang === "ru" ? "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0442\u043e\u0440" : "Informer";
        return key;
      }
    }
  };
  const sent = [];
  globalThis.CONFIG = {
    ChatMessage: {
      documentClass: {
        async create(data) {
          await new Promise((resolve) => setImmediate(resolve));
          const message = {
            ...structuredClone(data), id: `message-${sent.length + 1}`,
            getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
            async delete() { game.messages.delete(this.id); }
          };
          sent.push(message);
          game.messages.set(message.id, message);
          return message;
        }
      }
    }
  };
  return { ...installTechnicalChatFixture({ empty }), configuration, gm, player, sent };
}

test("delivery creates one private copy per real recipient with only the informer as author and speaker", async () => {
  const fixture = installWorld({ empty: false });
  const identity = fixture.getIdentityState();
  const messages = await createTechnicalChatMessages({
    user: fixture.gm.id,
    author: fixture.player.id,
    speaker: { actor: "secret-villain", token: "secret-token", scene: "secret-scene", alias: "Spoiler" },
    content: "The floor is yours",
    whisper: [fixture.player.id, fixture.gm.id, fixture.player.id, identity.userId, "deleted-user"],
    flags: { external: { preserved: true }, [MODULE_ID]: { requestData: { id: "request-1" } } }
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((message) => message.whisper), [[fixture.player.id], [fixture.gm.id]]);
  for (const message of messages) {
    assert.equal(message.author, identity.userId);
    assert.equal(Object.hasOwn(message, "user"), false);
    assert.deepEqual(message.speaker, { alias: "Informer", actor: identity.actorId, token: null, scene: null });
    assert.equal(message.flags.external.preserved, true);
    assert.equal(message.flags[MODULE_ID].requestData.id, "request-1");
    assert.equal(message.flags[MODULE_ID][FLAGS.technical].recipientId, message.whisper[0]);
    assert.equal(message.flags[MODULE_ID][FLAGS.technical].portrait, INFORMER_PORTRAIT);
    const visibleToPlayer = message.author === fixture.player.id || message.whisper.includes(fixture.player.id);
    assert.equal(visibleToPlayer, message.whisper[0] === fixture.player.id);
  }
});

test("concurrent retry of one delivery key cannot produce duplicate recipient copies", async () => {
  const fixture = installWorld({ empty: false });
  const data = { content: "Welcome", whisper: [fixture.gm.id, fixture.player.id] };
  const options = { deduplicationKey: "welcome-session-1" };
  const results = await Promise.all([
    createTechnicalChatMessages(data, options),
    createTechnicalChatMessages(data, options)
  ]);
  assert.equal(fixture.sent.length, 2);
  assert.deepEqual(results[0].map((message) => message.id), results[1].map((message) => message.id));
  await createTechnicalChatMessages(data, options);
  assert.equal(fixture.sent.length, 2);
});

test("delivery restores a deleted informer user and actor before the next recipient copy", async () => {
  const fixture = installWorld({ empty: false });
  const identity = fixture.getIdentityState();
  const originalUser = game.users.get(identity.userId);
  const originalActor = game.actors.get(identity.actorId);
  const ChatMessageClass = CONFIG.ChatMessage.documentClass;
  const createMessage = ChatMessageClass.create;
  let attempts = 0;
  ChatMessageClass.create = async (data) => {
    attempts += 1;
    assert.ok(game.users.get(data.author), "the author must exist before each create");
    assert.ok(game.actors.get(data.speaker.actor), "the speaker actor must exist before each create");
    if (attempts === 2) {
      assert.notEqual(game.users.get(data.author), originalUser);
      assert.notEqual(game.actors.get(data.speaker.actor), originalActor);
      assert.equal(data.author, identity.userId);
      assert.equal(data.speaker.actor, identity.actorId);
    }
    const message = await createMessage(data);
    if (attempts === 1) {
      await originalUser.delete();
      await originalActor.delete();
    }
    return message;
  };
  const messages = await createTechnicalChatMessages({
    content: "The request was resolved",
    whisper: [fixture.player.id, fixture.gm.id]
  });
  assert.equal(messages.length, 2);
  assert.equal(attempts, 2);
  assert.deepEqual(messages.map((message) => message.author), [identity.userId, identity.userId]);
  assert.deepEqual(messages.map((message) => message.speaker.actor), [identity.actorId, identity.actorId]);
  assert.equal(fixture.created.User.length, 1);
  assert.equal(fixture.created.Actor.length, 1);
  assert.equal(fixture.created.Folder.length, 0);
});

test("public technical notifications become private copies for every human, excluding the informer", async () => {
  const fixture = installWorld({ empty: false });
  const messages = await createTechnicalChatMessages({ content: "Timer finished", whisper: [] });
  assert.deepEqual(messages.map((message) => message.whisper), [[fixture.gm.id], [fixture.player.id]]);
});

test("Spotlight excludes another module's managed user but includes humans playing ordinary NPCs", async () => {
  const fixture = installWorld({ empty: false });
  const otherInformer = await CONFIG.User.documentClass.create({
    _id: "other-module-informer", name: "Scene Informer", role: 1, active: false,
    flags: { "dmicher-generics": { managedIdentity: {
      version: 1, ownerId: "dmicher-master-screen", key: "scene-informer"
    } } }
  });
  const npc = await CONFIG.Actor.documentClass.create({
    _id: "ordinary-npc", name: "Innkeeper", type: "npc", ownership: { default: 0, player: 3 }
  });
  const npcPlayer = await CONFIG.User.documentClass.create({
    _id: "npc-player", name: "NPC Player", role: 1, active: true, character: npc.id
  });
  assert.equal(isTechnicalUser(otherInformer), true);
  assert.equal(isTechnicalUser(fixture.gm), false);
  assert.equal(isTechnicalUser(fixture.player), false);
  assert.equal(isTechnicalUser(npcPlayer), false);
  assert.equal(isTechnicalUser(npc), false);
  const messages = await createTechnicalChatMessages({ content: "A session event", whisper: [] });
  assert.deepEqual(messages.map((message) => message.whisper), [[fixture.gm.id], [fixture.player.id], [npcPlayer.id]]);
  const selected = await createTechnicalChatMessages({
    content: "A selected event", whisper: [otherInformer.id, npcPlayer.id, fixture.player.id]
  });
  assert.deepEqual(selected.map((message) => message.whisper), [[npcPlayer.id], [fixture.player.id]]);
  assert.equal(npc.name, "Innkeeper");
  assert.deepEqual(npc.ownership, { default: 0, player: 3 });
  assert.equal(otherInformer.name, "Scene Informer");
  assert.equal(otherInformer.getFlag(MODULE_ID, "informerIdentity"), undefined);
});

test("disabled chat or disabled notification category creates neither bot nor messages", async () => {
  const fixture = installWorld({ enabled: false });
  assert.deepEqual(await createTechnicalChatMessages({ content: "Disabled" }), []);
  fixture.configuration.chatEnabled = true;
  fixture.configuration.chatNotifications.polls = false;
  assert.deepEqual(await createTechnicalChatMessages({ content: "Disabled category" }, { category: "polls" }), []);
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [0, 0, 0]);
  assert.equal(fixture.sent.length, 0);
});

test("partial recipient delivery is removed after a create failure and can be retried", async () => {
  const fixture = installWorld({ empty: false });
  const ChatMessageClass = CONFIG.ChatMessage.documentClass;
  const createMessage = ChatMessageClass.create;
  let attempts = 0;
  ChatMessageClass.create = async (data) => {
    if (++attempts === 2) throw new Error("temporary chat failure");
    return createMessage(data);
  };
  const data = { content: "Resolved", whisper: [fixture.player.id, fixture.gm.id] };
  await assert.rejects(createTechnicalChatMessages(data, { deduplicationKey: "request-1" }), /temporary chat failure/);
  assert.equal(game.messages.size, 0);
  ChatMessageClass.create = createMessage;
  const messages = await createTechnicalChatMessages(data, { deduplicationKey: "request-1" });
  assert.equal(messages.length, 2);
  assert.equal(game.messages.size, 2);
});