import { FLAGS, MODULE_ID } from "../config.js";
import { getMacroClass, i18nKey } from "../utils.js";

const METADATA_PREFIX = `// ${MODULE_ID} |`;
const HOTBAR_PATCH = Symbol.for(`${MODULE_ID}.hotbarMacroCleanup`);
let cleanupQueue = Promise.resolve();

export function setHotbarDragData(event, type, payload = {}) {
  if (!event?.dataTransfer) return;
  const data = JSON.stringify({
    type: `${MODULE_ID}.${type}`,
    ...payload
  });
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", data);
}

export function isHotbarDrop(data, type) {
  return data?.type === `${MODULE_ID}.${type}`;
}

export function stripHotbarMacroMetadata(command) {
  return String(command ?? "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(METADATA_PREFIX))
    .join("\n")
    .trim();
}

export function buildHotbarMacroCommand(command, {
  ownerId,
  ownerName,
  createdAt,
  ownerLabel = getMetadataLabel("Owner", "Player"),
  createdLabel = getMetadataLabel("Created", "Created")
}) {
  const safeOwnerName = String(ownerName ?? ownerId ?? "").replace(/[\r\n]+/g, " ").trim();
  const safeOwnerId = String(ownerId ?? "").replace(/[\r\n]+/g, " ").trim();
  return [
    `${METADATA_PREFIX} ${ownerLabel}: ${safeOwnerName} (${safeOwnerId})`,
    `${METADATA_PREFIX} ${createdLabel}: ${createdAt}`,
    stripHotbarMacroMetadata(command)
  ].join("\n");
}

export function isManagedHotbarMacro(macro) {
  return [
    FLAGS.macro,
    FLAGS.pollMacro,
    FLAGS.stopwatchMacro
  ].some((key) => Boolean(getMacroFlag(macro, key)));
}

export function getHotbarMacroOwnerId(macro) {
  return String(
    getMacroFlag(macro, FLAGS.hotbarOwner)
    ?? macro?.author?.id
    ?? (typeof macro?.author === "string" ? macro.author : undefined)
    ?? macro?._source?.author
    ?? ""
  );
}

export async function cleanupRemovedHotbarMacros(removedIds, user = game.user) {
  const currentIds = getHotbarMacroIds(user?.hotbar);
  let deleted = 0;
  for (const macroId of new Set(Array.from(removedIds ?? [], String))) {
    if (!macroId || currentIds.has(macroId)) continue;
    const macro = game.macros.get(macroId);
    if (!macro || !macro.isOwner || !isManagedHotbarMacro(macro)) continue;
    if (getHotbarMacroOwnerId(macro) !== String(user?.id ?? "")) continue;
    try {
      await macro.delete();
      deleted += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to remove unused hotbar macro ${macroId}`, error);
    }
  }
  return deleted;
}

export function installHotbarMacroCleanup() {
  const user = game.user;
  if (!user || (typeof user.assignHotbarMacro !== "function")) return false;

  let target = user;
  while (target && !Object.hasOwn(target, "assignHotbarMacro")) target = Object.getPrototypeOf(target);
  if (!target) return false;

  const descriptor = Object.getOwnPropertyDescriptor(target, "assignHotbarMacro");
  const original = descriptor?.value;
  if (typeof original !== "function") return false;
  if (original[HOTBAR_PATCH]) return true;

  const wrapped = async function(...args) {
    const currentUser = this === globalThis.game?.user;
    const before = currentUser ? getHotbarMacroIds(this.hotbar) : null;
    const result = await original.apply(this, args);
    if (before) {
      const after = getHotbarMacroIds(this.hotbar);
      const removed = Array.from(before).filter((macroId) => !after.has(macroId));
      if (removed.length) {
        cleanupQueue = cleanupQueue
          .catch(() => undefined)
          .then(() => cleanupRemovedHotbarMacros(removed, this));
        await cleanupQueue;
      }
    }
    return result;
  };
  Object.defineProperty(wrapped, HOTBAR_PATCH, { value: true });

  try {
    Object.defineProperty(target, "assignHotbarMacro", {
      ...descriptor,
      value: wrapped
    });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to install hotbar macro cleanup`, error);
    return false;
  }
}

export async function synchronizeCurrentUserHotbarMacroMetadata() {
  const user = game.user;
  const updates = [];
  for (const macroId of getHotbarMacroIds(user?.hotbar)) {
    const macro = game.macros.get(macroId);
    if (!macro || !macro.isOwner || !isManagedHotbarMacro(macro)) continue;
    if (!isMacroOwnedByCurrentUser(macro, user)) continue;
    const metadata = getHotbarMacroMetadata(macro, user);
    if (!metadata) continue;
    const command = buildHotbarMacroCommand(macro.command, metadata);
    const updateData = {};
    if (macro.command !== command) updateData.command = command;
    if (getMacroFlag(macro, FLAGS.hotbarOwner) !== metadata.ownerId) {
      updateData[`flags.${MODULE_ID}.${FLAGS.hotbarOwner}`] = metadata.ownerId;
    }
    if (getMacroFlag(macro, FLAGS.hotbarCreatedAt) !== metadata.createdAt) {
      updateData[`flags.${MODULE_ID}.${FLAGS.hotbarCreatedAt}`] = metadata.createdAt;
    }
    if (Object.keys(updateData).length) updates.push(macro.update(updateData));
  }
  if (updates.length) await Promise.allSettled(updates);
  return updates.length;
}

export async function createOrUpdateHotbarMacro({
  slot,
  name,
  type,
  img,
  updateImage = true,
  command,
  flags,
  findExisting,
  updateFlags = {},
  notify = true,
  addedMessage = "",
  errorMessage = "",
  logMessage = "Unable to create hotbar macro"
}) {
  const MacroClass = getMacroClass();

  try {
    let macro = game.macros.find((item) => (
      item.isOwner
      && isMacroOwnedByCurrentUser(item)
      && findExisting(item)
    ));
    const metadata = getHotbarMacroMetadata(macro);
    const desiredCommand = metadata
      ? buildHotbarMacroCommand(command, metadata)
      : command;
    const desiredFlags = metadata
      ? mergeHotbarMetadataFlags(flags, metadata)
      : flags;

    if (!macro) {
      macro = await MacroClass.create({
        name,
        type,
        img,
        command: desiredCommand,
        flags: desiredFlags
      });
    } else {
      const updateData = {};
      if (macro.name !== name) updateData.name = name;
      if (macro.type !== type) updateData.type = type;
      if (updateImage && macro.img !== img) updateData.img = img;
      if (macro.command !== desiredCommand) updateData.command = desiredCommand;
      Object.assign(updateData, updateFlags);
      if (metadata) {
        updateData[`flags.${MODULE_ID}.${FLAGS.hotbarOwner}`] = metadata.ownerId;
        updateData[`flags.${MODULE_ID}.${FLAGS.hotbarCreatedAt}`] = metadata.createdAt;
      }
      if (Object.keys(updateData).length) await macro.update(updateData);
    }

    await game.user.assignHotbarMacro(macro, slot);
    if (notify && addedMessage) ui.notifications.info(addedMessage);
    return macro;
  } catch (error) {
    console.error(`${MODULE_ID} | ${logMessage}`, error);
    if (errorMessage) ui.notifications.error(errorMessage);
    return null;
  }
}

function getHotbarMacroIds(hotbar) {
  return new Set(Object.values(hotbar ?? {}).filter(Boolean).map(String));
}

function getMacroFlag(macro, key) {
  return macro?.getFlag?.(MODULE_ID, key) ?? macro?.flags?.[MODULE_ID]?.[key];
}

function isMacroOwnedByCurrentUser(macro, user = game.user) {
  const userId = String(user?.id ?? "");
  if (!userId) return true;
  const flaggedOwner = String(getMacroFlag(macro, FLAGS.hotbarOwner) ?? "");
  if (flaggedOwner) return flaggedOwner === userId;
  const authorId = String(
    macro?.author?.id
    ?? (typeof macro?.author === "string" ? macro.author : undefined)
    ?? macro?._source?.author
    ?? ""
  );
  return !authorId || authorId === userId;
}

function getHotbarMacroMetadata(macro, user = game.user) {
  const ownerId = String(user?.id ?? "");
  if (!ownerId) return null;
  const storedCreatedAt = getMacroFlag(macro, FLAGS.hotbarCreatedAt);
  const createdAt = normalizeCreatedAt(storedCreatedAt ?? macro?._stats?.createdTime);
  return {
    ownerId,
    ownerName: String(user?.name ?? ownerId),
    createdAt
  };
}

function normalizeCreatedAt(value) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric)
    : new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function mergeHotbarMetadataFlags(flags, metadata) {
  return {
    ...(flags ?? {}),
    [MODULE_ID]: {
      ...(flags?.[MODULE_ID] ?? {}),
      [FLAGS.hotbarOwner]: metadata.ownerId,
      [FLAGS.hotbarCreatedAt]: metadata.createdAt
    }
  };
}

function getMetadataLabel(key, fallback) {
  const localizationKey = i18nKey(`Hotbar.Metadata.${key}`);
  const value = globalThis.game?.i18n?.localize?.(localizationKey);
  return value && value !== localizationKey ? value : fallback;
}
