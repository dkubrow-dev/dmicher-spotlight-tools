import {
  FLAGS,
  MODULE_ID,
  STOPWATCH_CHAT_MACRO_COMMAND
} from "../../config.js";
import {
  escapeHTML,
  getChatMessageClass,
  getMacroClass,
  isModerator,
  localize
} from "../../utils.js";
import {
  formatStopwatchElapsed,
  getStopwatchEventConfig,
  getStopwatchEventEntries,
  normalizeStopwatchEventType
} from "./stopwatch-utils.js";
import { StopwatchWindowApplication } from "./stopwatch-window.js";

export class StopwatchTool {
  constructor() {
    this.window = null;
    this.running = false;
    this.startedAt = 0;
    this.elapsedBeforeStart = 0;
    this.events = [];
    this.handleHotbarDrop = this.handleHotbarDrop.bind(this);
    this.handleChatMessage = this.handleChatMessage.bind(this);
  }

  registerHooks() {
    Hooks.on("chatMessage", this.handleChatMessage);
    Hooks.on("hotbarDrop", this.handleHotbarDrop);
  }

  activate() {
    for (const [, eventConfig] of getStopwatchEventEntries()) {
      void this.preloadImage(eventConfig.image);
    }
  }

  openWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    if (this.window?.rendered) {
      this.window.bringToFront();
      return this.window;
    }

    this.window = new StopwatchWindowApplication(this);
    void this.window.render({ force: true });
    return this.window;
  }

  forgetWindow(app) {
    if (this.window === app) this.window = null;
  }

  startPause() {
    if (!isModerator()) return;
    if (this.running) {
      this.elapsedBeforeStart = this.getElapsed();
      this.running = false;
      this.startedAt = 0;
    } else {
      this.startedAt = performance.now();
      this.running = true;
    }
    this.window?.onStopwatchStateChanged();
  }

  stopReset() {
    if (!isModerator()) return;
    this.running = false;
    this.startedAt = 0;
    this.elapsedBeforeStart = 0;
    this.window?.onStopwatchStateChanged();
  }

  getElapsed() {
    return this.elapsedBeforeStart + (this.running ? performance.now() - this.startedAt : 0);
  }

  recordEvent(eventType) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    if (!this.canRecordEvent()) {
      ui.notifications.warn(localize("Timers.Stopwatch.NotStarted"));
      return;
    }

    eventType = normalizeStopwatchEventType(eventType);
    const eventConfig = getStopwatchEventConfig(eventType);
    if (!eventConfig) return;

    this.events.push({
      id: foundry.utils.randomID(),
      type: eventType,
      label: localize(eventConfig.labelKey),
      image: eventConfig.image,
      elapsed: this.getElapsed()
    });
    this.window?.onStopwatchEventsChanged();
  }

  canRecordEvent() {
    return this.running || this.elapsedBeforeStart > 0;
  }

  clearEvents() {
    if (!isModerator()) return;
    this.events = [];
    this.window?.onStopwatchEventsChanged();
  }

  async postEventsToChat() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const ChatMessageClass = getChatMessageClass();
    const messageData = {
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content: this.buildChatContent()
    };
    ChatMessageClass.applyRollMode?.(messageData, game.settings.get("core", "rollMode"));
    await ChatMessageClass.create(messageData);
  }

  buildChatContent() {
    const rows = this.events.map((event) => `
      <tr>
        <td>${escapeHTML(event.label)}</td>
        <td>${escapeHTML(formatStopwatchElapsed(event.elapsed))}</td>
      </tr>`).join("");

    return `
      <section class="dmicher-stopwatch-chat-card">
        <h3>${escapeHTML(localize("Timers.Stopwatch.Title"))}</h3>
        <table>
          <thead>
            <tr>
              <th>${escapeHTML(localize("Timers.Stopwatch.Chat.Event"))}</th>
              <th>${escapeHTML(localize("Timers.Stopwatch.Chat.Time"))}</th>
            </tr>
          </thead>
          <tbody>${rows || this.buildEmptyChatRow()}</tbody>
        </table>
      </section>`;
  }

  buildEmptyChatRow() {
    return `
      <tr>
        <td colspan="2">${escapeHTML(localize("Timers.Stopwatch.NoEvents"))}</td>
      </tr>`;
  }

  onEventDragStart(event) {
    const eventType = event.currentTarget.dataset.stopwatchEvent;
    if (!getStopwatchEventConfig(eventType)) return;

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: `${MODULE_ID}.stopwatch-event`,
      eventType
    }));
  }

  handleHotbarDrop(_hotbar, data, slot) {
    if (data.type !== `${MODULE_ID}.stopwatch-event`) return;
    void this.createMacro(data.eventType, slot);
    return false;
  }

  handleChatMessage(_chatLog, message) {
    const pattern = new RegExp(`^${STOPWATCH_CHAT_MACRO_COMMAND}\\s+(\\S+)\\s*$`, "i");
    const match = pattern.exec(String(message).trim());
    const eventType = normalizeStopwatchEventType(match?.[1]);
    if (!eventType) return;

    this.recordEvent(eventType);
    return false;
  }

  async createMacro(eventType, slot, notify = true) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    eventType = normalizeStopwatchEventType(eventType);
    const eventConfig = getStopwatchEventConfig(eventType);
    if (!eventConfig) return;

    const MacroClass = getMacroClass();
    const name = localize(eventConfig.labelKey);
    const command = `${STOPWATCH_CHAT_MACRO_COMMAND} ${eventType}`;

    try {
      let macro = game.macros.find((item) => item.isOwner && this.isStopwatchMacro(item, eventType));
      if (!macro) {
        macro = await MacroClass.create({
          name,
          type: "chat",
          img: eventConfig.image,
          command,
          flags: {
            [MODULE_ID]: {
              [FLAGS.stopwatchMacro]: eventType
            }
          }
        });
      } else if ((macro.type !== "chat") || (macro.command !== command) || (macro.name !== name) || (macro.img !== eventConfig.image)) {
        await macro.update({
          name,
          type: "chat",
          img: eventConfig.image,
          command,
          [`flags.${MODULE_ID}.${FLAGS.stopwatchMacro}`]: eventType
        });
      }

      await game.user.assignHotbarMacro(macro, slot);
      if (notify) ui.notifications.info(localize("Timers.Stopwatch.MacroAdded"));
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to create stopwatch macro`, error);
      ui.notifications.error(localize("Timers.Stopwatch.MacroError"));
    }
  }

  isStopwatchMacro(macro, eventType) {
    return macro.getFlag(MODULE_ID, FLAGS.stopwatchMacro) === eventType || macro.command === `${STOPWATCH_CHAT_MACRO_COMMAND} ${eventType}`;
  }

  preloadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
      image.src = src;
    });
  }
}
