import { MODULE_ID } from "../../config.js";
import { i18nKey, localize } from "../../utils.js";
import {
  formatStopwatchElapsed,
  getStopwatchEventButtons,
  splitStopwatchElapsed
} from "./stopwatch-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const STOPWATCH_TICK_MS = 50;

export class StopwatchWindowApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-stopwatch",
    classes: ["dmicher-stopwatch"],
    position: {
      width: 320,
      height: 550
    },
    window: {
      icon: "fa-solid fa-stopwatch",
      title: "DMICHERSPOTLIGHTTOOLS.Timers.Stopwatch.Title",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/stopwatch/stopwatch.hbs`
    }
  };

  constructor(stopwatchTool, options = {}) {
    super(options);
    this.stopwatchTool = stopwatchTool;
    this.tickHandle = null;
  }

  get title() {
    return localize("Timers.Stopwatch.Title");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      running: this.stopwatchTool.running,
      elapsed: this.prepareElapsedParts(),
      events: this.stopwatchTool.events.map((event) => ({
        ...event,
        time: formatStopwatchElapsed(event.elapsed)
      })),
      eventButtons: getStopwatchEventButtons(),
      hasEvents: this.stopwatchTool.events.length > 0,
      startPauseTitle: localize(this.stopwatchTool.running ? "Timers.Stopwatch.Pause" : "Timers.Stopwatch.Start"),
      keys: {
        title: i18nKey("Timers.Stopwatch.Title"),
        start: i18nKey("Timers.Stopwatch.Start"),
        pause: i18nKey("Timers.Stopwatch.Pause"),
        stopReset: i18nKey("Timers.Stopwatch.StopReset"),
        post: i18nKey("Timers.Stopwatch.PostToChat"),
        clear: i18nKey("Timers.Stopwatch.ClearEvents"),
        noEvents: i18nKey("Timers.Stopwatch.NoEvents"),
        macroHint: i18nKey("Hints.ClickOrDragHotbarMacro")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
    this.startTicking();
    this.refreshTime();
  }

  async _onClose(options) {
    this.stopTicking();
    this.stopwatchTool.forgetWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-stopwatch-action='start-pause']")?.addEventListener("click", () => this.stopwatchTool.startPause());
    this.element.querySelector("[data-stopwatch-action='stop-reset']")?.addEventListener("click", () => this.stopwatchTool.stopReset());
    this.element.querySelector("[data-stopwatch-action='post']")?.addEventListener("click", () => void this.stopwatchTool.postEventsToChat());
    this.element.querySelector("[data-stopwatch-action='clear']")?.addEventListener("click", () => this.stopwatchTool.clearEvents());

    for (const button of this.element.querySelectorAll("[data-stopwatch-event]")) {
      button.addEventListener("click", () => this.stopwatchTool.recordEvent(button.dataset.stopwatchEvent));
      button.addEventListener("keydown", (event) => {
        if ((event.key !== "Enter") && (event.key !== " ")) return;
        event.preventDefault();
        this.stopwatchTool.recordEvent(button.dataset.stopwatchEvent);
      });
      button.addEventListener("dragstart", (event) => this.stopwatchTool.onEventDragStart(event));
    }
  }

  startTicking() {
    this.stopTicking();
    this.tickHandle = window.setInterval(() => this.refreshTime(), STOPWATCH_TICK_MS);
  }

  stopTicking() {
    if (!this.tickHandle) return;
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  onStopwatchStateChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }

  onStopwatchEventsChanged() {
    if (this.rendered) void this.render({ parts: ["main"] }).then(() => this.scrollEventsToBottom());
  }

  refreshTime() {
    if (!this.rendered) return;
    const parts = this.prepareElapsedParts();
    const main = this.element.querySelector("[data-stopwatch-time-main]");
    const fraction = this.element.querySelector("[data-stopwatch-time-fraction]");
    if (main) main.textContent = parts.main;
    if (fraction) fraction.textContent = parts.fraction;
  }

  scrollEventsToBottom() {
    const list = this.element.querySelector(".dmicher-stopwatch-events");
    if (list) list.scrollTop = list.scrollHeight;
  }

  prepareElapsedParts() {
    return splitStopwatchElapsed(this.stopwatchTool.getElapsed());
  }
}
