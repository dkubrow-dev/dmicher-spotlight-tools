import assert from "node:assert/strict";
import test from "node:test";

import { FLAGS, MODULE_ID, SETTINGS } from "../dmicher-spotlight-tools/scripts/config.js";
import {
  INFORMER_PORTRAIT,
  createTechnicalChatMessages,
  isTechnicalUser,
  synchronizeTechnicalIdentity
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

test("a new identity creates a hidden NPC and a minimally privileged user with packaged artwork", async () => {
  const fixture = installWorld();
  const { user, actor, folder } = await synchronizeTechnicalIdentity();
  assert.equal(user.name, "Informer");
  assert.equal(user.password, "infobot");
  assert.equal(user.role, CONST.USER_ROLES.PLAYER);
  assert.equal(user.avatar, INFORMER_PORTRAIT);
  assert.equal(user.character, actor.id);
  assert.deepEqual(user.permissions, Object.fromEntries(
    Object.keys(CONST.USER_PERMISSIONS).map((key) => [key, key === "MESSAGE_WHISPER"])
  ));
  assert.equal(actor.type, "npc");
  assert.equal(actor.name, user.name);
  assert.equal(actor.img, INFORMER_PORTRAIT);
  assert.equal(actor.prototypeToken.texture.src, INFORMER_PORTRAIT);
  assert.deepEqual(actor.ownership, { default: 0 });
  assert.equal(actor.folder, folder.id);
  assert.equal(folder.type, "Actor");
  assert.equal(folder.name, "Spotlight Tools");
  assert.equal(isTechnicalUser(user), true);
  assert.equal(isTechnicalUser(fixture.player), false);
  assert.deepEqual(fixture.getIdentityState(), {
    name: "Informer", userId: user.id, actorId: actor.id, folderId: folder.id
  });
});

test("creation localizes the informer name and supports systems whose NPC type is mook", async () => {
  installWorld({ lang: "ru" });
  game.documentTypes.Actor = ["blackIce", "character", "mook"];
  const { user, actor } = await synchronizeTechnicalIdentity();
  assert.equal(user.name, "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0442\u043e\u0440");
  assert.equal(actor.name, user.name);
  assert.equal(actor.type, "mook");
});

test("renaming the user preserves its identity and repairs actor visibility and excess privileges", async () => {
  const fixture = installWorld({ empty: false });
  const original = fixture.getIdentityState();
  const user = game.users.get(original.userId);
  const actor = game.actors.get(original.actorId);
  user.name = "Campaign Herald";
  user.role = 2;
  user.permissions.ACTOR_CREATE = true;
  actor.ownership = { default: 2, player: 3 };
  actor.name = "Old Actor Name";
  const restored = await synchronizeTechnicalIdentity();
  assert.equal(restored.user, user);
  assert.equal(restored.actor, actor);
  assert.equal(restored.user.name, "Campaign Herald");
  assert.equal(restored.actor.name, "Campaign Herald");
  assert.equal(restored.user.role, 1);
  assert.equal(restored.user.permissions.ACTOR_CREATE, false);
  assert.deepEqual(restored.actor.ownership, { default: 0 });
  assert.equal(fixture.getIdentityState().userId, original.userId);
  assert.equal(fixture.getIdentityState().name, "Campaign Herald");
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [0, 0, 0]);
});

test("deleting the user or actor recreates only that document with the saved identifier", async () => {
  const fixture = installWorld({ empty: false });
  const original = fixture.getIdentityState();
  const originalFolder = game.folders.get(original.folderId);
  await game.users.get(original.userId).delete();
  const afterUserDeletion = await synchronizeTechnicalIdentity();
  assert.equal(afterUserDeletion.user.id, original.userId);
  assert.equal(afterUserDeletion.user.password, "infobot");
  assert.equal(fixture.created.User.length, 1);
  assert.equal(fixture.created.Actor.length, 0);
  await afterUserDeletion.actor.delete();
  const afterActorDeletion = await synchronizeTechnicalIdentity();
  assert.equal(afterActorDeletion.actor.id, original.actorId);
  assert.equal(afterActorDeletion.user, afterUserDeletion.user);
  assert.equal(afterActorDeletion.user.character, original.actorId);
  assert.equal(afterActorDeletion.folder, originalFolder);
  assert.equal(fixture.created.User.length, 1);
  assert.equal(fixture.created.Actor.length, 1);
  assert.equal(fixture.created.Folder.length, 0);
});

