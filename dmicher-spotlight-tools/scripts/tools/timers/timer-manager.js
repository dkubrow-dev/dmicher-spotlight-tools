import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import {
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  buildTimerDefaults
} from "./timer-utils.js";
import {
  formatClockTime,
  formatDigitalDuration,
  format,
  i18nKey,
  isModerator,
  localize,
  runAfterApplicationLifecycle
} from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TimerManagerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-timer-manager",
    classes: getThemedWindowClasses("dmicher-timer-manager"),
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
    this.editingTemplateId = "";
    this.formDraft = null;
  }

  get title() {
    return localize("Timers.Manager.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const timers = this.timerTool.getVisibleTimers().map((timer) => this.prepareTimerRow(timer));
    const templates = this.timerTool.getTimerTemplates().map((template) => this.prepareTemplateRow(template));
    const defaults = buildTimerDefaults(this.timerTool.getTimerCount(), this.defaultDeadlineBase);
    const editingTemplate = this.getEditingTemplate();
    const form = this.prepareFormState(editingTemplate, defaults);

    return {
      ...context,
      canManage: isModerator(),
      durationDefault: defaults.durationTime,
      deadlineDefault: defaults.deadlineTime,
      form,
      hasTimers: timers.length > 0,
      hasTemplates: templates.length > 0,
      templates,
      timers,
      labels: {
        modeDuration: localize("Timers.Mode.Duration"),
        modeDeadline: localize("Timers.Mode.Deadline"),
        visibilityPublic: localize("Timers.Visibility.Public"),
        visibilityPrivate: localize("Timers.Visibility.Private"),
        styleProminent: localize("Timers.Style.Prominent"),
        styleCompact: localize("Timers.Style.Compact")
      },
      soundChoices: this.prepareSoundChoices(form.sound, form.builtIn),
      keys: {
        title: i18nKey("Timers.Manager.Name"),
        mode: i18nKey("Timers.Manager.Mode"),
        time: i18nKey("Timers.Manager.Time"),
        visibility: i18nKey("Timers.Manager.Visibility"),
        style: i18nKey("Timers.Manager.Style"),
        sound: i18nKey("Timers.Manager.Sound"),
        volume: i18nKey("Timers.Manager.Volume"),
        reset: i18nKey("Timers.Manager.Reset"),
        deleteExpired: i18nKey("Timers.Manager.DeleteExpired"),
        previewSound: i18nKey("Timers.Manager.PreviewSound"),
        saveTemplate: i18nKey("Timers.Manager.SaveTemplate"),
        start: i18nKey("Timers.Manager.Start"),
        templateEmpty: i18nKey("Timers.Manager.TemplateEmpty"),
        templateColumnName: i18nKey("Timers.Manager.TemplateColumns.Name"),
        templateColumnMode: i18nKey("Timers.Manager.TemplateColumns.Mode"),
        templateColumnTime: i18nKey("Timers.Manager.TemplateColumns.Time"),
        templateColumnVisibility: i18nKey("Timers.Manager.TemplateColumns.Visibility"),
        templateColumnControls: i18nKey("Timers.Manager.Columns.Controls"),
        templateStart: i18nKey("Timers.Manager.TemplateStart"),
        templateEdit: i18nKey("Timers.Manager.TemplateEdit"),
        templateDelete: i18nKey("Timers.Manager.TemplateDelete"),
        tableTitle: i18nKey("Timers.Manager.TableTitle"),
        empty: i18nKey("Timers.Manager.Empty"),
        columnTemplate: i18nKey("Timers.Manager.Columns.Template"),
        columnName: i18nKey("Timers.Manager.Columns.Name"),
        columnStartedBy: i18nKey("Timers.Manager.Columns.StartedBy"),
        columnStartedAt: i18nKey("Timers.Manager.Columns.StartedAt"),
        columnDeadline: i18nKey("Timers.Manager.Columns.Deadline"),
        columnRemaining: i18nKey("Timers.Manager.Columns.Remaining"),
        columnControls: i18nKey("Timers.Manager.Columns.Controls"),
        open: i18nKey("Timers.Manager.Open"),
        repeat: i18nKey("Timers.Manager.Repeat"),
        saveCurrentTemplate: i18nKey("Timers.Manager.SaveCurrentTemplate"),
        delete: i18nKey("Timers.Manager.Delete")
      }
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender(context, options), () => {
      this.activateForm();
      this.activateTable();
      this.refreshTimes();
    });
  }

  getEditingTemplate() {
    if (!this.editingTemplateId) return null;
    const template = this.timerTool.getTimerTemplate(this.editingTemplateId);
    if (template) return template;
    this.editingTemplateId = "";
    this.formDraft = null;
    return null;
  }

  prepareFormState(template, defaults) {
    const templateId = String(template?.id ?? "");
    const builtIn = template?.builtIn === true || template?.kind === TIMER_KIND.break;
    const draft = this.formDraft?.templateId === templateId ? this.formDraft : null;
    const source = draft ?? {
      templateId,
      builtIn,
      name: builtIn ? localize("Timers.Break.TimerName") : (template?.name ?? defaults.name),
      mode: template?.mode ?? TIMER_MODE.duration,
      time: template?.time ?? defaults.durationTime,
      visibility: template?.visibility ?? "public",
      style: template?.style ?? "prominent",
      sound: template?.sound ?? TIMER_SOUND.none,
      volume: Number(template?.volume ?? 1)
    };
    const mode = source.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
    const visibility = source.visibility === "private" ? "private" : "public";
    const style = source.style === "compact" ? "compact" : "prominent";

    return {
      ...source,
      templateId,
      builtIn,
      titleText: templateId
        ? format("Timers.Manager.EditTitle", {
          name: builtIn ? localize("Timers.Break.TimerName") : template.name
        })
        : localize("Timers.Manager.CreateTitle"),
      mode,
      visibility,
      style,
      durationChecked: mode === TIMER_MODE.duration,
      deadlineChecked: mode === TIMER_MODE.deadline,
      publicChecked: visibility === "public",
      privateChecked: visibility === "private",
      prominentChecked: style === "prominent",
      compactChecked: style === "compact",
      volumePercent: Math.round(Math.min(1, Math.max(0, Number(source.volume) || 0)) * 100)
    };
  }

  prepareSoundChoices(selectedSound, builtIn) {
    const choices = [
      { value: TIMER_SOUND.none, label: localize("Timers.Sound.None") }
    ];
    if (!builtIn && (this.timerTool.getSoundSource(TIMER_SOUND.custom) || selectedSound === TIMER_SOUND.custom)) {
      choices.push({ value: TIMER_SOUND.custom, label: localize("Timers.Sound.Custom") });
    }
    if (builtIn && (
      this.timerTool.getSoundSource(TIMER_SOUND.breakCustom)
      || selectedSound === TIMER_SOUND.breakCustom
    )) {
      choices.push({ value: TIMER_SOUND.breakCustom, label: localize("Timers.Sound.BreakCustom") });
    }
    choices.push(
      { value: TIMER_SOUND.signal1, label: localize("Timers.Sound.Signal1") },
      { value: TIMER_SOUND.signal2, label: localize("Timers.Sound.Signal2") },
      { value: TIMER_SOUND.signal3, label: localize("Timers.Sound.Signal3") }
    );
    return choices.map((choice) => ({
      ...choice,
      selected: choice.value === selectedSound
    }));
  }

  prepareTemplateRow(template) {
    const builtIn = template.builtIn === true || template.kind === TIMER_KIND.break;
    return {
      id: template.id,
      builtIn,
      name: builtIn ? localize("Timers.Break.TimerName") : template.name,
      modeText: builtIn
        ? localize("Timers.Manager.TemplateConfiguredAtLaunch")
        : localize(template.mode === TIMER_MODE.deadline ? "Timers.Mode.Deadline" : "Timers.Mode.Duration"),
      timeText: builtIn ? localize("Timers.Manager.TemplateConfiguredAtLaunch") : template.time,
      visibilityText: localize(
        template.visibility === "private" ? "Timers.Visibility.Private" : "Timers.Visibility.Public"
      )
    };
  }

  prepareTimerRow(timer) {
    const fromTemplate = Boolean(timer.templateId);
    return {
      id: timer.id,
      name: timer.name,
      fromTemplate,
      canSaveTemplate: !fromTemplate,
      templateMarkerTitle: localize(fromTemplate
        ? "Timers.Manager.TemplateInstance"
        : "Timers.Manager.OneOffInstance"),
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
    form.querySelector("[data-timer-action='reset']")?.addEventListener("click", () => this.resetForm());
    form.querySelector("[data-timer-action='delete-expired']")?.addEventListener("click", () => {
      void this.timerTool.confirmDeleteExpiredTimers();
    });
    form.querySelector("[data-timer-action='preview-sound']")?.addEventListener("click", () => void this.previewSound(form));
    form.querySelector("[data-timer-action='save-template']")?.addEventListener("click", () => {
      void this.handleSaveTemplate(form);
    });
    const volumeSlider = form.elements.namedItem("volume");
    const volumeOutput = form.querySelector("[data-timer-volume-output]");
    volumeSlider?.addEventListener("input", () => {
      if (volumeOutput) volumeOutput.textContent = `${volumeSlider.value}%`;
    });

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

    for (const button of this.element.querySelectorAll("[data-timer-action='repeat']")) {
      button.addEventListener("click", () => void this.handleRepeat(button));
    }

    for (const button of this.element.querySelectorAll("[data-timer-action='save-current-template']")) {
      button.addEventListener("click", () => void this.handleSaveCurrentTemplate(button));
    }

    for (const button of this.element.querySelectorAll("[data-timer-action='delete']")) {
      button.addEventListener("click", () => void this.timerTool.confirmDeleteTimer(button.dataset.timerId));
    }

    for (const button of this.element.querySelectorAll("[data-timer-template-action='start']")) {
      button.addEventListener("click", () => void this.handleStartTemplate(button));
    }

    for (const button of this.element.querySelectorAll("[data-timer-template-action='edit']")) {
      button.addEventListener("click", () => this.editTemplate(button.dataset.templateId));
    }

    for (const button of this.element.querySelectorAll("[data-timer-template-action='delete']")) {
      button.addEventListener("click", () => {
        void this.timerTool.confirmDeleteTimerTemplate(button.dataset.templateId);
      });
    }
  }

  async handleRepeat(button) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    button.disabled = true;
    try {
      await this.timerTool.confirmRepeatTimer(button.dataset.timerId);
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to repeat timer`, error);
      ui.notifications.error(error?.message || localize("Timers.Errors.StartFailed"));
    } finally {
      button.disabled = false;
    }
  }

  collectFormInput(form) {
    const elements = form.elements;
    return {
      name: elements.namedItem("name")?.value,
      mode: elements.namedItem("mode")?.value,
      time: elements.namedItem("time")?.value,
      visibility: elements.namedItem("visibility")?.value,
      style: elements.namedItem("style")?.value,
      sound: elements.namedItem("sound")?.value ?? TIMER_SOUND.none,
      volume: Number(elements.namedItem("volume")?.value ?? 100) / 100
    };
  }

  captureFormDraft() {
    if (!this.rendered) return;
    const form = this.element.querySelector("[data-timer-create-form]");
    if (!form) return;
    const template = this.getEditingTemplate();
    this.formDraft = {
      ...this.collectFormInput(form),
      templateId: this.editingTemplateId,
      builtIn: template?.builtIn === true || template?.kind === TIMER_KIND.break
    };
  }

  resetForm() {
    this.editingTemplateId = "";
    this.formDraft = null;
    this.defaultDeadlineBase = Date.now();
    void this.render({ parts: ["main"] });
  }

  editTemplate(templateId) {
    const template = this.timerTool.getTimerTemplate(templateId);
    if (!template) {
      ui.notifications.warn(localize("Timers.Templates.NotFound"));
      return;
    }
    this.editingTemplateId = template.id;
    this.formDraft = null;
    void this.render({ parts: ["main"] });
  }

  async handleStartTemplate(button) {
    button.disabled = true;
    try {
      await this.timerTool.startTimerTemplate(button.dataset.templateId);
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to start timer template`, error);
      ui.notifications.error(error?.message || localize("Timers.Errors.StartFailed"));
    } finally {
      button.disabled = false;
    }
  }

  async handleSaveCurrentTemplate(button) {
    button.disabled = true;
    try {
      await this.timerTool.saveTimerAsTemplate(button.dataset.timerId);
      ui.notifications.info(localize("Timers.Templates.Saved"));
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save current timer as template`, error);
      ui.notifications.error(error?.message || localize("Timers.Templates.SaveFailed"));
    } finally {
      button.disabled = false;
    }
  }

  async handleSaveTemplate(form) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const button = form.querySelector("[data-timer-action='save-template']");
    const templateId = this.editingTemplateId;
    if (button) button.disabled = true;
    try {
      await this.timerTool.saveTimerTemplate(this.collectFormInput(form), templateId);
      this.editingTemplateId = "";
      this.formDraft = null;
      this.defaultDeadlineBase = Date.now();
      ui.notifications.info(localize(templateId ? "Timers.Templates.Updated" : "Timers.Templates.Saved"));
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save timer template`, error);
      ui.notifications.error(error?.message || localize("Timers.Templates.SaveFailed"));
      if (button) button.disabled = false;
    }
  }

  async previewSound(form) {
    const sound = form.elements.namedItem("sound")?.value ?? TIMER_SOUND.none;
    if (!this.timerTool.getSoundSource(sound)) {
      ui.notifications.warn(localize("Timers.Manager.NoSoundSelected"));
      return;
    }

    try {
      const volume = Number(form.elements.namedItem("volume")?.value ?? 100) / 100;
      await this.timerTool.playTimerSound(sound, volume);
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
      const template = this.getEditingTemplate();
      if (template?.kind === TIMER_KIND.break) {
        this.timerTool.openBreakTimer();
      } else {
        await this.timerTool.startTimer({
          ...this.collectFormInput(form),
          templateId: template?.id ?? ""
        });
      }
      this.editingTemplateId = "";
      this.formDraft = null;
      this.defaultDeadlineBase = Date.now();
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to start timer`, error);
      ui.notifications.error(error?.message || localize("Timers.Errors.StartFailed"));
      if (submitButton) submitButton.disabled = false;
    }
  }

  onTimerStateChanged() {
    if (!this.rendered) return;
    this.captureFormDraft();
    void this.render({ parts: ["main"] });
  }

  onTimerTemplateStateChanged() {
    if (!this.rendered) return;
    this.captureFormDraft();
    void this.render({ parts: ["main"] });
  }

  onTimerTemplatesChanged() {
    this.onTimerTemplateStateChanged();
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
