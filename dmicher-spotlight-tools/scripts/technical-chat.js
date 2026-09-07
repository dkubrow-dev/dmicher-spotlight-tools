import { FLAGS, MODULE_ID, SETTINGS, SOCKET_CHANNEL } from "./config.js";
import { getRequestConfiguration } from "./tools/requests/request-config.js";
import { buildChatSpeaker, createSerialTaskQueue, getChatMessageClass, isModerator, localize } from "./utils.js";

export const INFORMER_PORTRAIT = `modules/${MODULE_ID}/assets/chat/token_dak.webp`;
const managedFlag = "informerIdentity";
const runLifecycle = createSerialTaskQueue();
const runDelivery = createSerialTaskQueue();
const pendingRequests = new Map();

export function isTechnicalChatEnabled(category) {
  const configuration = getRequestConfiguration();
  return configuration?.chatEnabled !== false && (!category || configuration?.chatNotifications?.[category] !== false);
}

function getIdentityState() {
  const value = game.settings.get(MODULE_ID, SETTINGS.technicalChatIdentity);
  return value && typeof value === "object" ? value : {};
}

export function isTechnicalUser(user) {
  if (!user?.id) return false;
  return user.id === getIdentityState().userId || user.getFlag?.(MODULE_ID, managedFlag) === true;
}

