import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { format, i18nKey, localize, runAfterApplicationLifecycle } from "../../utils.js";
import { calculateRoundedDeadline } from "./timer-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const BREAK_OPTIONS = Object.freeze([5, 10, 15, 20, 30]);
const DEFAULT_BREAK_MINUTES = 15;
const BREAK_REFRESH_MS = 5000;

export class BreakTimerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-break-timer",
    classes: getThemedWindowClasses("dmicher-break-timer"),
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
        cancel: i18nKey("Timers.Break.Cancel"),
        announce: i18nKey("Timers.Break.Announce")
      }
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender(context, options), () => {
      this.activateListeners();
      this.startRefreshing();
      this.refreshDeadline();
    });
  }

  _onClose(options) {
    this.stopRefreshing();
    this.timerTool.forgetBreakWindow(this);
    return super._onClose(options);
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
    this.renderDeadline();
  }

  renderDeadline() {
    const output = this.element.querySelector("[data-break-deadline]");
    if (output) output.textContent = this.getDeadlineText();
  }

  calculateDeadline(now = Date.now()) {
    return calculateRoundedDeadline(this.selectedMinutes, now);
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
      await this.timerTool.startBreakTimer(this.selectedMinutes, {
        onDeadlineCalculated: (deadlineTimestamp) => {
          this.deadlineTimestamp = deadlineTimestamp;
          this.renderDeadline();
        }
      });
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to announce break`, error);
      ui.notifications.error(localize("Timers.Break.Error"));
      if (announceButton) announceButton.disabled = false;
    }
  }
}
