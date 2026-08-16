import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHotbarMacroCommand,
  cleanupRemovedHotbarMacros,
  createOrUpdateHotbarMacro,
  installHotbarMacroCleanup,
  stripHotbarMacroMetadata
} from "../dmicher-spotlight-tools/scripts/tools/hotbar-macro.js";

test("request macro updates can preserve an existing hotbar image", async () => {
  const updates = [];
  const macro = {
    id: "macro",
    isOwner: true,
    name: "Request",
    type: "chat",
    img: "old.webp",
    command: "/old",
    async update(changes) {
      updates.push(changes);
      Object.assign(this, changes);
    }
  };
  globalThis.CONFIG = { Macro: { documentClass: { create: async () => null } } };
  globalThis.game = {
    macros: { find: () => macro },
    user: { assignHotbarMacro: async () => undefined }
  };
  globalThis.ui = { notifications: { info() {}, error() {} } };

  await createOrUpdateHotbarMacro({
    slot: 1,
    name: "Request",
    type: "chat",
    img: "new.webp",
    updateImage: false,
    command: "/new",
    flags: {},
    findExisting: () => true
  });

  assert.equal(macro.img, "old.webp");
  assert.equal(macro.command, "/new");
  assert.equal(updates.length, 1);
  assert.equal(Object.hasOwn(updates[0], "img"), false);
});

test("macro metadata comments identify the owner and preserve the executable command", () => {
  const command = buildHotbarMacroCommand("/module-command common", {
    ownerId: "user-1",
    ownerName: "Alice",
    createdAt: "2026-08-16T12:00:00.000Z",
    ownerLabel: "Player",
    createdLabel: "Created"
  });

  assert.match(command, /Player: Alice \(user-1\)/);
  assert.match(command, /Created: 2026-08-16T12:00:00\.000Z/);
  assert.equal(stripHotbarMacroMetadata(command), "/module-command common");
});

test("removing only one duplicate hotbar assignment keeps the managed macro", async () => {
  let deleteCount = 0;
  const macro = {
    id: "macro-1",
    isOwner: true,
    author: { id: "user-1" },
    flags: {
      "dmicher-spotlight-tools": {
        requestMacro: "common",
        hotbarOwner: "user-1"
      }
    },
    getFlag(namespace, key) {
      return this.flags[namespace]?.[key];
    },
    async delete() {
      deleteCount += 1;
    }
  };
  const user = {
    id: "user-1",
    hotbar: { 1: macro.id, 2: macro.id },
    async assignHotbarMacro(nextMacro, slot) {
      if (nextMacro) this.hotbar[slot] = nextMacro.id;
      else delete this.hotbar[slot];
      return this;
    }
  };
  globalThis.game = {
    user,
    macros: { get: (id) => id === macro.id ? macro : null }
  };

  assert.equal(installHotbarMacroCleanup(), true);
  await user.assignHotbarMacro(null, 1);
  assert.equal(deleteCount, 0);
  await user.assignHotbarMacro(null, 2);
  assert.equal(deleteCount, 1);
});

test("cleanup ignores ordinary macros and module macros owned by another user", async () => {
  let ordinaryDeletes = 0;
  let foreignDeletes = 0;
  const ordinary = {
    id: "ordinary",
    isOwner: true,
    author: { id: "user-1" },
    flags: {},
    async delete() {
      ordinaryDeletes += 1;
    }
  };
  const foreign = {
    id: "foreign",
    isOwner: true,
    author: { id: "user-2" },
    flags: {
      "dmicher-spotlight-tools": {
        pollMacro: "poll-1",
        hotbarOwner: "user-2"
      }
    },
    getFlag(namespace, key) {
      return this.flags[namespace]?.[key];
    },
    async delete() {
      foreignDeletes += 1;
    }
  };
  const macros = new Map([
    [ordinary.id, ordinary],
    [foreign.id, foreign]
  ]);
  globalThis.game = {
    user: { id: "user-1", hotbar: {} },
    macros: { get: (id) => macros.get(id) }
  };

  assert.equal(
    await cleanupRemovedHotbarMacros([ordinary.id, foreign.id], game.user),
    0
  );
  assert.equal(ordinaryDeletes, 0);
  assert.equal(foreignDeletes, 0);
});

test("new module macros store ownership flags and visible command comments", async () => {
  let createdData;
  const createdMacro = { id: "created-macro" };
  globalThis.CONFIG = {
    Macro: {
      documentClass: {
        async create(data) {
          createdData = data;
          return createdMacro;
        }
      }
    }
  };
  globalThis.game = {
    macros: { find: () => null },
    user: {
      id: "user-1",
      name: "Alice",
      async assignHotbarMacro() {}
    },
    i18n: {
      localize(key) {
        if (key.endsWith(".Owner")) return "Player";
        if (key.endsWith(".Created")) return "Created";
        return key;
      }
    }
  };
  globalThis.ui = { notifications: { info() {}, error() {} } };

  await createOrUpdateHotbarMacro({
    slot: 1,
    name: "Request",
    type: "chat",
    img: "request.webp",
    command: "/module-command common",
    flags: {
      "dmicher-spotlight-tools": {
        requestMacro: "common"
      }
    },
    findExisting: () => true
  });

  assert.equal(
    createdData.flags["dmicher-spotlight-tools"].hotbarOwner,
    "user-1"
  );
  assert.match(
    createdData.flags["dmicher-spotlight-tools"].hotbarCreatedAt,
    /^\d{4}-\d{2}-\d{2}T/
  );
  assert.match(createdData.command, /Player: Alice \(user-1\)/);
  assert.equal(
    stripHotbarMacroMetadata(createdData.command),
    "/module-command common"
  );
});
