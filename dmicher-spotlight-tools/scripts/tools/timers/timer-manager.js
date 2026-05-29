import { MODULE_ID, TIMER_SOUND_SOURCES } from "../../config.js";
import {
  TIMER_MODE,
  TIMER_SOUND,
  buildTimerDefaults
} from "./timer-utils.js";
import {
  formatClockTime,
  formatDigitalDuration,
  i18nKey,
  isModerator,
  localize,
  playAudio
} from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TimerManagerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-timer-manager",
    classes: ["dmicher-timer-manager"],
    position: {
      width: 900,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-hourglass-half",
      title: "DMICHERSPOTLIGHTTOOLS.Timers.Manager.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/timers/timer-manager.hbs`
    }
  };

  constructor(timerTool, options = {}) {
    super(options);
    this.timerTool = timerTool;
    this.defaultDeadlineBase = Date.now();
  }

  get title() {
    return localize("Timers.Manager.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const timers = this.timerTool.getVisibleTimers().map((timer) => this.prepareTimerRow(timer));
    const defaults = buildTimerDefaults(this.timerTool.getTimerCount(), this.defaultDeadlineBase);

    return {
      ...context,
      canManage: isModerator(),
      defaultName: defaults.name,
      durationDefault: defaults.durationTime,
      deadlineDefault: defaults.deadlineTime,
      hasTimers: timers.length > 0,
      timers,
      labels: {
        modeDuration: localize("Timers.Mode.Duration"),
        modeDeadline: localize("Timers.Mode.Deadline"),
        visibilityPublic: localize("Timers.Visibility.Public"),
        visibilityPrivate: localize("Timers.Visibility.Private"),
        styleProminent: localize("Timers.Style.Prominent"),
        styleCompact: localize("Timers.Style.Compact"),
        soundNone: localize("Timers.Sound.None"),
        soundSignal1: localize("Timers.Sound.Signal1"),
        soundSignal2: localize("Timers.Sound.Signal2"),
        soundSignal3: localize("Timers.Sound.Signal3")
      },
      keys: {
        createTitle: i18nKey("Timers.Manager.CreateTitle"),
        title: i18nKey("Timers.Manager.Name"),
        mode: i18nKey("Timers.Manager.Mode"),
        time: i18nKey("Timers.Manager.Time"),
        visibility: i18nKey("Timers.Manager.Visibility"),
        style: i18nKey("Timers.Manager.Style"),
        sound: i18nKey("Timers.Manager.Sound"),
        reset: i18nKey("Timers.Manager.Reset"),
        deleteExpired: i18nKey("Timers.Manager.DeleteExpired"),
        previewSound: i18nKey("Timers.Manager.PreviewSound"),
        start: i18nKey("Timers.Manager.Start"),
        tableTitle: i18nKey("Timers.Manager.TableTitle"),
        empty: i18nKey("Timers.Manager.Empty"),
        columnName: i18nKey("Timers.Manager.Columns.Name"),
        columnStartedBy: i18nKey("Timers.Manager.Columns.StartedBy"),
        columnStartedAt: i18nKey("Timers.Manager.Columns.StartedAt"),
        columnDeadline: i18nKey("Timers.Manager.Columns.Deadline"),
        columnRemaining: i18nKey("Timers.Manager.Columns.Remaining"),
        columnControls: i18nKey("Timers.Manager.Columns.Controls"),
        open: i18nKey("Timers.Manager.Open"),
        delete: i18nKey("Timers.Manager.Delete")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateForm();
    this.activateTable();
    this.refreshTimes();
  }

  prepareTimerRow(timer) {
    return {
      id: timer.id,
      name: timer.name,
      startedByText: timer.createdByName || localize("Timers.Manager.UnknownUser"),
      startedAtText: formatClockTime(timer.createdAt),
      deadlineText: formatClockTime(timer.endsAt),
      remainingText: formatDigitalDuration(timer.endsAt - Date.now()),
      expired: timer.endsAt <= Date.now()
    };
  }

  activateForm() {
    const form = this.element.querySelector("[data-timer-create-form]");
    if (!form) return;

    form.addEventListener("submit", (event) => void this.handleSubmit(event));
    form.querySelector("[data-timer-action='reset']")?.addEventListener("click", () => {
      this.defaultDeadlineBase = Date.now();
      void this.render({ parts: ["main"] });
    });
    form.querySelector("[data-timer-action='delete-expired']")?.addEventListener("click", () => {
      void this.timerTool.confirmDeleteExpiredTimers();
    });
    form.querySelector("[data-timer-action='preview-sound']")?.addEventListener("click", () => void this.previewSound(form));

    const timeInput = form.querySelector("[data-timer-time-input]");
    for (const radio of form.querySelectorAll("input[name='mode']")) {
      radio.addEventListener("change", () => {
        if (!radio.checked || !timeInput) return;
        const nextDefault = radio.value === TIMER_MODE.deadline ? form.dataset.deadlineDefault : form.dataset.durationDefault;
        timeInput.value = nextDefault;
      });
    }
  }

  activateTable() {
    for (const row of this.element.querySelectorAll("[data-timer-row]")) {
      row.addEventListener("dblclick", () => this.timerTool.openTimerWindow(row.dataset.timerId, { force: true }));
    }

    for (const button of this.element.querySelectorAll("[data-timer-action='open']")) {
      button.addEventListener("click", () => this.timerTool.openTimerWindow(button.dataset.timerId, { force: true }));
    }

    for (const button of this.element.querySelectorAll("[data-timer-action='delete']")) {
      button.addEventListener("click", () => void this.timerTool.confirmDeleteTimer(button.dataset.timerId));
    }
  }

  async previewSound(form) {
    const sound = form.elements.namedItem("sound")?.value ?? TIMER_SOUND.none;
    const src = TIMER_SOUND_SOURCES[sound];
    if (!src) {
      ui.notifications.warn(localize("Timers.Manager.NoSoundSelected"));
      return;
    }

    try {
      await playAudio(src);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to preview timer sound`, error);
      ui.notifications.error(localize("Timers.Errors.SoundPreviewFailed"));
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const elements = form.elements;
      await this.timerTool.startTimer({
        name: elements.namedItem("name")?.value,
        mode: elements.namedItem("mode")?.value,
        time: elements.namedItem("time")?.value,
        visibility: elements.namedItem("visibility")?.value,
        style: elements.namedItem("style")?.value,
        sound: elements.namedItem("sound")?.value ?? TIMER_SOUND.none
      });
      this.defaultDeadlineBase = Date.now();
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to start timer`, error);
      ui.notifications.error(error?.message || localize("Timers.Errors.StartFailed"));
      if (submitButton) submitButton.disabled = false;
    }
  }

  onTimerStateChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }

  onTimerTick() {
    this.refreshTimes();
  }

  refreshTimes() {
    if (!this.rendered) return;

    for (const timer of this.timerTool.getVisibleTimers()) {
      const cell = this.element.querySelector(`[data-timer-remaining="${timer.id}"]`);
      if (cell) {
        cell.textContent = formatDigitalDuration(timer.endsAt - Date.now());
        cell.classList.toggle("is-expired", timer.endsAt <= Date.now());
      }

      const row = this.element.querySelector(`[data-timer-row][data-timer-id="${timer.id}"]`);
      if (row) row.classList.toggle("is-expired", timer.endsAt <= Date.now());
    }
  }
}
