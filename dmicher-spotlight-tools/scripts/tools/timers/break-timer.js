import { MODULE_ID } from "../../config.js";
import { format, i18nKey, localize } from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const BREAK_OPTIONS = Object.freeze([5, 10, 15, 20, 30]);
const DEFAULT_BREAK_MINUTES = 15;
const BREAK_REFRESH_MS = 5000;
const BREAK_ROUNDING_MINUTES = 5;

export class BreakTimerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-break-timer",
    classes: ["dmicher-break-timer"],
    position: {
      width: 550,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-mug-saucer",
      title: "DMICHERSPOTLIGHTTOOLS.Timers.Break.WindowTitle",
      resizable: false
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/timers/break-timer.hbs`
    }
  };

  constructor(timerTool, options = {}) {
    super(options);
    this.timerTool = timerTool;
    this.selectedMinutes = DEFAULT_BREAK_MINUTES;
    this.deadlineTimestamp = this.calculateDeadline();
    this.refreshHandle = null;
  }

  get title() {
    return localize("Timers.Break.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.deadlineTimestamp = this.calculateDeadline();
    return {
      ...context,
      options: BREAK_OPTIONS.map((minutes) => ({
        minutes,
        checked: minutes === this.selectedMinutes,
        label: format("Timers.Break.Option", { count: minutes })
      })),
      deadlineText: this.getDeadlineText(),
      keys: {
        heading: i18nKey("Timers.Break.Heading"),
        description: i18nKey("Timers.Break.Description"),
        until: i18nKey("Timers.Break.Until"),
        cancel: i18nKey("Timers.Break.Cancel"),
        announce: i18nKey("Timers.Break.Announce")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
    this.startRefreshing();
    this.refreshDeadline();
  }

  async _onClose(options) {
    this.stopRefreshing();
    this.timerTool.forgetBreakWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    for (const radio of this.element.querySelectorAll("input[name='breakMinutes']")) {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        this.selectedMinutes = Number(radio.value) || DEFAULT_BREAK_MINUTES;
        this.refreshDeadline();
      });
    }

    this.element.querySelector("[data-break-action='cancel']")?.addEventListener("click", () => void this.close());
    this.element.querySelector("[data-break-action='announce']")?.addEventListener("click", () => void this.announceBreak());
  }

  startRefreshing() {
    this.stopRefreshing();
    this.refreshHandle = window.setInterval(() => this.refreshDeadline(), BREAK_REFRESH_MS);
  }

  stopRefreshing() {
    if (!this.refreshHandle) return;
    window.clearInterval(this.refreshHandle);
    this.refreshHandle = null;
  }

  refreshDeadline() {
    this.deadlineTimestamp = this.calculateDeadline();
    const output = this.element.querySelector("[data-break-deadline]");
    if (output) output.textContent = this.getDeadlineText();
  }

  calculateDeadline(now = Date.now()) {
    const target = new Date(Number(now) + (this.selectedMinutes * 60 * 1000));
    if (target.getSeconds() || target.getMilliseconds()) target.setMinutes(target.getMinutes() + 1, 0, 0);
    else target.setSeconds(0, 0);

    const minute = target.getMinutes();
    const roundedMinute = Math.ceil(minute / BREAK_ROUNDING_MINUTES) * BREAK_ROUNDING_MINUTES;
    if (roundedMinute >= 60) {
      target.setHours(target.getHours() + 1, 0, 0, 0);
    } else {
      target.setMinutes(roundedMinute, 0, 0);
    }
    return target.getTime();
  }

  getDeadlineText() {
    return format("Timers.Break.Until", {
      time: this.formatHourMinute(this.deadlineTimestamp)
    });
  }

  formatHourMinute(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return [date.getHours(), date.getMinutes()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  async announceBreak() {
    const announceButton = this.element.querySelector("[data-break-action='announce']");
    if (announceButton) announceButton.disabled = true;

    try {
      this.refreshDeadline();
      await this.timerTool.startBreakTimer(this.deadlineTimestamp);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to announce break`, error);
      ui.notifications.error(localize("Timers.Break.Error"));
      if (announceButton) announceButton.disabled = false;
    }
  }
}