function getProvisioningGM() {
  return Array.from(game.users).filter((user) => user.active && Number(user.role) === 4)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

function findManaged(collection, id) {
  return collection?.get?.(id) ?? Array.from(collection ?? [])
    .find((document) => document.getFlag?.(MODULE_ID, managedFlag) === true);
}

function getIdentity() {
  const state = getIdentityState();
  return {
    user: findManaged(game.users, state.userId),
    actor: findManaged(game.actors, state.actorId),
    folder: findManaged(game.folders, state.folderId)
  };
}

function documentClass(name) {
  return CONFIG[name]?.documentClass ?? globalThis.getDocumentClass?.(name) ?? foundry.documents?.[name] ?? globalThis[name];
}

function getActorType(ActorClass) {
  const types = game.documentTypes?.Actor ?? ActorClass.TYPES ?? Object.keys(CONFIG.Actor?.dataModels ?? {});
  return ["npc", "mook", "character"].find((type) => types.includes(type)) ?? types[0];
}

function minimalPermissions() {
  const permissions = Object.fromEntries(Object.keys(CONST.USER_PERMISSIONS ?? {}).map((key) => [key, false]));
  permissions.MESSAGE_WHISPER = true;
  return permissions;
}

async function synchronizeLocally() {
  if (getProvisioningGM()?.id !== game.user.id) throw new Error(localize("TechnicalChat.RequiresGM"));
  const state = getIdentityState();
  let { user, actor, folder } = getIdentity();
  if (folder?.type !== "Actor") folder = null;
  if (!isTechnicalChatEnabled()) {
    if (user) {
      await game.settings.set(MODULE_ID, SETTINGS.technicalChatIdentity, { ...state, userId: user.id, name: user.name });
      await user.delete();
    }
    return null;
  }

  const UserClass = documentClass("User");
  const ActorClass = documentClass("Actor");
  const FolderClass = documentClass("Folder");
  if (!UserClass || !ActorClass) throw new Error(localize("TechnicalChat.Unavailable"));
  const baseName = String(user?.name || state.name || actor?.name || localize("TechnicalChat.Informer"));
  let name = baseName;
  for (let suffix = 2; !user && Array.from(game.users).some((entry) => entry.name === name); suffix += 1) {
    name = `${baseName} (${suffix})`;
  }
  const nextState = { ...state, name };
  const persist = async (key, id) => {
    nextState[key] = id;
    await game.settings.set(MODULE_ID, SETTINGS.technicalChatIdentity, nextState);
  };
  const managedFlags = { [MODULE_ID]: { [managedFlag]: true } };

  if (!folder && FolderClass) {
    try {
      folder = await FolderClass.create({
        ...(state.folderId && !game.folders?.get(state.folderId) ? { _id: state.folderId } : {}),
        name: game.modules.get(MODULE_ID)?.title || localize("Title"),
        type: "Actor", folder: null, flags: managedFlags
      }, { keepId: true });
      if (folder) await persist("folderId", folder.id);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to create the informer folder`, error);
    }
  }

  if (!actor) {
    const type = getActorType(ActorClass);
    if (!type) throw new Error(localize("TechnicalChat.ActorTypeUnavailable"));
    actor = await ActorClass.create({
      ...(state.actorId ? { _id: state.actorId } : {}),
      name, type, img: INFORMER_PORTRAIT, folder: folder?.id ?? null,
      prototypeToken: { name, actorLink: true, texture: { src: INFORMER_PORTRAIT } },
      ownership: { default: 0 }, flags: managedFlags
    }, { keepId: true });
    if (!actor) throw new Error(localize("TechnicalChat.Unavailable"));
    await persist("actorId", actor.id);
  }
  const actorChanges = {};
  if (actor.name !== name) actorChanges.name = name;
  if (actor.img !== INFORMER_PORTRAIT) actorChanges.img = INFORMER_PORTRAIT;
  if (actor.prototypeToken?.texture?.src !== INFORMER_PORTRAIT) actorChanges["prototypeToken.texture.src"] = INFORMER_PORTRAIT;
  if (folder && (actor.folder?.id ?? actor.folder) !== folder.id) actorChanges.folder = folder.id;
  if (Object.keys(actorChanges).length) await actor.update(actorChanges);
  if (Object.entries(actor.ownership ?? {}).some(([key, value]) => key !== "default" || value !== 0) || actor.ownership?.default !== 0) {
    await actor.update({ ownership: { default: 0 } }, { diff: false, recursive: false });
  }

  const permissions = minimalPermissions();
  if (!user) {
    user = await UserClass.create({
      ...(state.userId ? { _id: state.userId } : {}),
      name, password: "infobot", role: 1, avatar: INFORMER_PORTRAIT,
      character: actor.id, permissions, flags: managedFlags
    }, { keepId: true });
    if (!user) throw new Error(localize("TechnicalChat.Unavailable"));
    await persist("userId", user.id);
  } else {
    const changes = {};
    if (Number(user.role) !== 1) changes.role = 1;
    if (user.avatar !== INFORMER_PORTRAIT) changes.avatar = INFORMER_PORTRAIT;
    if ((user.character?.id ?? user.character) !== actor.id) changes.character = actor.id;
    if (Object.entries(permissions).some(([key, value]) => user.permissions?.[key] !== value)) changes.permissions = permissions;
    if (Object.keys(changes).length) await user.update(changes);
  }
  Object.assign(nextState, { userId: user.id, actorId: actor.id, folderId: folder?.id ?? "", name: user.name });
  if (JSON.stringify(nextState) !== JSON.stringify(getIdentityState())) {
    await game.settings.set(MODULE_ID, SETTINGS.technicalChatIdentity, nextState);
  }
  return { user, actor, folder };
}

export async function synchronizeTechnicalIdentity() {
  const authority = getProvisioningGM();
  if (authority?.id === game.user.id) return runLifecycle(synchronizeLocally);
  if (!authority) {
    const identity = getIdentity();
    if (isTechnicalChatEnabled() && identity.user && identity.actor) return identity;
    if (!isTechnicalChatEnabled() && !identity.user) return null;
    throw new Error(localize("TechnicalChat.RequiresGM"));
  }
  const id = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(localize("TechnicalChat.Unavailable")));
    }, 10000);
    pendingRequests.set(id, { resolve, reject, timeout });
    game.socket.emit(SOCKET_CHANNEL, { action: "technicalIdentityEnsure", id, requesterId: game.user.id });
  });
}

function receiveIdentityMessage(payload) {
  if (payload?.action === "technicalIdentityEnsure") {
    if (getProvisioningGM()?.id !== game.user.id || !isModerator(game.users.get(payload.requesterId))) return;
    void runLifecycle(synchronizeLocally).then(
      () => game.socket.emit(SOCKET_CHANNEL, { action: "technicalIdentityReady", id: payload.id, requesterId: payload.requesterId }),
      (error) => game.socket.emit(SOCKET_CHANNEL, { action: "technicalIdentityReady", id: payload.id, requesterId: payload.requesterId, error: error.message })
    );
  } else if (payload?.action === "technicalIdentityReady" && payload.requesterId === game.user.id) {
    const pending = pendingRequests.get(payload.id);
    if (!pending) return;
    pendingRequests.delete(payload.id);
    window.clearTimeout(pending.timeout);
    if (payload.error) pending.reject(new Error(payload.error));
    else pending.resolve(isTechnicalChatEnabled() ? getIdentity() : null);
  }
}

export function registerTechnicalChat() {
  game.settings.register(MODULE_ID, SETTINGS.technicalChatIdentity, {
    scope: "world", config: false, type: Object, default: {}
  });
}

export async function activateTechnicalChat() {
  game.socket.on(SOCKET_CHANNEL, receiveIdentityMessage);
  if (getProvisioningGM()?.id === game.user.id) await synchronizeTechnicalIdentity();
}

export function createTechnicalChatMessages(data, options = {}) {
  return runDelivery(() => deliverTechnicalChatMessages(data, options));
}

async function deliverTechnicalChatMessages(data, { category, deduplicationKey } = {}) {
  if (!isTechnicalChatEnabled(category)) return [];
  if (!isModerator()) throw new Error(localize("TechnicalChat.RequiresGM"));
  let identity = await synchronizeTechnicalIdentity();
  if (!isTechnicalChatEnabled(category)) return [];
  if (!identity?.user || !identity.actor) throw new Error(localize("TechnicalChat.Unavailable"));

  const recipients = Array.from(new Set(data.whisper?.length ? data.whisper : Array.from(game.users).map((user) => user.id)))
    .filter((id) => game.users.get(id) && !isTechnicalUser(game.users.get(id)));
  const key = deduplicationKey || foundry.utils.randomID();
  const messages = [];
  const created = [];
  try {
    for (const recipientId of recipients) {
      if (!isTechnicalChatEnabled(category)) break;
      const existing = deduplicationKey && Array.from(game.messages ?? []).find((message) => {
        const flag = message.getFlag?.(MODULE_ID, FLAGS.technical);
        return flag?.key === key && flag?.recipientId === recipientId;
      });
      if (existing) { messages.push(existing); continue; }
      if (!game.users.get(identity.user.id) || !game.actors.get(identity.actor.id)) {
        identity = await synchronizeTechnicalIdentity();
        if (!isTechnicalChatEnabled(category)) break;
        if (!identity?.user || !identity.actor) throw new Error(localize("TechnicalChat.Unavailable"));
      }
      const { user: _user, author: _author, speaker: _speaker, ...content } = data;
      const message = await getChatMessageClass().create({
        ...content,
        author: identity.user.id,
        speaker: buildChatSpeaker({ alias: identity.actor.name, actor: identity.actor.id }),
        whisper: [recipientId],
        flags: {
          ...data.flags,
          [MODULE_ID]: {
            ...data.flags?.[MODULE_ID],
            [FLAGS.technical]: { key, recipientId, authorId: identity.user.id, authorName: identity.user.name,
              characterName: identity.actor.name, portrait: INFORMER_PORTRAIT }
          }
        }
      });
      if (!message) throw new Error(localize("TechnicalChat.SendFailed"));
      created.push(message);
      messages.push(message);
    }
    return messages;
  } catch (error) {
    for (const message of created) {
      try { await message.delete(); }
      catch (rollbackError) { console.error(`${MODULE_ID} | Unable to remove partial technical delivery`, rollbackError); }
    }
    throw error;
  }
}
