import { MODULE_ID, SETTINGS } from "../../dmicher-spotlight-tools/scripts/config.js";
import { INFORMER_PORTRAIT } from "../../dmicher-spotlight-tools/scripts/technical-chat.js";

export class DocumentCollection extends Map {
  constructor(items = []) { super(items.map((item) => [item.id, item])); }
  [Symbol.iterator]() { return this.values(); }
  filter(predicate) { return Array.from(this).filter(predicate); }
  find(predicate) { return Array.from(this).find(predicate); }
  some(predicate) { return Array.from(this).some(predicate); }
  map(mapper) { return Array.from(this).map(mapper); }
  push(item) { this.set(item.id, item); }
}

export function installTechnicalChatFixture({ empty = false } = {}) {
  game.settings ??= { get: () => undefined };
  const originalGet = game.settings.get.bind(game.settings);
  const originalSet = game.settings.set?.bind(game.settings);
  let identity = empty ? {} : { userId: "informer-user", actorId: "informer-actor", folderId: "informer-folder", name: "Informer" };
  game.settings.get = (namespace, key, ...args) => {
    if (namespace === "dmicher-generics" && key === "informerIdentity") return structuredClone(identity);
    if (namespace === MODULE_ID && key === SETTINGS.requestConfiguration) {
      try { return originalGet(namespace, key, ...args) ?? {}; } catch { return {}; }
    }
    return originalGet(namespace, key, ...args);
  };
  game.settings.set = async (namespace, key, value) => {
    if (namespace === "dmicher-generics" && key === "informerIdentity") { identity = structuredClone(value); return value; }
    return originalSet?.(namespace, key, value);
  };
  let humans;
  try { humans = Array.from(game.users ?? []); } catch { humans = []; }
  if (!humans.length) humans = game.users?.filter?.(() => true) ?? [game.user];
  game.users = new DocumentCollection(humans);
  game.actors = new DocumentCollection();
  game.folders = new DocumentCollection();
  game.documentTypes = { Actor: ["character", "npc"] };
  game.modules ??= new Map();
  CONST.USER_PERMISSIONS ??= { ACTOR_CREATE: {}, FILES_UPLOAD: {}, MESSAGE_WHISPER: {}, SCRIPT_MACRO: {} };
  const created = { User: [], Actor: [], Folder: [] };
  const documentClass = (type, collection) => class {
    static TYPES = ["character", "npc"];
    static async create(data) {
      const id = data._id ?? `informer-${type.toLowerCase()}-${created[type].length}`;
      const doc = {
        ...structuredClone(data), id,
        getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
        async update(changes) {
          for (const [key, value] of Object.entries(changes)) {
            const path = key.split(".");
            let object = this;
            while (path.length > 1) { const head = path.shift(); object = object[head] ??= {}; }
            object[path[0]] = structuredClone(value);
          }
          return this;
        },
        async delete() { collection.delete(this.id); }
      };
      collection.set(id, doc);
      created[type].push(doc);
      return doc;
    }
  };
  CONFIG.User = { documentClass: documentClass("User", game.users) };
  CONFIG.Actor = { documentClass: documentClass("Actor", game.actors) };
  CONFIG.Folder = { documentClass: documentClass("Folder", game.folders) };
  if (!empty) {
    const descriptor = { version: 1, ownerId: "dmicher-generics", key: "informer" };
    const flags = { "dmicher-generics": { managedIdentity: descriptor } };
    void CONFIG.Folder.documentClass.create({ _id: "dmicher-folder", type: "Actor", name: "dmicher modules", flags: {
      "dmicher-generics": { managedIdentityFolder: { ...descriptor, path: "dmicher modules" } }
    } });
    void CONFIG.Folder.documentClass.create({ _id: identity.folderId, type: "Actor", name: "generic", folder: "dmicher-folder", flags: {
      "dmicher-generics": { ...flags["dmicher-generics"], managedIdentityFolder: { ...descriptor, path: "dmicher modules/generic" } }
    } });
    void CONFIG.Actor.documentClass.create({ _id: identity.actorId, type: "npc", name: "Informer", img: INFORMER_PORTRAIT,
      folder: identity.folderId, ownership: { default: 0 }, prototypeToken: { texture: { src: INFORMER_PORTRAIT } }, flags });
    const permissions = Object.fromEntries(Object.keys(CONST.USER_PERMISSIONS).map((key) => [key, key === "MESSAGE_WHISPER"]));
    void CONFIG.User.documentClass.create({ _id: identity.userId, name: "Informer", role: 1, active: false,
      avatar: INFORMER_PORTRAIT, character: identity.actorId, permissions, flags });
    for (const list of Object.values(created)) list.length = 0;
  }
  return { created, getIdentityState: () => structuredClone(identity) };
}
