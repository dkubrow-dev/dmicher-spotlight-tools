import { FLAGS, MODULE_ID } from "./config.js";
import { generics } from "./generics.js";
import { getRequestConfiguration } from "./tools/requests/request-config.js";
import { isModerator, localize } from "./utils.js";

export const INFORMER_PORTRAIT = generics.chat.informer.portrait;

export function isTechnicalChatEnabled(category) {
  const configuration = getRequestConfiguration();
  return configuration?.chatEnabled !== false && (!category || configuration?.chatNotifications?.[category] !== false);
}

const messages = generics.chat.informer.createMessageService({
  ownerId: MODULE_ID,
  channel: "technical",
  // Keep old history and retry keys usable without rewriting existing chat documents.
  readLegacyMetadata: (message) => message.getFlag?.(MODULE_ID, FLAGS.technical),
  onRollbackError: (error) => console.error(`${MODULE_ID} | Unable to remove partial technical delivery`, error)
});

export function isTechnicalUser(user) {
  return generics.chat.isManagedIdentityUser(user) || user?.getFlag?.(MODULE_ID, "informerIdentity") === true;
}

export async function createTechnicalChatMessages(data, { category, deduplicationKey } = {}) {
  if (!isTechnicalChatEnabled(category)) return [];
  if (!isModerator()) throw new Error(localize("TechnicalChat.RequiresGM"));
  return messages.create(({ key, recipientId, informer }) => {
    return {
      ...data,
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
