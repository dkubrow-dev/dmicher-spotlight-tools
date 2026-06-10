import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { i18nKey, localize } from "../../utils.js";
import {
  POLL_TYPE_CONFIG,
  getPollTypeMaxOptions,
  pollTypeUsesOptions
} from "./poll-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PollLaunchApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: getThemedWindowClasses("dmicher-poll-launch"),
    position: {
      width: 680,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-play",
      title: "DMICHERSPOTLIGHTTOOLS.Polls.Launch.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/polls/poll-launch.hbs`
    }
  };

  constructor(pollTool, templateId, options = {}) {
    super({
      ...options,
      id: `dmicher-spotlight-tools-poll-launch-${templateId}`
    });
    this.pollTool = pollTool;
    this.templateId = templateId;
  }

  get title() {
    const template = this.pollTool.getTemplate(this.templateId);
    return template ? localize("Polls.Launch.WindowTitle") : localize("Polls.Manager.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const template = this.pollTool.getTemplate(this.templateId);
    const usesOptions = template ? pollTypeUsesOptions(template.type) : false;
    const maxOptions = template ? getPollTypeMaxOptions(template.type) : 0;
    const optionsRows = usesOptions ? (template.options ?? []).slice(0, maxOptions).map((option, index) => ({
      id: option.id,
      number: index + 1,
      label: option.label,
      enabled: option.enabled !== false
    })) : [];
    const participantRows = template ? this.pollTool.getParticipantRows(template) : [];

    return {
      ...context,
      template,
      hasTemplate: Boolean(template),
      hasActivePoll: Boolean(this.pollTool.state.activePoll),
      usesOptions,
      optionsRows,
      typeLabel: template ? localize(POLL_TYPE_CONFIG[template.type].labelKey) : "",
      selectedCount: participantRows.filter((row) => row.selected).length,
      participantRows,
      timerTimeText: template?.timerTime ?? "",
      timerSoundLabel: this.pollTool.getTimerSoundLabel(template?.timerSound),
      keys: {
        missing: i18nKey("Polls.Launch.Missing"),
        heading: i18nKey("Polls.Launch.Heading"),
        type: i18nKey("Polls.Launch.Type"),
        selectedPlayers: i18nKey("Polls.Launch.SelectedPlayers"),
        name: i18nKey("Polls.Launch.Name"),
        question: i18nKey("Polls.Launch.Question"),
        options: i18nKey("Polls.Launch.Options"),
        optionEnabled: i18nKey("Polls.Launch.OptionEnabled"),
        optionPlaceholder: i18nKey("Polls.Launch.OptionPlaceholder"),
        noOptions: i18nKey("Polls.Launch.NoOptions"),
        timerEnabled: i18nKey("Polls.Launch.TimerEnabled"),
        timerBlock: i18nKey("Polls.Launch.TimerBlock"),
        timerTime: i18nKey("Polls.Launch.TimerTime"),
        timerSound: i18nKey("Polls.Launch.TimerSound"),
        participants: i18nKey("Polls.Launch.Participants"),
        participantsHint: i18nKey("Polls.Launch.ParticipantsHint"),
        clearActive: i18nKey("Polls.Launch.ClearActive"),
        cancel: i18nKey("Polls.Launch.Cancel"),
        start: i18nKey("Polls.Launch.Start")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
    this.refreshTimerBlock();
  }

  async _onClose(options) {
    this.pollTool.forgetLaunchWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-poll-launch-action='cancel']")?.addEventListener("click", () => {
      void this.close();
    });
    this.element.querySelector("[data-poll-launch-action='clear-active']")?.addEventListener("click", () => {
      void this.pollTool.clearActivePoll();
    });
    this.element.querySelector("[data-poll-launch-form]")?.addEventListener("submit", (event) => {
      void this.handleSubmit(event);
    });
    this.element.querySelector("[data-poll-launch-timer-enabled]")?.addEventListener("change", () => {
      this.refreshTimerBlock();
    });
    for (const checkbox of this.element.querySelectorAll("[data-poll-launch-participant]")) {
      checkbox.addEventListener("change", () => this.refreshParticipantCount());
    }
  }

  refreshTimerBlock() {
    const enabled = this.element.querySelector("[data-poll-launch-timer-enabled]")?.checked ?? false;
    this.element.querySelector("[data-poll-launch-timer-block]")?.classList.toggle("is-disabled", !enabled);
  }

  refreshParticipantCount() {
    const count = Array.from(this.element.querySelectorAll("[data-poll-launch-participant]"))
      .filter((input) => input.checked).length;
    const counter = this.element.querySelector("[data-poll-launch-selected-count]");
    if (counter) counter.textContent = String(count);
  }

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const options = Array.from(form.querySelectorAll("[data-poll-launch-option-row]")).map((row) => ({
        id: row.dataset.optionId,
        label: row.querySelector("[data-poll-launch-option-label]")?.value,
        enabled: row.querySelector("[data-poll-launch-option-enabled]")?.checked ?? true
      }));
      const participants = {};
      for (const checkbox of form.querySelectorAll("[data-poll-launch-participant]")) {
        if (checkbox.checked) participants[checkbox.dataset.userId] = true;
      }

      const run = await this.pollTool.launchPoll(this.templateId, {
        timerEnabled: form.elements.namedItem("timerEnabled")?.checked ?? false,
        participants,
        options
      });
      if (run) await this.close();
      else if (submitButton) submitButton.disabled = false;
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to launch poll`, error);
      ui.notifications.error(error?.message || localize("Polls.Errors.StartFailed"));
      if (submitButton) submitButton.disabled = false;
    }
  }

  onPollStateChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