test("disabling chat removes only the bot and re-enabling preserves its ID and renamed identity", async () => {
  const fixture = installWorld({ empty: false });
  const original = fixture.getIdentityState();
  const actor = game.actors.get(original.actorId);
  const folder = game.folders.get(original.folderId);
  game.users.get(original.userId).name = "Town Crier";
  fixture.configuration.chatEnabled = false;
  assert.equal(await synchronizeTechnicalIdentity(), null);
  assert.equal(game.users.has(original.userId), false);
  assert.equal(game.users.has(fixture.player.id), true);
  assert.equal(game.actors.get(actor.id), actor);
  assert.equal(game.folders.get(folder.id), folder);
  assert.equal(fixture.getIdentityState().userId, original.userId);
  fixture.configuration.chatEnabled = true;
  const restored = await synchronizeTechnicalIdentity();
  assert.equal(restored.user.id, original.userId);
  assert.equal(restored.user.name, "Town Crier");
  assert.equal(restored.actor, actor);
  assert.equal(restored.actor.name, "Town Crier");
});

test("parallel identity checks create one user, actor, and folder", async () => {
  const fixture = installWorld();
  const identities = await Promise.all(Array.from({ length: 8 }, () => synchronizeTechnicalIdentity()));
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [1, 1, 1]);
  assert.ok(identities.every((identity) => identity.user === identities[0].user && identity.actor === identities[0].actor));
});

test("a failed user creation can retry without duplicating the already persisted actor and folder", async () => {
  const fixture = installWorld();
  const UserClass = CONFIG.User.documentClass;
  const createUser = UserClass.create;
  UserClass.create = async () => { throw new Error("temporary user creation failure"); };
  await assert.rejects(synchronizeTechnicalIdentity(), /temporary user creation failure/);
  const partial = fixture.getIdentityState();
  assert.ok(partial.actorId);
  assert.ok(partial.folderId);
  assert.equal(partial.userId, undefined);
  UserClass.create = createUser;
  const identity = await synchronizeTechnicalIdentity();
  assert.equal(identity.actor.id, partial.actorId);
  assert.equal(identity.folder.id, partial.folderId);
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [1, 1, 1]);
});

test("an occupied default name never adopts or modifies the existing human user", async () => {
  const fixture = installWorld();
  const occupied = { id: "human-informer", name: "Informer", role: 2, active: false };
  game.users.set(occupied.id, occupied);
  const UserClass = CONFIG.User.documentClass;
  const createUser = UserClass.create;
  UserClass.create = async (data, options) => {
    if (game.users.some((user) => user.name === data.name)) throw new Error("User names must be unique");
    return createUser.call(UserClass, data, options);
  };
  const identity = await synchronizeTechnicalIdentity();
  assert.notEqual(identity.user.id, occupied.id);
  assert.notEqual(identity.user.name, occupied.name);
  assert.equal(identity.actor.name, identity.user.name);
  assert.equal(game.users.get(occupied.id), occupied);
  assert.equal(occupied.role, 2);
  assert.equal(isTechnicalUser(occupied), false);
  assert.equal(fixture.created.User.length, 1);
});

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

test("disabled chat or disabled notification category creates neither bot nor messages", async () => {
  const fixture = installWorld({ enabled: false });
  assert.deepEqual(await createTechnicalChatMessages({ content: "Disabled" }), []);
  assert.equal(await synchronizeTechnicalIdentity(), null);
  fixture.configuration.chatEnabled = true;
  fixture.configuration.chatNotifications.resolved = false;
  assert.deepEqual(await createTechnicalChatMessages({ content: "Disabled category" }, { category: "resolved" }), []);
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [0, 0, 0]);
  assert.equal(fixture.sent.length, 0);
});

test("provisioning does not grant an assistant full GM rights when no full GM is connected", async () => {
  const fixture = installWorld();
  fixture.gm.role = 3;
  await assert.rejects(synchronizeTechnicalIdentity(), /TechnicalChat.RequiresGM/);
  assert.equal(fixture.gm.role, 3);
  assert.deepEqual(Object.values(fixture.created).map((list) => list.length), [0, 0, 0]);
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
