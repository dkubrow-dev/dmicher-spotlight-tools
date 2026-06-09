import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { i18nKey, localize } from "../../utils.js";
import {
  POLL_TYPE,
  POLL_TYPE_CONFIG,
  getPollTypeMaxOptions,
  pollTypeUsesOptions
} from "./poll-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PollManagerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-poll-manager",
    classes: getThemedWindowClasses("dmicher-poll-manager"),
    position: {
      width: 920,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-square-poll-horizontal",
      title: "DMICHERSPOTLIGHTTOOLS.Polls.Manager.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/polls/poll-manager.hbs`
    }
  };

  constructor(pollTool, options = {}) {
    super(options);
    this.pollTool = pollTool;
    this.editTemplateId = "";
  }

  get title() {
    return localize("Polls.Manager.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const draft = this.editTemplateId
      ? this.pollTool.getTemplate(this.editTemplateId) ?? this.pollTool.getBlankTemplateDraft()
      : this.pollTool.getBlankTemplateDraft();
    const optionRows = this.prepareOptionRows(draft);
    const typeOptions = Object.values(POLL_TYPE).map((type) => ({
      value: type,
      label: localize(POLL_TYPE_CONFIG[type].labelKey),
      selected: type === draft.type ? "selected" : ""
    }));

    return {
      ...context,
      draft,
      editing: Boolean(this.editTemplateId),
      typeOptions,
      timerSoundChoices: this.pollTool.getTimerSoundChoices(draft.timerSound),
      optionRows,
      participants: this.pollTool.getParticipantRows(),
      templates: this.pollTool.getTemplateRows(),
      hasTemplates: this.pollTool.getTemplateRows().length > 0,
      hasActivePoll: Boolean(this.pollTool.state.activePoll),
      labels: {
        buttons: localize(POLL_TYPE_CONFIG.buttons.labelKey),
        radio: localize(POLL_TYPE_CONFIG.radio.labelKey),
        checkbox: localize(POLL_TYPE_CONFIG.checkbox.labelKey),
        text: localize(POLL_TYPE_CONFIG.text.labelKey)
      },
      keys: {
        createTitle: i18nKey(this.editTemplateId ? "Polls.Manager.EditTitle" : "Polls.Manager.CreateTitle"),
        name: i18nKey("Polls.Manager.Name"),
        question: i18nKey("Polls.Manager.Question"),
        type: i18nKey("Polls.Manager.Type"),
        options: i18nKey("Polls.Manager.Options"),
        optionPlaceholder: i18nKey("Polls.Manager.OptionPlaceholder"),
        textNoOptions: i18nKey("Polls.Manager.TextNoOptions"),
        timerEnabled: i18nKey("Polls.Manager.TimerEnabled"),
        timerBlock: i18nKey("Polls.Manager.TimerBlock"),
        timerMinutes: i18nKey("Polls.Manager.TimerMinutes"),
        timerSound: i18nKey("Polls.Manager.TimerSound"),
        minutesUnit: i18nKey("Focus.Settings.Minutes"),
        participants: i18nKey("Polls.Manager.Participants"),
        participantsHint: i18nKey("Polls.Manager.ParticipantsHint"),
        save: i18nKey(this.editTemplateId ? "Polls.Manager.SaveChanges" : "Polls.Manager.Create"),
        reset: i18nKey("Polls.Manager.Reset"),
        clearActive: i18nKey("Polls.Manager.ClearActive"),
        tableTitle: i18nKey("Polls.Manager.TableTitle"),
        empty: i18nKey("Polls.Manager.Empty"),
        columnName: i18nKey("Polls.Manager.Columns.Name"),
        columnType: i18nKey("Polls.Manager.Columns.Type"),
        columnLastResult: i18nKey("Polls.Manager.Columns.LastResult"),
        columnControls: i18nKey("Polls.Manager.Columns.Controls"),
        edit: i18nKey("Polls.Manager.Edit"),
        start: i18nKey("Polls.Manager.Start"),
        results: i18nKey("Polls.Manager.Results"),
        delete: i18nKey("Polls.Manager.Delete")
      }
    };
  }

  prepareOptionRows(draft) {
    const maxRows = 12;
    const options = draft.options ?? [];
    return Array.from({ length: maxRows }, (_value, index) => ({
      number: index + 1,
      value: options[index]?.label ?? "",
      enabled: options[index]?.enabled !== false,
      buttonsVisible: index < getPollTypeMaxOptions(POLL_TYPE.buttons) ? "true" : "false",
      tableVisible: index < getPollTypeMaxOptions(POLL_TYPE.radio) ? "true" : "false"
    }));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateForm();
    this.activateParticipants();
    this.activateTable();
    this.refreshOptionVisibility();
    this.refreshTimerBlock();
  }

  async _onClose(options) {
    this.pollTool.forgetManagerWindow(this);
    await super._onClose(options);
  }

  activateForm() {
    const form = this.element.querySelector("[data-poll-template-form]");
    if (!form) return;

    form.addEventListener("submit", (event) => void this.handleSubmit(event));
    form.querySelector("[data-poll-action='reset-form']")?.addEventListener("click", () => {
      this.editTemplateId = "";
      void this.render({ parts: ["main"] });
    });
    form.querySelector("[data-poll-type-select]")?.addEventListener("change", () => {
      this.refreshOptionVisibility();
    });
    form.querySelector("[data-poll-timer-enabled]")?.addEventListener("change", () => {
      this.refreshTimerBlock();
    });
    this.element.querySelector("[data-poll-action='clear-active']")?.addEventListener("click", () => {
      void this.pollTool.clearActivePoll();
    });
  }

  activateParticipants() {
    for (const checkbox of this.element.querySelectorAll("[data-poll-participant]")) {
      checkbox.addEventListener("change", () => {
        void this.pollTool.setSelected(checkbox.dataset.userId, checkbox.checked);
      });
    }
  }

  activateTable() {
    for (const button of this.element.querySelectorAll("[data-poll-template-action]")) {
      button.addEventListener("click", () => {
        const templateId = button.dataset.templateId;
        const action = button.dataset.pollTemplateAction;
        if (action === "edit") {
          this.editTemplateId = templateId;
          void this.render({ parts: ["main"] });
        } else if (action === "start") {
          void this.pollTool.startPoll(templateId);
        } else if (action === "results") {
          this.pollTool.openResultsWindow(templateId);
        } else if (action === "delete") {
          void this.pollTool.confirmDeleteTemplate(templateId);
        }
      });
    }
  }

  refreshOptionVisibility() {
    const form = this.element.querySelector("[data-poll-template-form]");
    const type = form?.elements.namedItem("type")?.value ?? POLL_TYPE.buttons;
    const usesOptions = pollTypeUsesOptions(type);
    const maxOptions = getPollTypeMaxOptions(type);

    for (const row of this.element.querySelectorAll("[data-poll-option-row]")) {
      const index = Number(row.dataset.optionIndex) || 0;
      const visible = usesOptions && index < maxOptions;
      row.hidden = !visible;
      for (const input of row.querySelectorAll("input")) {
        input.toggleAttribute("disabled", !visible);
      }
    }

    const emptyNote = this.element.querySelector("[data-poll-text-no-options]");
    if (emptyNote) emptyNote.hidden = usesOptions;
  }

  refreshTimerBlock() {
    const enabled = this.element.querySelector("[data-poll-timer-enabled]")?.checked ?? false;
    const block = this.element.querySelector("[data-poll-timer-block]");
    if (block) block.classList.toggle("is-disabled", !enabled);
    for (const input of this.element.querySelectorAll("[data-poll-timer-field]")) {
      input.disabled = !enabled;
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const type = form.elements.namedItem("type")?.value ?? POLL_TYPE.buttons;
      const maxOptions = getPollTypeMaxOptions(type);
      const options = Array.from(form.querySelectorAll("[data-poll-option-row]"))
        .slice(0, maxOptions)
        .map((row) => ({
          label: row.querySelector("[data-poll-option-input]")?.value,
          enabled: row.querySelector("[data-poll-option-enabled]")?.checked ?? true
        }))
        .filter((option) => String(option.label ?? "").trim());

      const template = await this.pollTool.saveTemplate({
        id: this.editTemplateId,
        name: form.elements.namedItem("name")?.value,
        question: form.elements.namedItem("question")?.value,
        type,
        timerEnabled: form.elements.namedItem("timerEnabled")?.checked ?? false,
        timerMinutes: form.elements.namedItem("timerMinutes")?.value,
        timerSound: form.elements.namedItem("timerSound")?.value,
        options
      });
      this.editTemplateId = template.id;
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save poll template`, error);
      ui.notifications.error(error?.message || localize("Polls.Errors.SaveFailed"));
      if (submitButton) submitButton.disabled = false;
    }
  }

  onPollStateChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
