import { MODULE_ID } from "../config.js";
import { getMacroClass } from "../utils.js";

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

export async function createOrUpdateHotbarMacro({
  slot,
  name,
  type,
  img,
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
    let macro = game.macros.find((item) => item.isOwner && findExisting(item));
    if (!macro) {
      macro = await MacroClass.create({
        name,
        type,
        img,
        command,
        flags
      });
    } else {
      const updateData = {};
      if (macro.name !== name) updateData.name = name;
      if (macro.type !== type) updateData.type = type;
      if (macro.img !== img) updateData.img = img;
      if (macro.command !== command) updateData.command = command;
      Object.assign(updateData, updateFlags);
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
