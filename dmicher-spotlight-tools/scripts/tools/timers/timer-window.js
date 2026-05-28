import { MODULE_ID } from "../../config.js";
import {
  TIMER_DISPLAY_STYLE,
  getRemainingMilliseconds,
  isTimerExpired
} from "./timer-utils.js";
import {
  formatClockTime,
  formatDigitalDuration,
  i18nKey,
  isModerator,
  localize
} from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TimerWindowApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dmicher-timer-window"],
    position: {
      width: 380,
      height: "auto"
    },
    window: {
      frame: true,
      icon: "fa-solid fa-hourglass-half",
      title: "DMICHERSPOTLIGHTTOOLS.Timers.Window.Title",
      positioned: true,
      resizable: false
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/timers/timer-window.hbs`
    }
  };

  constructor(timerTool, timerId, options = {}) {
    const timer = timerTool.getTimer(timerId);
    const displayStyle = options.displayStyle ?? timer?.style ?? TIMER_DISPLAY_STYLE.prominent;
    const compact = displayStyle === TIMER_DISPLAY_STYLE.compact;
    const width = compact ? 360 : 380;
    const { displayStyle: _displayStyle, position, ...applicationOptions } = options;
    super({
      ...applicationOptions,
      id: `dmicher-spotlight-tools-timer-${timerId}`,
      position: {
        ...TimerWindowApplication.getInitialPosition(width),
        width,
        height: "auto",
        ...(position ?? {})
      }
    });
    this.timerTool = timerTool;
    this.timerId = timerId;
    this.displayStyle = displayStyle;
    this.lastExpired = false;
  }

  static getInitialPosition(width) {
    const viewportWidth = Math.max(document.documentElement?.clientWidth ?? 0, window.innerWidth ?? 0);
    const left = Math.max(72, Math.round((viewportWidth - width) / 2));
    return {
      left,
      top: 140
    };
  }

  get title() {
    return this.timerTool.getTimer(this.timerId)?.name ?? localize("Timers.Window.Title");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const timer = this.timerTool.getTimer(this.timerId);
    if (!timer) {
      return {
        ...context,
        missing: true,
        keys: {
          missing: i18nKey("Timers.Window.Missing"),
          close: i18nKey("Timers.Window.Close")
        }
      };
    }

    const expired = isTimerExpired(timer);
    const displayStyle = expired ? TIMER_DISPLAY_STYLE.prominent : this.displayStyle;
    const prominent = displayStyle === TIMER_DISPLAY_STYLE.prominent;

    return {
      ...context,
      timer,
      expired,
      displayStyle,
      prominent,
      compact: !prominent,
      canDelete: isModerator(),
      remainingText: formatDigitalDuration(getRemainingMilliseconds(timer)),
      deadlineText: formatClockTime(timer.endsAt),
      keys: {
        expired: i18nKey("Timers.Window.Expired"),
        deadline: i18nKey("Timers.Window.Deadline"),
        compact: i18nKey("Timers.Window.Compact"),
        prominent: i18nKey("Timers.Window.Prominent"),
        close: i18nKey("Timers.Window.Close"),
        delete: i18nKey("Timers.Window.Delete")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.applyStyleClass();
    this.activateActions();
    this.activateDrag();
    this.activateDoubleClickToggle();
    this.refreshTime();
  }

  async _onClose(options) {
    await super._onClose(options);
    this.timerTool.forgetTimerWindow(this.timerId, this);
  }

  setDisplayStyle(style, forceRender = false) {
    const normalized = style === TIMER_DISPLAY_STYLE.compact ? TIMER_DISPLAY_STYLE.compact : TIMER_DISPLAY_STYLE.prominent;
    if (this.displayStyle === normalized && !forceRender) return;
    this.displayStyle = normalized;
    if (this.rendered) void this.render({ force: true });
  }

  onTimerStateChanged() {
    const timer = this.timerTool.getTimer(this.timerId);
    if (!timer) {
      if (this.rendered) void this.close();
      return;
    }
    if (this.rendered) void this.render({ force: true });
  }

  onTimerTick() {
    this.refreshTime();
  }

  refreshTime() {
    if (!this.rendered) return;
    const timer = this.timerTool.getTimer(this.timerId);
    if (!timer) return;

    const expired = isTimerExpired(timer);
    if (expired && this.displayStyle !== TIMER_DISPLAY_STYLE.prominent) {
      this.displayStyle = TIMER_DISPLAY_STYLE.prominent;
      void this.render({ force: true });
      return;
    }

    if (expired !== this.lastExpired) {
      this.lastExpired = expired;
      void this.render({ force: true });
      return;
    }

    for (const element of this.element.querySelectorAll("[data-timer-remaining]")) {
      element.textContent = formatDigitalDuration(getRemainingMilliseconds(timer));
    }
  }

  applyStyleClass() {
    const timer = this.timerTool.getTimer(this.timerId);
    const expired = timer ? isTimerExpired(timer) : false;
    const compact = !expired && this.displayStyle === TIMER_DISPLAY_STYLE.compact;
    this.element.classList.toggle("is-prominent", !compact);
    this.element.classList.toggle("is-compact", compact);
    this.setPosition(compact
      ? { width: 360, height: "auto" }
      : { width: 380, height: "auto" });
    this.ensureFloatingPosition();
  }

  ensureFloatingPosition() {
    const rect = this.element.getBoundingClientRect();
    const left = Number(this.position.left ?? rect.left);
    const top = Number(this.position.top ?? rect.top);
    if (Number.isFinite(left) && Number.isFinite(top) && (rect.left || rect.top)) return;

    const width = this.displayStyle === TIMER_DISPLAY_STYLE.compact ? 360 : 380;
    this.setPosition({
      ...TimerWindowApplication.getInitialPosition(width),
      width,
      height: "auto"
    });
  }

  activateActions() {
    for (const button of this.element.querySelectorAll("[data-timer-action]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const action = button.dataset.timerAction;
        if (action === "compact") this.setDisplayStyle(TIMER_DISPLAY_STYLE.compact);
        else if (action === "prominent") this.setDisplayStyle(TIMER_DISPLAY_STYLE.prominent);
        else if (action === "close") void this.close();
        else if (action === "delete") void this.timerTool.confirmDeleteTimer(this.timerId);
      });
    }
  }

  activateDrag() {
    for (const handle of this.element.querySelectorAll("[data-timer-drag]")) {
      handle.addEventListener("pointerdown", (event) => this.startDrag(event));
    }
  }

  activateDoubleClickToggle() {
    for (const card of this.element.querySelectorAll("[data-timer-drag]")) {
      card.addEventListener("dblclick", (event) => {
        if (event.target.closest("button, input, select, textarea, a")) return;
        const timer = this.timerTool.getTimer(this.timerId);
        if (!timer || isTimerExpired(timer)) return;
        event.preventDefault();
        const nextStyle = this.displayStyle === TIMER_DISPLAY_STYLE.compact
          ? TIMER_DISPLAY_STYLE.prominent
          : TIMER_DISPLAY_STYLE.compact;
        this.setDisplayStyle(nextStyle);
      });
    }
  }

  startDrag(event) {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, a")) return;
    event.preventDefault();

    const rect = this.element.getBoundingClientRect();
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: Number(this.position.left ?? rect.left),
      top: Number(this.position.top ?? rect.top)
    };

    const onMove = (moveEvent) => {
      const left = Math.max(0, start.left + moveEvent.clientX - start.pointerX);
      const top = Math.max(0, start.top + moveEvent.clientY - start.pointerY);
      this.setPosition({ left, top });
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
  }
}
