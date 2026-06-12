import { FLAGS, MODULE_ID, SETTINGS, SOCKET_CHANNEL } from "../../config.js";
import {
  confirmDialog,
  escapeHTML,
  format,
  formatTimestamp,
  getChatMessageClass,
  getModeratorUserIds,
  isModerator,
  isPrimaryModerator,
  localize
} from "../../utils.js";
import { createOrUpdateHotbarMacro, isHotbarDrop, setHotbarDragData } from "../hotbar-macro.js";
import {
  TIMER_DISPLAY_STYLE,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_VISIBILITY
} from "../timers/timer-utils.js";
import { PollManagerApplication } from "./poll-manager.js";
import { PollLaunchApplication } from "./poll-launch-window.js";
import { PollResultsApplication } from "./poll-results-window.js";
import {
  POLL_RESPONSE_STATUS,
  POLL_RESPONSE_STATUS_CONFIG,
  POLL_TYPE,
  POLL_TYPE_CONFIG,
  clonePollState,
  createBlankPollTemplateDraft,
  createEmptyPollState,
  createStarterPollTemplates,
  getPollOptionLabel,
  getPollOptionNumber,
  getPollTimerDurationMs,
  getPollTypeMaxOptions,
  isPollTimerTimeValid,
  listPollTemplates,
  normalizePollResponse,
  normalizePollResponseStatus,
  normalizePollResponseValue,
  normalizePollParticipants,
  normalizePollState,
  normalizePollTemplate,
  normalizePollTimerSound,
  normalizePollTimerTime,
  normalizePollType,
  pollTypeUsesOptions
} from "./poll-utils.js";

const POLL_MACRO_IMAGE = `modules/${MODULE_ID}/assets/polls/macros-icon.webp`;

function isAnswerEmpty(type, value) {
  type = normalizePollType(type);
  if (type === POLL_TYPE.checkbox) return !Array.isArray(value) || value.length === 0;
  return !String(value ?? "").trim();
}

export class PollTool {
  constructor({ timerTool = null } = {}) {
    this.state = createEmptyPollState();
    this.timerTool = timerTool;
    this.managerWindow = null;
    this.launchWindow = null;
    this.launchTemplateId = "";
    this.resultsWindow = null;
    this.resultsTemplateId = "";
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
    this.handleHotbarDrop = this.handleHotbarDrop.bind(this);
  }

  registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.polls, {
      scope: "world",
      config: false,
      type: Object,
      default: createEmptyPollState(),
      onChange: (value) => this.onPollStateChanged(value)
    });
  }

  registerHooks() {
    Hooks.on("renderChatMessageHTML", this.renderChatMessage);
    Hooks.on("hotbarDrop", this.handleHotbarDrop);
  }

  activate() {
    this.state = normalizePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    if (this.state.defaultsVersion !== game.settings.get(MODULE_ID, SETTINGS.polls)?.defaultsVersion) {
      void game.settings.set(MODULE_ID, SETTINGS.polls, this.state);
    }
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
  }

  openManager() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return null;
    }

    if (this.managerWindow?.rendered) {
      this.managerWindow.bringToFront();
      return this.managerWindow;
    }

    this.managerWindow = new PollManagerApplication(this);
    void this.managerWindow.render({ force: true });
    return this.managerWindow;
  }

  openWindow() {
    return this.openManager();
  }

  forgetManagerWindow(app) {
    if (this.managerWindow === app) this.managerWindow = null;
  }

  openLaunchWindow(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return null;
    }

    const template = this.getTemplate(templateId);
    if (!template) {
      ui.notifications.warn(localize("Polls.Errors.TemplateNotFound"));
      return null;
    }

    if (this.launchWindow?.rendered && this.launchTemplateId === template.id) {
      this.launchWindow.bringToFront();
      return this.launchWindow;
    }

    if (this.launchWindow?.rendered) void this.launchWindow.close();
    this.launchTemplateId = template.id;
    this.launchWindow = new PollLaunchApplication(this, template.id);
    void this.launchWindow.render({ force: true });
    return this.launchWindow;
  }

  forgetLaunchWindow(app) {
    if (this.launchWindow === app) {
      this.launchWindow = null;
      this.launchTemplateId = "";
    }
  }

  openResultsWindow(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return null;
    }

    const run = this.getLastRun(templateId);
    if (!run) {
      ui.notifications.warn(localize("Polls.Errors.NoResults"));
      return null;
    }

    if (this.resultsWindow?.rendered && this.resultsTemplateId === templateId) {
      this.resultsWindow.bringToFront();
      return this.resultsWindow;
    }

    if (this.resultsWindow?.rendered) void this.resultsWindow.close();
    this.resultsTemplateId = templateId;
    this.resultsWindow = new PollResultsApplication(this, templateId);
    void this.resultsWindow.render({ force: true });
    return this.resultsWindow;
  }

  forgetResultsWindow(app) {
    if (this.resultsWindow === app) {
      this.resultsWindow = null;
      this.resultsTemplateId = "";
    }
  }

  getTemplate(templateId) {
    return this.state.templates[String(templateId)] ?? null;
  }

  getLastRun(templateId) {
    templateId = String(templateId ?? "");
    if (this.state.activePoll?.templateId === templateId) return this.state.activePoll;
    return this.state.lastRuns[templateId] ?? null;
  }

  getBlankTemplateDraft() {
    return createBlankPollTemplateDraft();
  }

  getTemplateRows() {
    return listPollTemplates(this.state).map((template) => {
      const lastRun = this.getLastRun(template.id);
      const answered = lastRun ? Object.values(lastRun.responses)
        .filter((response) => response.status === POLL_RESPONSE_STATUS.answered).length : 0;
      const total = lastRun ? Object.values(lastRun.selected).filter(Boolean).length : 0;
      return {
        id: template.id,
        name: template.name,
        question: template.question,
        macroImage: POLL_MACRO_IMAGE,
        macroTitle: format("Polls.Hotbar.DragTitle", { name: template.name }),
        typeLabel: localize(POLL_TYPE_CONFIG[template.type].labelKey),
        hasResults: Boolean(lastRun),
        resultSummary: lastRun
          ? format("Polls.Manager.ResultSummary", { answered, total })
          : localize("Polls.Manager.NoResults"),
        active: this.state.activePoll?.templateId === template.id ? "is-active" : ""
      };
    });
  }

  getParticipantRows(template = null, { selectedOnly = false } = {}) {
    const selected = template?.participants ?? this.state.selected;
    return Array.from(game.users).map((user) => ({
      userId: user.id,
      name: user.name,
      active: user.active,
      selected: Boolean(selected[user.id])
    })).filter((row) => {
      return !selectedOnly || row.selected;
    }).sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (left.active !== right.active) return left.active ? -1 : 1;
      return left.name.localeCompare(right.name, game.i18n.lang);
    });
  }

  getTimerSoundChoices(selectedSound = TIMER_SOUND.none) {
    selectedSound = normalizePollTimerSound(selectedSound);
    return [
      { value: TIMER_SOUND.none, label: localize("Timers.Sound.None") },
      { value: TIMER_SOUND.signal1, label: localize("Timers.Sound.Signal1") },
      { value: TIMER_SOUND.signal2, label: localize("Timers.Sound.Signal2") },
      { value: TIMER_SOUND.signal3, label: localize("Timers.Sound.Signal3") }
    ].map((choice) => ({
      ...choice,
      selected: choice.value === selectedSound ? "selected" : ""
    }));
  }

  getTimerSoundLabel(sound = TIMER_SOUND.none) {
    return this.getTimerSoundChoices(sound).find((choice) => choice.value === normalizePollTimerSound(sound))?.label
      ?? localize("Timers.Sound.None");
  }

  async setSelected(userId, selected) {
    if (!isModerator()) throw new Error(localize("Polls.Errors.Forbidden"));
    await this.updateState((state) => {
      state.selected[String(userId)] = Boolean(selected);
    });
  }

  async saveTemplate(input) {
    if (!isModerator()) throw new Error(localize("Polls.Errors.Forbidden"));

    const existing = input.id ? this.getTemplate(input.id) : null;
    const template = this.createTemplateFromInput(input, { existing });

    await this.updateState((state) => {
      state.templates[template.id] = template;
    });
    return template;
  }

  createTemplateFromInput(input, { existing = null, temporary = false } = {}) {
    input = input ?? {};
    const now = Date.now();
    const type = normalizePollType(input.type);
    const timerEnabled = Boolean(input.timerEnabled);
    const maxOptions = getPollTypeMaxOptions(type);
    const rawOptions = (input.options ?? []).slice(0, maxOptions)
      .filter((option) => String(option?.label ?? "").trim());
    if (pollTypeUsesOptions(type) && !rawOptions.length) {
      throw new Error(localize("Polls.Errors.OptionsRequired"));
    }
    if (timerEnabled && !isPollTimerTimeValid(input.timerTime)) {
      throw new Error(localize("Timers.Errors.BadTime"));
    }

    const options = pollTypeUsesOptions(type)
      ? rawOptions.map((option, index) => ({
        id: existing?.options?.[index]?.id || `option-${index + 1}`,
        label: option.label,
        icon: existing?.options?.[index]?.icon ?? "",
        enabled: option.enabled !== false
      }))
      : [];

    const template = normalizePollTemplate({
      ...(existing ?? {}),
      id: existing?.id || input.id || (temporary ? `temporary-${foundry.utils.randomID()}` : foundry.utils.randomID()),
      preset: existing?.preset ?? "custom",
      name: input.name,
      question: input.question,
      type,
      options,
      participants: normalizePollParticipants(input.participants),
      timerEnabled,
      timerTime: normalizePollTimerTime(input.timerTime),
      timerSound: normalizePollTimerSound(input.timerSound),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });

    return template;
  }

  async restoreStarterTemplates() {
    if (!isModerator()) throw new Error(localize("Polls.Errors.Forbidden"));

    await this.updateState((state) => {
      for (const template of createStarterPollTemplates(Date.now(), { uniqueIds: true })) {
        let id = template.id;
        while (state.templates[id]) id = foundry.utils.randomID();
        state.templates[id] = {
          ...template,
          id
        };
      }
    });
    ui.notifications.info(localize("Polls.Manager.RestoredDefaults"));
  }

  async confirmDeleteTemplate(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const template = this.getTemplate(templateId);
    if (!template) {
      ui.notifications.warn(localize("Polls.Errors.TemplateNotFound"));
      return;
    }

    if (this.state.activePoll?.templateId === template.id) {
      ui.notifications.warn(localize("Polls.Errors.DeleteActive"));
      return;
    }

    const confirmed = await confirmDialog({
      title: localize("Polls.Delete.Title"),
      content: `<p>${escapeHTML(format("Polls.Delete.Confirm", { name: template.name }))}</p>`,
      yes: localize("Polls.Delete.Yes"),
      no: localize("Polls.Delete.No"),
      icon: "fa-solid fa-trash"
    });
    if (!confirmed) return;

    await this.updateState((state) => {
      delete state.templates[template.id];
      delete state.lastRuns[template.id];
    });
  }

  async startPoll(templateId) {
    return this.openLaunchWindow(templateId);
  }

  async launchTemporaryPoll(input) {
    if (!isModerator()) throw new Error(localize("Polls.Errors.Forbidden"));
    const template = this.createTemplateFromInput(input, { temporary: true });
    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    return this.launchPreparedPoll(state, template, {
      timerEnabled: template.timerEnabled
    }, {
      temporary: true
    });
  }

  onTemplateDragStart(event) {
    const templateId = String(event.currentTarget?.dataset?.templateId ?? "");
    if (!this.getTemplate(templateId)) return;

    setHotbarDragData(event, "poll-template", { templateId });
  }

  handleHotbarDrop(_hotbar, data, slot) {
    if (!isHotbarDrop(data, "poll-template")) return;
    void this.createTemplateMacro(data.templateId, slot);
    return false;
  }

  async createTemplateMacro(templateId, slot, notify = true) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const template = this.getTemplate(templateId);
    if (!template) {
      ui.notifications.warn(localize("Polls.Errors.TemplateNotFound"));
      return;
    }

    const name = format("Polls.Hotbar.MacroName", { name: template.name });
    const command = this.getPollMacroCommand(template.id);

    await createOrUpdateHotbarMacro({
      slot,
      name,
      type: "script",
      img: POLL_MACRO_IMAGE,
      command,
      flags: {
        [MODULE_ID]: {
          [FLAGS.pollMacro]: template.id
        }
      },
      findExisting: (macro) => this.isPollMacro(macro, template.id),
      updateFlags: {
        [`flags.${MODULE_ID}.${FLAGS.pollMacro}`]: template.id
      },
      notify,
      addedMessage: format("Polls.Hotbar.Added", { name: template.name }),
      errorMessage: localize("Polls.Hotbar.AddError"),
      logMessage: "Unable to create poll hotbar macro"
    });
  }

  isPollMacro(macro, templateId) {
    const flaggedTemplateId = macro.getFlag(MODULE_ID, FLAGS.pollMacro);
    return (flaggedTemplateId === templateId) || (macro.command === this.getPollMacroCommand(templateId));
  }

  getPollMacroCommand(templateId) {
    return `game.modules.get("${MODULE_ID}")?.api?.openPollLaunch("${templateId}");`;
  }

  async launchPoll(templateId, overrides = {}) {
    if (!isModerator()) throw new Error(localize("Polls.Errors.Forbidden"));

    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    if (state.activePoll && !state.activePoll.closed) {
      ui.notifications.warn(localize("Polls.Errors.ClearFirst"));
      return null;
    }

    const template = state.templates[String(templateId)];
    if (!template) {
      ui.notifications.warn(localize("Polls.Errors.TemplateNotFound"));
      return null;
    }

    return this.launchPreparedPoll(state, template, overrides);
  }

  async launchPreparedPoll(state, template, overrides = {}, { temporary = false } = {}) {
    if (state.activePoll && !state.activePoll.closed) {
      ui.notifications.warn(localize("Polls.Errors.ClearFirst"));
      return null;
    }

    const launchParticipants = overrides.participants
      ? normalizePollParticipants(overrides.participants, template.participants)
      : template.participants;
    const selectedUsers = Array.from(game.users).filter((user) => launchParticipants[user.id]);
    if (!selectedUsers.length) {
      ui.notifications.warn(localize("Polls.Errors.NoPlayers"));
      return null;
    }

    const launchOptions = this.getLaunchOptions(template, overrides.options);
    if (pollTypeUsesOptions(template.type) && !launchOptions.length) {
      ui.notifications.warn(localize("Polls.Errors.EnabledOptionsRequired"));
      return null;
    }

    const runTemplate = normalizePollTemplate({
      ...template,
      options: launchOptions,
      timerEnabled: overrides.timerEnabled ?? template.timerEnabled,
      timerTime: template.timerTime,
      timerSound: template.timerSound
    });

    const requestedAt = Date.now();
    const timerEnabled = Boolean(runTemplate.timerEnabled);
    const timerTime = normalizePollTimerTime(runTemplate.timerTime);
    const timerDuration = timerEnabled ? getPollTimerDurationMs(timerTime) : 0;
    const run = {
      id: foundry.utils.randomID(),
      templateId: runTemplate.id,
      name: runTemplate.name,
      question: runTemplate.question,
      type: runTemplate.type,
      options: foundry.utils.deepClone(runTemplate.options),
      selected: {},
      responses: {},
      requestedAt,
      requestedBy: game.user.id,
      requestedByName: game.user.name,
      timerEnabled,
      timerTime,
      timerSound: normalizePollTimerSound(runTemplate.timerSound),
      timerId: "",
      timerStartedAt: timerEnabled ? requestedAt : 0,
      timerEndsAt: timerEnabled ? requestedAt + timerDuration : 0,
      closed: false,
      temporary: Boolean(temporary)
    };

    if (timerEnabled) {
      const timer = await this.startPollTimer(run);
      if (timer?.id) run.timerId = timer.id;
    }

    for (const user of selectedUsers) {
      run.selected[user.id] = true;
      run.responses[user.id] = {
        status: POLL_RESPONSE_STATUS.pending,
        value: null,
        answeredAt: 0,
        messageId: "",
        userName: user.name
      };
    }

    state.activePoll = run;
    state.lastRuns[template.id] = foundry.utils.deepClone(run);
    await game.settings.set(MODULE_ID, SETTINGS.polls, state);

    for (const user of selectedUsers) {
      const message = await this.createRequestMessage(user, run);
      if (!message?.id) continue;
      await this.updateState((latestState) => {
        if (latestState.activePoll?.id !== run.id) return;
        latestState.activePoll.responses[user.id].messageId = message.id;
        latestState.lastRuns[template.id] = foundry.utils.deepClone(latestState.activePoll);
      });
    }

    this.openResultsWindow(template.id);
    return run;
  }

  async startPollTimer(run) {
    if (!this.timerTool) {
      throw new Error(localize("Polls.Errors.TimerUnavailable"));
    }

    return this.timerTool.startTimer({
      name: format("Polls.Timer.Name", { poll: run.name }),
      mode: TIMER_MODE.duration,
      time: run.timerTime,
      visibility: TIMER_VISIBILITY.public,
      style: TIMER_DISPLAY_STYLE.prominent,
      sound: run.timerSound
    });
  }

  getLaunchOptions(template, overrideOptions) {
    if (!pollTypeUsesOptions(template.type)) return [];
    const byId = new Map((overrideOptions ?? []).map((option) => [String(option.id ?? ""), option]));
    return (template.options ?? []).map((option) => {
      const override = byId.get(option.id) ?? {};
      return {
        ...option,
        label: override.label ?? option.label,
        enabled: override.enabled ?? option.enabled
      };
    }).filter((option) => option.enabled !== false && String(option.label ?? "").trim());
  }

  async createRequestMessage(user, run) {
    const ChatMessageClass = getChatMessageClass();
    const requestData = this.getRequestData(user.id, run);

    return ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content: this.buildRequestContent(requestData),
      whisper: Array.from(new Set([user.id, ...getModeratorUserIds()])),
      flags: {
        [MODULE_ID]: {
          [FLAGS.pollRequest]: requestData
        }
      }
    });
  }

  getRequestData(userId, run) {
    return {
      runId: run.id,
      templateId: run.templateId,
      userId,
      name: run.name,
      question: run.question,
      type: run.type,
      options: foundry.utils.deepClone(run.options),
      requestedAt: run.requestedAt,
      requestedByName: run.requestedByName
    };
  }

  buildRequestContent(requestData) {
    const type = normalizePollType(requestData.type);
    const options = requestData.options ?? [];
    const interaction = this.buildRequestInteraction(type, options);

    return `
      <section class="dmicher-poll-card" data-poll-request>
        <h3 data-poll-heading>${escapeHTML(requestData.name)}</h3>
        <p data-poll-question>${escapeHTML(requestData.question)}</p>
        ${interaction}
      </section>`;
  }

  buildRequestInteraction(type, options) {
    if (type === POLL_TYPE.buttons) {
      return `
        <div class="dmicher-poll-actions dmicher-poll-button-actions" data-poll-interaction>
          ${options.map((option) => `
            <button type="button" class="dmicher-poll-button" data-poll-response-option="${escapeHTML(option.id)}">
              ${option.icon ? `<i class="${escapeHTML(option.icon)}" aria-hidden="true"></i>` : ""}
              <span>${escapeHTML(option.label)}</span>
            </button>`).join("")}
        </div>`;
    }

    if (type === POLL_TYPE.text) {
      return `
        <form class="dmicher-poll-form" data-poll-interaction data-poll-response-form>
          <input type="text" name="pollText" data-poll-text-input>
          ${this.buildRequestFormActions()}
        </form>`;
    }

    const inputType = type === POLL_TYPE.checkbox ? "checkbox" : "radio";
    return `
      <form class="dmicher-poll-form" data-poll-interaction data-poll-response-form>
        <table class="dmicher-poll-option-table">
          <tbody>
            ${options.map((option, index) => `
              <tr>
                <td class="dmicher-poll-option-number">${index + 1}</td>
                <td class="dmicher-poll-option-check">
                  <input type="${inputType}" name="pollOption" value="${escapeHTML(option.id)}">
                </td>
                <td>${escapeHTML(option.label)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
        ${this.buildRequestFormActions()}
      </form>`;
  }

  buildRequestFormActions() {
    return `
      <div class="dmicher-poll-actions">
        <button type="submit" data-poll-submit>
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          <span data-poll-submit-label>${escapeHTML(localize("Polls.Message.Submit"))}</span>
        </button>
        <button type="button" data-poll-cancel>
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          <span data-poll-cancel-label>${escapeHTML(localize("Polls.Message.Cancel"))}</span>
        </button>
      </div>`;
  }

  renderChatMessage(message, html) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.pollRequest);
    if (!requestData) return;

    const card = html.querySelector("[data-poll-request]");
    if (!card) return;

    const heading = card.querySelector("[data-poll-heading]");
    const question = card.querySelector("[data-poll-question]");
    const submitLabel = card.querySelector("[data-poll-submit-label]");
    const cancelLabel = card.querySelector("[data-poll-cancel-label]");
    if (heading) heading.textContent = requestData.name;
    if (question) question.textContent = requestData.question;
    if (submitLabel) submitLabel.textContent = localize("Polls.Message.Submit");
    if (cancelLabel) cancelLabel.textContent = localize("Polls.Message.Cancel");

    const interaction = card.querySelector("[data-poll-interaction]");
    if (requestData.userId !== game.user.id) {
      if (interaction) interaction.hidden = true;
      return;
    }

    card.querySelector("[data-poll-response-option]")?.parentElement?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-poll-response-option]");
      if (!button) return;
      event.preventDefault();
      void this.answerRequest(message, {
        status: POLL_RESPONSE_STATUS.answered,
        value: button.dataset.pollResponseOption
      });
    });

    card.querySelector("[data-poll-cancel]")?.addEventListener("click", (event) => {
      event.preventDefault();
      void this.answerRequest(message, {
        status: POLL_RESPONSE_STATUS.cancelled,
        value: null
      });
    });

    card.querySelector("[data-poll-response-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = this.collectFormResponse(event.currentTarget, requestData.type);
      if (value === null) return;
      void this.answerRequest(message, {
        status: POLL_RESPONSE_STATUS.answered,
        value
      });
    });
  }

  collectFormResponse(form, type) {
    type = normalizePollType(type);
    if (type === POLL_TYPE.text) {
      const value = String(form.elements.namedItem("pollText")?.value ?? "").trim();
      if (!value) {
        ui.notifications.warn(localize("Polls.Errors.EnterText"));
        return null;
      }
      return value;
    }

    const checked = Array.from(form.querySelectorAll("input[name='pollOption']:checked"))
      .map((input) => input.value);
    if (!checked.length) {
      ui.notifications.warn(localize("Polls.Errors.SelectOption"));
      return null;
    }
    return type === POLL_TYPE.checkbox ? checked : checked[0];
  }

  async answerRequest(message, response) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.pollRequest);
    if (!requestData || requestData.userId !== game.user.id) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const payload = {
      action: "pollResponse",
      messageId: message.id,
      runId: requestData.runId,
      userId: requestData.userId,
      status: normalizePollResponseStatus(response.status),
      value: response.value
    };

    if (isModerator()) {
      await this.processResponse(payload);
      return;
    }

    game.socket.emit(SOCKET_CHANNEL, payload);
  }

  receiveSocketMessage(payload) {
    if (payload?.action !== "pollResponse") return;
    if (!isPrimaryModerator()) return;
    void this.processResponse(payload);
  }

  async processResponse(payload) {
    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    const run = state.activePoll;
    if (!run || run.id !== String(payload.runId ?? "")) return;

    const userId = String(payload.userId ?? "");
    if (!run.selected[userId]) return;

    const status = normalizePollResponseStatus(payload.status);
    const value = status === POLL_RESPONSE_STATUS.answered
      ? normalizePollResponseValue(run.type, payload.value, run.options)
      : null;
    if (status === POLL_RESPONSE_STATUS.answered && isAnswerEmpty(run.type, value)) return;

    const response = normalizePollResponse({
      status,
      value,
      answeredAt: Date.now(),
      messageId: "",
      userName: game.users.get(userId)?.name ?? ""
    }, run.type, run.options);

    const messageId = String(payload.messageId || run.responses[userId]?.messageId || "");
    run.responses[userId] = response;
    state.activePoll = run;
    state.lastRuns[run.templateId] = foundry.utils.deepClone(run);
    await game.settings.set(MODULE_ID, SETTINGS.polls, state);

    const message = this.findRequestMessage(run.id, userId, messageId);
    if (message) await message.delete();
    await this.createResultMessage(userId, run, response);
  }

  async clearActivePoll() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    const run = state.activePoll;
    if (!run) return;

    for (const [userId, response] of Object.entries(run.responses)) {
      if (response.status !== POLL_RESPONSE_STATUS.pending) continue;
      const message = this.findRequestMessage(run.id, userId, response.messageId);
      if (message) await message.delete();
      run.responses[userId] = normalizePollResponse({
        status: POLL_RESPONSE_STATUS.noAnswer,
        value: null,
        answeredAt: Date.now(),
        messageId: "",
        userName: game.users.get(userId)?.name ?? response.userName
      }, run.type, run.options);
    }

    run.closed = true;
    state.activePoll = null;
    state.lastRuns[run.templateId] = foundry.utils.deepClone(run);
    await game.settings.set(MODULE_ID, SETTINGS.polls, state);
  }

  async confirmCloseTemporaryResults(templateId) {
    const run = this.getLastRun(templateId);
    if (!run?.temporary) return true;

    const active = this.state.activePoll?.templateId === run.templateId && !this.state.activePoll.closed;
    if (active) {
      const confirmed = await confirmDialog({
        title: localize("Polls.Results.TemporaryCloseTitle"),
        content: `<p>${escapeHTML(localize("Polls.Results.TemporaryCloseConfirm"))}</p>`,
        yes: localize("Polls.Results.TemporaryCloseYes"),
        no: localize("Polls.Results.TemporaryCloseNo"),
        icon: "fa-solid fa-triangle-exclamation"
      });
      if (!confirmed) return false;
    }

    await this.discardTemporaryPoll(run.templateId);
    return true;
  }

  async discardTemporaryPoll(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    const run = state.activePoll?.templateId === templateId ? state.activePoll : state.lastRuns[templateId];
    if (!run?.temporary) return;

    if (state.activePoll?.templateId === templateId) {
      for (const [userId, response] of Object.entries(state.activePoll.responses)) {
        if (response.status !== POLL_RESPONSE_STATUS.pending) continue;
        const message = this.findRequestMessage(state.activePoll.id, userId, response.messageId);
        if (message) await message.delete();
      }
      state.activePoll = null;
    }

    delete state.lastRuns[templateId];
    await game.settings.set(MODULE_ID, SETTINGS.polls, state);
  }

  findRequestMessage(runId, userId, messageId = "") {
    const byId = messageId ? game.messages.get(messageId) : null;
    const byIdData = byId?.getFlag(MODULE_ID, FLAGS.pollRequest);
    if (byIdData?.runId === runId && byIdData?.userId === userId) return byId;

    return Array.from(game.messages ?? []).find((message) => {
      const requestData = message.getFlag(MODULE_ID, FLAGS.pollRequest);
      return requestData?.runId === runId && requestData?.userId === userId;
    }) ?? null;
  }

  async createResultMessage(userId, run, response) {
    const user = game.users.get(userId);
    if (!user) return;

    const answeredAt = Number(response.answeredAt) || Date.now();
    const answerText = this.formatResponseValue(run, response);
    const titleKey = response.status === POLL_RESPONSE_STATUS.answered
      ? "Polls.Technical.AnsweredTitle"
      : response.status === POLL_RESPONSE_STATUS.cancelled
        ? "Polls.Technical.CancelledTitle"
        : "Polls.Technical.NoAnswerTitle";

    const ChatMessageClass = getChatMessageClass();
    await ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      whisper: getModeratorUserIds(),
      content: `
        <section class="dmicher-technical-card dmicher-poll-technical">
          <strong class="dmicher-technical-title">${escapeHTML(format(titleKey, { player: user.name }))}</strong>
          <small class="dmicher-technical-meta">${escapeHTML(format("Polls.Technical.ResponseDetails", {
            player: user.name,
            poll: run.name,
            timestamp: formatTimestamp(answeredAt),
            answer: answerText
          }))}</small>
        </section>`,
      flags: {
        [MODULE_ID]: {
          [FLAGS.pollResult]: {
            runId: run.id,
            templateId: run.templateId,
            userId,
            userName: user.name,
            status: response.status,
            value: foundry.utils.deepClone(response.value),
            answerText,
            type: run.type,
            pollName: run.name,
            question: run.question,
            answeredAt
          }
        }
      }
    });
  }

  getResultRows(run) {
    if (!run) return [];
    return Object.entries(run.selected).filter(([, selected]) => selected).map(([userId]) => {
      const user = game.users.get(userId);
      const response = normalizePollResponse(run.responses[userId], run.type, run.options);
      const statusConfig = POLL_RESPONSE_STATUS_CONFIG[response.status];
      return {
        userId,
        name: user?.name ?? response.userName ?? localize("Polls.Results.UnknownUser"),
        status: response.status,
        statusLabel: localize(statusConfig.labelKey),
        statusLevel: statusConfig.indicator,
        answerText: this.formatResponseValue(run, response),
        answeredAtText: response.answeredAt ? formatTimestamp(response.answeredAt) : ""
      };
    }).sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
  }

  getSummaryRows(run) {
    if (!run || run.type === POLL_TYPE.text) return [];

    const totals = new Map(run.options.map((option, index) => [option.id, {
      optionId: option.id,
      number: index + 1,
      label: option.label,
      count: 0,
      voters: []
    }]));

    for (const [userId, rawResponse] of Object.entries(run.responses)) {
      const response = normalizePollResponse(rawResponse, run.type, run.options);
      if (response.status !== POLL_RESPONSE_STATUS.answered) continue;
      const userName = game.users.get(userId)?.name ?? response.userName ?? localize("Polls.Results.UnknownUser");
      const selectedOptions = run.type === POLL_TYPE.checkbox
        ? (Array.isArray(response.value) ? response.value : [])
        : [response.value];
      for (const optionId of selectedOptions) {
        const summary = totals.get(optionId);
        if (!summary) continue;
        summary.count += 1;
        summary.voters.push(userName);
      }
    }

    return Array.from(totals.values()).sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      return left.number - right.number;
    }).map((row) => ({
      ...row,
      votersText: row.voters.length ? row.voters.join(", ") : "-"
    }));
  }

  async postResultsToChat(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Polls.Errors.Forbidden"));
      return;
    }

    const run = this.getLastRun(templateId);
    if (!run) {
      ui.notifications.warn(localize("Polls.Errors.NoResults"));
      return;
    }

    const summaryRows = this.getSummaryRows(run);
    const resultRows = this.getResultRows(run);
    const summaryTable = summaryRows.length ? `
      <table>
        <thead>
          <tr>
            <th>${escapeHTML(localize("Polls.Results.Option"))}</th>
            <th>${escapeHTML(localize("Polls.Results.Count"))}</th>
            <th>${escapeHTML(localize("Polls.Results.Voters"))}</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows.map((row) => `
            <tr>
              <td>${escapeHTML(`${row.number}. ${row.label}`)}</td>
              <td>${escapeHTML(row.count)}</td>
              <td>${escapeHTML(row.votersText)}</td>
            </tr>`).join("")}
        </tbody>
      </table>` : "";

    const content = `
      <section class="dmicher-poll-results-card">
        <h3>${escapeHTML(run.name)}</h3>
        <p>${escapeHTML(run.question)}</p>
        ${summaryTable}
        <table>
          <thead>
            <tr>
              <th>${escapeHTML(localize("Polls.Results.Voter"))}</th>
              <th>${escapeHTML(localize("Polls.Results.Answer"))}</th>
            </tr>
          </thead>
          <tbody>
            ${resultRows.map((row) => `
              <tr>
                <td>${escapeHTML(row.name)}</td>
                <td>${escapeHTML(row.answerText)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </section>`;

    const ChatMessageClass = getChatMessageClass();
    const messageData = {
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content
    };
    ChatMessageClass.applyRollMode?.(messageData, game.settings.get("core", "rollMode"));
    await ChatMessageClass.create(messageData);
  }

  formatResponseValue(run, response) {
    response = normalizePollResponse(response, run.type, run.options);
    if (response.status !== POLL_RESPONSE_STATUS.answered) {
      return localize(POLL_RESPONSE_STATUS_CONFIG[response.status].labelKey);
    }

    if (run.type === POLL_TYPE.checkbox) {
      const numbers = (Array.isArray(response.value) ? response.value : [])
        .map((optionId) => getPollOptionNumber(run.options, optionId))
        .filter(Boolean);
      return numbers.length ? numbers.join(", ") : localize("Polls.Results.EmptyAnswer");
    }

    if (run.type === POLL_TYPE.text) {
      return String(response.value ?? "") || localize("Polls.Results.EmptyAnswer");
    }

    return getPollOptionLabel(run.options, response.value) || localize("Polls.Results.EmptyAnswer");
  }

  onPollStateChanged(rawState) {
    this.state = normalizePollState(rawState);
    this.managerWindow?.onPollStateChanged();
    this.launchWindow?.onPollStateChanged?.();
    this.resultsWindow?.onPollStateChanged();
  }

  async updateState(mutator) {
    const state = clonePollState(game.settings.get(MODULE_ID, SETTINGS.polls));
    mutator(state);
    await game.settings.set(MODULE_ID, SETTINGS.polls, state);
  }
}
