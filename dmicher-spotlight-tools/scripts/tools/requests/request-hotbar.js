import {
  CHAT_MACRO_COMMAND,
  FLAGS,
  MODULE_ID,
  REQUEST_LIMIT_MODES,
  REQUEST_TYPES,
  normalizeRequestType
} from "../../config.js";
import { canUseRequest, format, localize } from "../../utils.js";
import {
  createOrUpdateHotbarMacro,
  isHotbarDrop,
  setHotbarDragData,
  stripHotbarMacroMetadata
} from "../hotbar-macro.js";
import { getRequestConfiguration, getRequestImage } from "./request-config.js";

export class RequestHotbar {
  constructor(submitRequest) {
    this.submitRequest = submitRequest;
    this.onRequestDragStart = this.onRequestDragStart.bind(this);
    this.handleHotbarDrop = this.handleHotbarDrop.bind(this);
    this.handleChatMessage = this.handleChatMessage.bind(this);
  }

  registerHooks() {
    Hooks.on("chatMessage", this.handleChatMessage);
    Hooks.on("hotbarDrop", this.handleHotbarDrop);
  }

  onRequestDragStart(event) {
    const type = normalizeRequestType(event.currentTarget.dataset.urgency);
    if (this.isForbidden(type)) {
      event.preventDefault();
      ui.notifications.warn(localize("Requests.Limits.ForbiddenNotice"));
      return;
    }
    setHotbarDragData(event, "request", { urgency: type });
  }

  handleHotbarDrop(_hotbar, data, slot) {
    if (!isHotbarDrop(data, "request")) return;
    const type = normalizeRequestType(data.urgency);
    if (this.isForbidden(type)) {
      ui.notifications.warn(localize("Requests.Limits.ForbiddenNotice"));
      return false;
    }
    void this.createMacro(type, slot);
    return false;
  }

  handleChatMessage(_chatLog, message) {
    const pattern = new RegExp(`^${CHAT_MACRO_COMMAND}\\s+(\\S+)\\s*$`, "i");
    const match = pattern.exec(stripHotbarMacroMetadata(message));
    const type = match?.[1]?.toLowerCase();
    if (!type || !Object.hasOwn(REQUEST_TYPES, type)) return;
    void this.submitRequest(type);
    return false;
  }

  async createMacro(type, slot, notify = true) {
    type = normalizeRequestType(type);
    const request = REQUEST_TYPES[type];
    if (!canUseRequest(request)) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }
    if (this.isForbidden(type)) {
      ui.notifications.warn(localize("Requests.Limits.ForbiddenNotice"));
      return;
    }

    const label = localize(request.labelKey);
    const name = format("Requests.Hotbar.MacroName", { label, title: localize("Title") });
    const command = this.getChatMacroCommand(type);
    await createOrUpdateHotbarMacro({
      slot,
      name,
      type: "chat",
      img: getRequestImage(type),
      updateImage: false,
      command,
      flags: { [MODULE_ID]: { [FLAGS.macro]: type } },
      findExisting: (macro) => this.isRequestMacro(macro, type),
      updateFlags: { [`flags.${MODULE_ID}.${FLAGS.macro}`]: type },
      notify,
      addedMessage: format("Requests.Hotbar.Added", { label }),
      errorMessage: localize("Requests.Hotbar.AddError"),
      logMessage: "Unable to create request hotbar macro"
    });
  }

  async migrateMacros() {
    const migrations = [];
    for (const [type, request] of Object.entries(REQUEST_TYPES)) {
      if (!canUseRequest(request)) continue;
      for (const macro of game.macros.filter((item) => item.isOwner && this.isRequestMacro(item, type))) {
        if ((macro.type === "chat") && (stripHotbarMacroMetadata(macro.command) === this.getChatMacroCommand(type))) continue;
        migrations.push(macro.update({
          type: "chat",
          command: this.getChatMacroCommand(type),
          [`flags.${MODULE_ID}.${FLAGS.macro}`]: type
        }));
      }
    }
    if (migrations.length) await Promise.allSettled(migrations);

    for (const [slot, macroId] of Object.entries(game.user.hotbar ?? {})) {
      const macro = game.macros.get(macroId);
      if (!macro || macro.isOwner) continue;
      const type = Object.entries(REQUEST_TYPES).find(([key, request]) => (
        canUseRequest(request) && this.isRequestMacro(macro, key)
      ))?.[0];
      if (type && !this.isForbidden(type)) await this.createMacro(type, Number(slot), false);
    }
  }

  isRequestMacro(macro, type) {
    const flaggedType = macro.getFlag(MODULE_ID, FLAGS.macro);
    const legacyCommand = `game.modules.get("${MODULE_ID}").api.submitRequest("${type}");`;
    return (flaggedType === type) || (stripHotbarMacroMetadata(macro.command) === legacyCommand);
  }

  getChatMacroCommand(type) {
    return `${CHAT_MACRO_COMMAND} ${type}`;
  }

  isForbidden(type) {
    if (REQUEST_TYPES[type]?.moderatorOnly) return false;
    return getRequestConfiguration().limits[type]?.mode === REQUEST_LIMIT_MODES.forbidden;
  }
}
