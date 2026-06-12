import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { formatTimestamp, i18nKey, localize } from "../../utils.js";
import { POLL_TYPE, POLL_TYPE_CONFIG } from "./poll-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PollResultsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: getThemedWindowClasses("dmicher-poll-results"),
    position: {
      width: 820,
      height: 520
    },
    window: {
      icon: "fa-solid fa-chart-simple",
      title: "DMICHERSPOTLIGHTTOOLS.Polls.Results.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/polls/poll-results.hbs`
    }
  };

  constructor(pollTool, templateId, options = {}) {
    super({
      ...options,
      id: `dmicher-spotlight-tools-poll-results-${templateId}`
    });
    this.pollTool = pollTool;
    this.templateId = templateId;
  }

  get title() {
    const run = this.pollTool.getLastRun(this.templateId);
    return run?.name ?? localize("Polls.Results.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const run = this.pollTool.getLastRun(this.templateId);
    const summaryRows = this.pollTool.getSummaryRows(run);
    const resultRows = this.pollTool.getResultRows(run);

    return {
      ...context,
      run,
      hasRun: Boolean(run),
      hasSummary: summaryRows.length > 0,
      hasResults: resultRows.length > 0,
      summaryRows,
      resultRows,
      typeLabel: run ? localize(POLL_TYPE_CONFIG[run.type].labelKey) : "",
      requestedAtText: run ? formatTimestamp(run.requestedAt) : "",
      isTextPoll: run?.type === POLL_TYPE.text,
      isActive: Boolean(this.pollTool.state.activePoll?.templateId === this.templateId),
      keys: {
        missing: i18nKey("Polls.Results.Missing"),
        question: i18nKey("Polls.Results.Question"),
        type: i18nKey("Polls.Results.Type"),
        requestedAt: i18nKey("Polls.Results.RequestedAt"),
        requestedBy: i18nKey("Polls.Results.RequestedBy"),
        summaryTitle: i18nKey("Polls.Results.SummaryTitle"),
        responsesTitle: i18nKey("Polls.Results.ResponsesTitle"),
        option: i18nKey("Polls.Results.Option"),
        count: i18nKey("Polls.Results.Count"),
        voters: i18nKey("Polls.Results.Voters"),
        voter: i18nKey("Polls.Results.Voter"),
        status: i18nKey("Polls.Results.Status"),
        answer: i18nKey("Polls.Results.Answer"),
        answeredAt: i18nKey("Polls.Results.AnsweredAt"),
        noSummary: i18nKey("Polls.Results.NoSummary"),
        post: i18nKey("Polls.Results.Post"),
        clear: i18nKey("Polls.Results.Clear"),
        close: i18nKey("Polls.Results.Close")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
  }

  async close(options = {}) {
    if (!options.force) {
      const canClose = await this.pollTool.confirmCloseTemporaryResults(this.templateId);
      if (!canClose) return this;
    }
    return super.close(options);
  }

  async _onClose(options) {
    this.pollTool.forgetResultsWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-poll-results-action='post']")?.addEventListener("click", () => {
      void this.pollTool.postResultsToChat(this.templateId);
    });
    this.element.querySelector("[data-poll-results-action='clear']")?.addEventListener("click", () => {
      void this.pollTool.clearActivePoll();
    });
    this.element.querySelector("[data-poll-results-action='close']")?.addEventListener("click", () => {
      void this.close();
    });
  }

  onPollStateChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
