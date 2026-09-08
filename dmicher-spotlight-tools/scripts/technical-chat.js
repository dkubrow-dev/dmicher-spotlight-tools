import { FLAGS, MODULE_ID, SETTINGS } from "./config.js";
import { generics } from "./generics.js";
import { getRequestConfiguration } from "./tools/requests/request-config.js";
import { buildChatSpeaker, isModerator, localize } from "./utils.js";

export const INFORMER_PORTRAIT = `modules/${MODULE_ID}/assets/chat/token_dak.webp`;

export function isTechnicalChatEnabled(category) {
  const configuration = getRequestConfiguration();
  return configuration?.chatEnabled !== false && (!category || configuration?.chatNotifications?.[category] !== false);
}

const identity = generics.chat.createManagedIdentity({
  ownerId: MODULE_ID,
  key: "informer",
  readState: () => game.settings.get(MODULE_ID, SETTINGS.technicalChatIdentity) ?? {},
  writeState: (state) => game.settings.set(MODULE_ID, SETTINGS.technicalChatIdentity, state),
  enabled: () => isTechnicalChatEnabled(),
  defaults: () => ({
    name: localize("TechnicalChat.Informer"), portrait: INFORMER_PORTRAIT, password: "infobot",
    folderName: game.modules.get(MODULE_ID)?.title || localize("Title")
  }),
  legacyFlag: { namespace: MODULE_ID, key: "informerIdentity" },
  canRequest: (user) => isModerator(user),
  errorMessage: (code) => localize(`TechnicalChat.${code === "Disposed" ? "Unavailable" : code}`)
});

const messages = generics.chat.createMessageService({
  ownerId: MODULE_ID,
  channel: "technical",
  // Keep old history and retry keys usable without rewriting existing chat documents.
  readLegacyMetadata: (message) => message.getFlag?.(MODULE_ID, FLAGS.technical),
  onRollbackError: (error) => console.error(`${MODULE_ID} | Unable to remove partial technical delivery`, error)
});

export function isTechnicalUser(user) {
  return generics.chat.isManagedIdentityUser(user) || identity.isUser(user);
}

export const synchronizeTechnicalIdentity = () => identity.synchronize();

export function registerTechnicalChat() {
  game.settings.register(MODULE_ID, SETTINGS.technicalChatIdentity, {
    scope: "world", config: false, type: Object, default: {}
  });
}

export const activateTechnicalChat = () => identity.activate();

export async function createTechnicalChatMessages(data, { category, deduplicationKey } = {}) {
  if (!isTechnicalChatEnabled(category)) return [];
  if (!isModerator()) throw new Error(localize("TechnicalChat.RequiresGM"));
  let informer = await synchronizeTechnicalIdentity();
  if (!isTechnicalChatEnabled(category)) return [];
  if (!informer?.user || !informer.actor) throw new Error(localize("TechnicalChat.Unavailable"));

  return messages.create(async ({ key, recipientId }) => {
    if (!game.users.get(informer.user.id) || !game.actors.get(informer.actor.id)) {
      informer = await synchronizeTechnicalIdentity();
      if (!isTechnicalChatEnabled(category)) return {};
      if (!informer?.user || !informer.actor) throw new Error(localize("TechnicalChat.Unavailable"));
    }
    return {
      ...data,
      author: informer.user.id,
      speaker: buildChatSpeaker({ alias: informer.actor.name, actor: informer.actor.id }),
      flags: { ...data.flags, [MODULE_ID]: { ...data.flags?.[MODULE_ID], [FLAGS.technical]: {
        key, recipientId, authorId: informer.user.id, authorName: informer.user.name,
        characterName: informer.actor.name, portrait: INFORMER_PORTRAIT
      } } }
    };
  }, {
    // Spotlight's historical empty whisper means all humans, privately. Generic empty users means nobody.
    audience: data.whisper?.length ? { type: "users", userIds: data.whisper } : { type: "all" },
    delivery: "per-recipient", key: deduplicationKey || undefined, kind: category || "notification", technical: true,
    enabled: () => isTechnicalChatEnabled(category), excludeUser: isTechnicalUser,
    errorMessage: () => localize("TechnicalChat.SendFailed")
  });
}
