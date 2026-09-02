import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { format, i18nKey, localize, runAfterApplicationLifecycle } from "../../utils.js";
import {
  TIMER_MODE,
  calculateRoundedDeadline,
  formatHourMinuteInput,
  parseHourMinuteDeadline,
  parseHourMinuteDuration
} from "./timer-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const BREAK_OPTIONS = Object.freeze([5, 10, 15, 20, 30]);
const DEFAULT_BREAK_MINUTES = 15;
const BREAK_REFRESH_MS = 5000;
const BREAK_CHOICE = Object.freeze({
  deadline: "deadline",
  duration: "duration"
});
const DEFAULT_BREAK_DURATION_INPUT = "00:15";

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
    const now = Date.now();
    this.selectedChoice = String(DEFAULT_BREAK_MINUTES);
    this.deadlineInputValue = formatHourMinuteInput(calculateRoundedDeadline(DEFAULT_BREAK_MINUTES, now));
    this.durationInputValue = DEFAULT_BREAK_DURATION_INPUT;
    this.deadlineTimestamp = this.calculateDeadline(now);
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
        checked: String(minutes) === this.selectedChoice,
        label: format("Timers.Break.Option", { count: minutes })
      })),
      deadlineChoice: {
        checked: this.selectedChoice === BREAK_CHOICE.deadline,
        value: this.deadlineInputValue
      },
      durationChoice: {
        checked: this.selectedChoice === BREAK_CHOICE.duration,
        value: this.durationInputValue
      },
      deadlineText: this.getDeadlineText(),
      keys: {
        heading: i18nKey("Timers.Break.Heading"),
        description: i18nKey("Timers.Break.Description"),
        deadlineChoice: i18nKey("Timers.Break.DeadlineChoice"),
        durationChoice: i18nKey("Timers.Break.DurationChoice"),
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
    for (const radio of this.element.querySelectorAll("input[name='breakChoice']")) {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        this.selectedChoice = radio.value;
        this.syncCustomInputAvailability();
        this.refreshDeadline();
      });
    }

    for (const input of this.element.querySelectorAll("[data-break-time-input]")) {
      input.addEventListener("input", () => {
        this.storeCustomInput(input);
        if (this.selectedChoice === input.dataset.breakTimeInput) this.refreshDeadline();
      });
    }

    this.syncCustomInputAvailability();

    this.element.querySelector("[data-break-action='cancel']")?.addEventListener("click", () => void this.close());
    this.element.querySelector("[data-break-action='announce']")?.addEventListener("click", () => void this.announceBreak());
  }

  storeCustomInput(input) {
    if (input.dataset.breakTimeInput === BREAK_CHOICE.deadline) this.deadlineInputValue = input.value;
    if (input.dataset.breakTimeInput === BREAK_CHOICE.duration) this.durationInputValue = input.value;
  }

  syncCustomInputAvailability() {
    for (const input of this.element.querySelectorAll("[data-break-time-input]")) {
      input.disabled = input.dataset.breakTimeInput !== this.selectedChoice;
    }
  }

  readFormState() {
    const checkedChoice = this.element.querySelector("input[name='breakChoice']:checked");
    if (checkedChoice) this.selectedChoice = checkedChoice.value;
    for (const input of this.element.querySelectorAll("[data-break-time-input]")) this.storeCustomInput(input);
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

  refreshDeadline(now = Date.now()) {
    this.deadlineTimestamp = this.calculateDeadline(now);
    this.renderDeadline();
  }

  renderDeadline() {
    const output = this.element.querySelector("[data-break-deadline]");
    if (output) output.textContent = this.getDeadlineText();
  }

  calculateDeadline(now = Date.now()) {
    if (this.selectedChoice === BREAK_CHOICE.deadline) {
      return parseHourMinuteDeadline(this.deadlineInputValue, now);
    }
    if (this.selectedChoice === BREAK_CHOICE.duration) {
      const duration = parseHourMinuteDuration(this.durationInputValue);
      return duration ? Number(now) + duration : null;
    }

    const minutes = Number(this.selectedChoice);
    return BREAK_OPTIONS.includes(minutes)
      ? calculateRoundedDeadline(minutes, now)
      : null;
  }

  getDeadlineText() {
    if (!Number.isFinite(this.deadlineTimestamp)) {
      return localize(this.selectedChoice === BREAK_CHOICE.duration
        ? "Timers.Break.BadDuration"
        : "Timers.Break.BadDeadline");
    }
    return format("Timers.Break.Until", {
      time: formatHourMinuteInput(this.deadlineTimestamp)
    });
  }

  getLaunchDescriptor(now = Date.now()) {
    if (this.selectedChoice === BREAK_CHOICE.deadline) {
      const deadlineTimestamp = parseHourMinuteDeadline(this.deadlineInputValue, now);
      if (!Number.isFinite(deadlineTimestamp)) throw new Error(localize("Timers.Break.BadDeadline"));
      return {
        mode: TIMER_MODE.deadline,
        deadlineTimestamp
      };
    }

    if (this.selectedChoice === BREAK_CHOICE.duration) {
      const durationMilliseconds = parseHourMinuteDuration(this.durationInputValue);
      if (!Number.isFinite(durationMilliseconds)) throw new Error(localize("Timers.Break.BadDuration"));
      return {
        mode: TIMER_MODE.duration,
        durationMilliseconds
      };
    }

    const roundedDurationMinutes = Number(this.selectedChoice);
    if (!BREAK_OPTIONS.includes(roundedDurationMinutes)) throw new Error(localize("Timers.Break.BadDuration"));
    return {
      mode: TIMER_MODE.deadline,
      roundedDurationMinutes
    };
  }

  async announceBreak() {
    const announceButton = this.element.querySelector("[data-break-action='announce']");
    if (announceButton) announceButton.disabled = true;

    try {
      this.readFormState();
      const descriptor = this.getLaunchDescriptor();
      await this.timerTool.startBreakTimer(descriptor, {
        onDeadlineCalculated: (deadlineTimestamp) => {
          this.deadlineTimestamp = deadlineTimestamp;
          this.renderDeadline();
        }
      });
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to announce break`, error);
      ui.notifications.error(error?.message || localize("Timers.Break.Error"));
      if (announceButton) announceButton.disabled = false;
    }
  }
}
