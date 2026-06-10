import {
  FLAGS,
  MODULE_ID,
  STOPWATCH_CHAT_MACRO_COMMAND
} from "../../config.js";
import {
  escapeHTML,
  getChatMessageClass,
  isModerator,
  localize,
  preloadImage
} from "../../utils.js";
import { createOrUpdateHotbarMacro, isHotbarDrop, setHotbarDragData } from "../hotbar-macro.js";
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
      void preloadImage(eventConfig.image);
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

    setHotbarDragData(event, "stopwatch-event", { eventType });
  }

  handleHotbarDrop(_hotbar, data, slot) {
    if (!isHotbarDrop(data, "stopwatch-event")) return;
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

    const name = localize(eventConfig.labelKey);
    const command = `${STOPWATCH_CHAT_MACRO_COMMAND} ${eventType}`;

    await createOrUpdateHotbarMacro({
      slot,
      name,
      type: "chat",
      img: eventConfig.image,
      command,
      flags: {
        [MODULE_ID]: {
          [FLAGS.stopwatchMacro]: eventType
        }
      },
      findExisting: (macro) => this.isStopwatchMacro(macro, eventType),
      updateFlags: {
        [`flags.${MODULE_ID}.${FLAGS.stopwatchMacro}`]: eventType
      },
      notify,
      addedMessage: localize("Timers.Stopwatch.MacroAdded"),
      errorMessage: localize("Timers.Stopwatch.MacroError"),
      logMessage: "Unable to create stopwatch macro"
    });
  }

  isStopwatchMacro(macro, eventType) {
    return macro.getFlag(MODULE_ID, FLAGS.stopwatchMacro) === eventType || macro.command === `${STOPWATCH_CHAT_MACRO_COMMAND} ${eventType}`;
  }
}
