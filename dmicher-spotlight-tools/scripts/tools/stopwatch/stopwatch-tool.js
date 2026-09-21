import { publishAutomation } from "../../automation/events.js";
import {
  FLAGS,
  MODULE_ID,
  STOPWATCH_CHAT_MACRO_COMMAND
} from "../../config.js";
import { createTechnicalChatMessages } from "../../technical-chat.js";
import {
  applyChatMessageMode,
  escapeHTML,
  getChatMessageClass,
  isModerator,
  localize,
  openSingletonApplication,
  preloadImage
} from "../../utils.js";
import {
  createOrUpdateHotbarMacro,
  isHotbarDrop,
  setHotbarDragData,
  stripHotbarMacroMetadata
} from "../hotbar-macro.js";
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
    this.stateTail = Promise.resolve();
    this.pendingTransitions = 0;
    this.handleHotbarDrop = this.handleHotbarDrop.bind(this);
    this.handleChatMessage = this.handleChatMessage.bind(this);
  }

  registerHooks() {
    Hooks.on("chatMessage", this.handleChatMessage);
    Hooks.on("hotbarDrop", this.handleHotbarDrop);
  }

  registerSettings() {
    game.settings.register(MODULE_ID, "stopwatchState", {
      scope: "world", config: false, type: Object,
      default: { running: false, startedAt: 0, elapsedBeforeStart: 0, events: [], finished: false },
      onChange: (state) => this.applyState(state)
    });
  }

  applyState(state = {}) {
    this.running = state.running === true;
    this.startedAt = Math.max(0, Number(state.startedAt) || 0);
    this.elapsedBeforeStart = Math.max(0, Number(state.elapsedBeforeStart) || 0);
    this.events = Array.isArray(state.events) ? structuredClone(state.events).slice(-1000) : [];
    this.finished = state.finished === true;
    this.window?.onStopwatchStateChanged();
  }

  transition(action, check = () => {}) {
    if (this.pendingTransitions >= 100) return Promise.reject(new Error("Stopwatch queue full"));
    this.pendingTransitions += 1;
    const task = this.stateTail.then(async () => {
      if (!isModerator()) throw new Error("Moderator required");
      check();
      const state = structuredClone(game.settings.get(MODULE_ID, "stopwatchState") ?? {});
      const now = Date.now();
      const elapsed = (Number(state.elapsedBeforeStart) || 0) + (state.running ? Math.max(0, now - state.startedAt) : 0);
      let event;
      if (action === "start" || action === "resume") {
        if (state.running || (action === "resume" && state.finished)) return false;
        event = action === "resume" || elapsed > 0 ? "resumed" : "started";
        if (action === "start" && state.finished) { state.elapsedBeforeStart = 0; event = "started"; }
        Object.assign(state, { running: true, startedAt: now, finished: false });
      } else if (action === "pause" || action === "finish") {
        if ((!state.running && action === "pause") || state.finished) return false;
        Object.assign(state, { running: false, startedAt: 0, elapsedBeforeStart: elapsed, finished: action === "finish" });
        event = action === "pause" ? "paused" : "finished";
      } else if (action === "reset") {
        Object.assign(state, { running: false, startedAt: 0, elapsedBeforeStart: 0, events: [], finished: false });
        event = "reset";
      } else if (action === "clear") { state.events = []; event = "cleared"; }
      else {
        const config = getStopwatchEventConfig(action);
        if (!config || (!state.running && elapsed <= 0)) return false;
        state.events = [...(state.events ?? []), { id: foundry.utils.randomID(), type: action, label: localize(config.labelKey), image: config.image, elapsed }].slice(-1000);
      }
      check();
      await game.settings.set(MODULE_ID, "stopwatchState", state);
      this.applyState(state);
      if (event) void publishAutomation({ type: "stopwatch", id: "stopwatch" }, `stopwatch.${event}`, state, check.automationCause);
      return true;
    });
    this.stateTail = task.catch(() => {}).finally(() => { this.pendingTransitions -= 1; });
    return task;
  }

  activate() {
    this.applyState(game.settings.get(MODULE_ID, "stopwatchState"));
    for (const [, eventConfig] of getStopwatchEventEntries()) {
      void preloadImage(eventConfig.image);
    }
  }

  openWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    this.window = openSingletonApplication(
      this.window,
      () => new StopwatchWindowApplication(this)
    );
    return this.window;
  }

  forgetWindow(app) {
    if (this.window === app) this.window = null;
  }

  startPause() {
    return this.transition(this.running ? "pause" : "start");
  }

  stopReset() {
    return this.transition("reset");
  }

  getElapsed() {
    return this.elapsedBeforeStart + (this.running ? Math.max(0, Date.now() - this.startedAt) : 0);
  }

  recordEvent(eventType, check = () => {}) {
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

    return this.transition(eventType, check);
  }

  canRecordEvent() {
    return this.running || this.elapsedBeforeStart > 0;
  }

  clearEvents() {
    return this.transition("clear");
  }

  async postEventsToChat() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const ChatMessageClass = getChatMessageClass();
    const messageData = {
      content: this.buildChatContent()
    };
    applyChatMessageMode(messageData, ChatMessageClass);
    await createTechnicalChatMessages(messageData);
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
    const match = pattern.exec(stripHotbarMacroMetadata(message));
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
    return macro.getFlag(MODULE_ID, FLAGS.stopwatchMacro) === eventType
      || stripHotbarMacroMetadata(macro.command) === `${STOPWATCH_CHAT_MACRO_COMMAND} ${eventType}`;
  }
}
