import {
  FLAGS,
  MODULE_ID,
  SETTINGS,
  SOCKET_CHANNEL,
  TIMER_SOUND_SOURCES
} from "../../config.js";
import {
  confirmDialog,
  createSerialTaskQueue,
  escapeHTML,
  format,
  formatClockTime,
  formatDigitalDuration,
  getChatMessageClass,
  getChatMessageRenderHook,
  getModeratorUserIds,
  getRenderedElement,
  isModerator,
  localize,
  openSingletonApplication,
  playAudio,
  setGamePaused
} from "../../utils.js";
import {
  getCustomTimerSound,
  getCustomTimerSoundVolume,
  getRequestConfiguration
} from "../requests/request-config.js";
import { BreakTimerApplication } from "./break-timer.js";
import { TimerManagerApplication } from "./timer-manager.js";
import { TimerWindowApplication } from "./timer-window.js";
import {
  BUILTIN_BREAK_TEMPLATE_ID,
  cloneTimerTemplateState,
  createBuiltInBreakTimerTemplate,
  createEmptyTimerTemplateState,
  createStandardTimerTemplate,
  listTimerTemplates,
  normalizeTimerTemplateState,
  timerToTemplateInput
} from "./timer-template-utils.js";
import {
  TIMER_DISPLAY_STYLE,
  TIMER_KIND,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_TICK_MS,
  TIMER_VISIBILITY,
  calculateRoundedDeadline,
  clampTimerVolume,
  cloneTimerState,
  createEmptyTimerState,
  isTimerExpired,
  listTimers,
  normalizeTimerState,
  parseDeadlineInput,
  parseDurationInput
} from "./timer-utils.js";

export class TimerTool {
  constructor({ volumeController = null } = {}) {
    this.volumeController = volumeController;
    this.state = createEmptyTimerState();
    this.templateState = createEmptyTimerTemplateState();
    this.managerWindow = null;
    this.breakWindow = null;
    this.timerWindows = new Map();
    this.pendingForcedOpens = new Map();
    this.pendingForcedOpenRetry = null;
    this.runStateTask = createSerialTaskQueue();
    this.runTemplateStateTask = createSerialTaskQueue();
    this.runAlertPersistenceTask = createSerialTaskQueue();
    this.alertedExpirations = {};
    this.tickHandle = null;
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
    this.tick = this.tick.bind(this);
  }

  registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.timers, {
      scope: "world",
      config: false,
      type: Object,
      default: createEmptyTimerState(),
      onChange: (value) => this.onTimersSettingChanged(value)
    });

    game.settings.register(MODULE_ID, SETTINGS.timerTemplates, {
      scope: "world",
      config: false,
      type: Object,
      default: createEmptyTimerTemplateState(),
      onChange: (value) => this.onTimerTemplatesSettingChanged(value)
    });

    game.settings.register(MODULE_ID, SETTINGS.timerAlertedExpirations, {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });
  }

  registerHooks() {
    Hooks.on(getChatMessageRenderHook(), this.renderChatMessage);
  }

  activate() {
    this.state = normalizeTimerState(game.settings.get(MODULE_ID, SETTINGS.timers));
    this.templateState = normalizeTimerTemplateState(
      game.settings.get(MODULE_ID, SETTINGS.timerTemplates)
    );
    this.alertedExpirations = this.readAlertedExpirations();
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    this.tickHandle = window.setInterval(this.tick, TIMER_TICK_MS);
    for (const src of Object.values(TIMER_SOUND_SOURCES)) {
      void foundry.audio.AudioHelper.preloadSound(src);
    }
    for (const type of ["timer", "break"]) {
      const src = getCustomTimerSound(type);
      if (src) void foundry.audio.AudioHelper.preloadSound(src);
    }
    window.setTimeout(() => this.openExistingPublicTimers(), 250);
    this.tick();
  }

  openManager() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    this.managerWindow = openSingletonApplication(
      this.managerWindow,
      () => new TimerManagerApplication(this)
    );
    return this.managerWindow;
  }

  openBreakTimer() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    this.breakWindow = openSingletonApplication(
      this.breakWindow,
      () => new BreakTimerApplication(this)
    );
    return this.breakWindow;
  }

  forgetBreakWindow(app) {
    if (this.breakWindow === app) this.breakWindow = null;
  }

  getTimer(timerId) {
    return this.state.timers[String(timerId)] ?? null;
  }

  getTimerTemplate(templateId) {
    const template = this.templateState.templates[String(templateId)] ?? null;
    return template ? this.prepareTimerTemplate(template) : null;
  }

  getTimerTemplates() {
    return listTimerTemplates(this.templateState).map((template) => {
      return this.prepareTimerTemplate(template);
    });
  }

  prepareTimerTemplate(template) {
    return {
      ...template,
      name: template.id === BUILTIN_BREAK_TEMPLATE_ID
        ? localize("Timers.Break.TimerName")
        : template.name
    };
  }

  async saveTimerTemplate(input, templateId = "") {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));

    const source = input && (typeof input === "object") ? input : {};
    const requestedId = String(templateId ?? "").trim();
    const now = Date.now();
    let savedTemplate = null;

    if (requestedId !== BUILTIN_BREAK_TEMPLATE_ID) {
      const name = String(source.name ?? "").trim();
      if (!name) throw new Error(localize("Timers.Templates.NameRequired"));
      const mode = source.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
      const validTime = mode === TIMER_MODE.deadline
        ? parseDeadlineInput(source.time, now)
        : parseDurationInput(source.time);
      if (!validTime) throw new Error(localize("Timers.Templates.BadTime"));
    }

    await this.updateTemplateState((state) => {
      if (requestedId === BUILTIN_BREAK_TEMPLATE_ID) {
        const existing = state.templates[BUILTIN_BREAK_TEMPLATE_ID] ?? {};
        const changes = {};
        for (const field of ["style", "sound", "volume"]) {
          if (Object.hasOwn(source, field)) changes[field] = source[field];
        }
        savedTemplate = createBuiltInBreakTimerTemplate({
          ...existing,
          ...changes,
          updatedAt: now
        }, now);
        state.templates[BUILTIN_BREAK_TEMPLATE_ID] = savedTemplate;
        return;
      }

      const existing = requestedId ? state.templates[requestedId] : null;
      if (requestedId && !existing) {
        throw new Error(localize("Timers.Templates.NotFound"));
      }
      const id = requestedId || foundry.utils.randomID();
      savedTemplate = createStandardTimerTemplate(source, {
        id,
        now,
        createdAt: existing?.createdAt ?? now
      });
      if (!savedTemplate) throw new Error(localize("Timers.Templates.Invalid"));
      state.templates[id] = savedTemplate;
    });

    return savedTemplate ? this.prepareTimerTemplate(savedTemplate) : null;
  }

  async saveTimerAsTemplate(timerId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const timer = this.getTimer(timerId);
    if (!timer) throw new Error(localize("Timers.Errors.NotFound"));
    if (timer.templateId) return this.getTimerTemplate(timer.templateId);

    const template = await this.saveTimerTemplate(timerToTemplateInput(timer));
    if (!template) return null;
    await this.updateState((state) => {
      const current = state.timers[timer.id];
      if (current && !current.templateId) current.templateId = template.id;
    });
    return template;
  }

  async startTimerTemplate(templateId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const id = String(templateId ?? "");
    const template = this.templateState.templates[id];
    if (!template) throw new Error(localize("Timers.Templates.NotFound"));
    if (id === BUILTIN_BREAK_TEMPLATE_ID) return this.openBreakTimer();

    return this.startTimer({
      name: template.name,
      mode: template.mode,
      time: template.time,
      visibility: template.visibility,
      style: template.style,
      sound: template.sound,
      volume: template.volume,
      templateId: template.id
    });
  }

  async confirmDeleteTimerTemplate(templateId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return false;
    }

    const template = this.getTimerTemplate(templateId);
    if (!template) {
      ui.notifications.warn(localize("Timers.Templates.NotFound"));
      return false;
    }
    if (template.id === BUILTIN_BREAK_TEMPLATE_ID) {
      ui.notifications.warn(localize("Timers.Templates.BuiltInDeleteForbidden"));
      return false;
    }

    const confirmed = await confirmDialog({
      title: localize("Timers.Templates.DeleteTitle"),
      content: `<p>${escapeHTML(format("Timers.Templates.DeleteConfirm", { name: template.name }))}</p>`,
      yes: localize("Timers.Templates.DeleteYes"),
      no: localize("Timers.Templates.DeleteNo"),
      icon: "fa-solid fa-trash"
    });
    if (!confirmed) return false;
    await this.deleteTimerTemplate(template.id);
    return true;
  }

  async deleteTimerTemplate(templateId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const id = String(templateId ?? "");
    if (id === BUILTIN_BREAK_TEMPLATE_ID) {
      throw new Error(localize("Timers.Templates.BuiltInDeleteForbidden"));
    }

    await this.updateTemplateState((state) => {
      if (!state.templates[id]) throw new Error(localize("Timers.Templates.NotFound"));
      delete state.templates[id];
    });
  }

  getTimerCount() {
    return this.getVisibleTimers().length;
  }

  getVisibleTimers(user = game.user) {
    return listTimers(this.state).filter((timer) => this.canViewTimer(timer, user));
  }

  canViewTimer(timer, user = game.user) {
    return timer?.visibility === TIMER_VISIBILITY.public || isModerator(user);
  }

  getSoundSource(sound, configuration = getRequestConfiguration()) {
    if (Object.hasOwn(TIMER_SOUND_SOURCES, sound)) return TIMER_SOUND_SOURCES[sound];
    if (sound === TIMER_SOUND.custom) return getCustomTimerSound("timer", configuration);
    if (sound === TIMER_SOUND.breakCustom) return getCustomTimerSound("break", configuration);
    return "";
  }

  getSoundBaseVolume(sound, configuration = getRequestConfiguration()) {
    if (sound === TIMER_SOUND.custom) return getCustomTimerSoundVolume("timer", configuration);
    if (sound === TIMER_SOUND.breakCustom) return getCustomTimerSoundVolume("break", configuration);
    return 1;
  }

  async playTimerSound(sound, launchVolume = 1) {
    const configuration = getRequestConfiguration();
    const src = this.getSoundSource(sound, configuration);
    if (!src) return null;
    const baseVolume = this.getSoundBaseVolume(sound, configuration);
    if (this.volumeController?.playTimer) {
      return this.volumeController.playTimer(src, baseVolume, launchVolume);
    }
    return playAudio(src, {
      broadcast: false,
      volume: clampTimerVolume(baseVolume) * clampTimerVolume(launchVolume)
    });
  }

  openExistingPublicTimers() {
    for (const timer of listTimers(this.state)) {
      if (timer.visibility !== TIMER_VISIBILITY.public) continue;
      this.openTimerWindow(timer.id, { force: false });
    }
  }

  async startTimer(input) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));

    const now = Date.now();
    const kind = input.kind === TIMER_KIND.break ? TIMER_KIND.break : TIMER_KIND.standard;
    if (kind === TIMER_KIND.break && this.getActiveBreakTimer(now)) {
      throw new Error(localize("Timers.Break.AlreadyActive"));
    }
    const mode = input.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
    const name = kind === TIMER_KIND.break
      ? localize("Timers.Break.TimerName")
      : String(input.name ?? "").trim().slice(0, 120) || format("Timers.DefaultName", { number: this.getTimerCount() + 1 });
    const visibility = kind === TIMER_KIND.break
      ? TIMER_VISIBILITY.public
      : input.visibility === TIMER_VISIBILITY.private
        ? TIMER_VISIBILITY.private
        : TIMER_VISIBILITY.public;
    const templateId = kind === TIMER_KIND.break
      ? BUILTIN_BREAK_TEMPLATE_ID
      : String(input.templateId ?? "").trim().slice(0, 80);
    const style = input.style === TIMER_DISPLAY_STYLE.compact ? TIMER_DISPLAY_STYLE.compact : TIMER_DISPLAY_STYLE.prominent;
    const sound = this.getSoundSource(input.sound) ? input.sound : TIMER_SOUND.none;
    const volume = clampTimerVolume(input.volume);
    const explicitDuration = Number(input.durationMilliseconds);
    const roundedDurationMinutes = Number(input.roundedDurationMinutes);
    const duration = mode === TIMER_MODE.duration
      ? parseDurationInput(input.time)
      : null;
    let endsAt;
    if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
      endsAt = now + explicitDuration;
    } else if (Number.isFinite(roundedDurationMinutes) && roundedDurationMinutes > 0) {
      endsAt = calculateRoundedDeadline(roundedDurationMinutes, now);
    } else if (mode === TIMER_MODE.duration) {
      endsAt = now + Number(duration);
    } else {
      endsAt = Number(input.deadlineTimestamp) || parseDeadlineInput(input.time, now);
    }

    if (!endsAt || !Number.isFinite(endsAt)) throw new Error(localize("Timers.Errors.BadTime"));
    const totalDuration = endsAt - now;
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) throw new Error(localize("Timers.Errors.BadTime"));
    if (typeof input.onDeadlineCalculated === "function") input.onDeadlineCalculated(endsAt);

    const timer = {
      id: foundry.utils.randomID(),
      name,
      mode,
      kind,
      templateId,
      startAt: now,
      endsAt,
      duration: totalDuration,
      visibility,
      style,
      sound,
      volume,
      createdBy: game.user.id,
      createdByName: game.user.name,
      createdAt: now
    };

    await this.updateState((state) => {
      if (kind === TIMER_KIND.break) {
        const activeBreak = listTimers(state).find((candidate) => {
          return candidate.kind === TIMER_KIND.break && !isTimerExpired(candidate, now);
        });
        if (activeBreak) throw new Error(localize("Timers.Break.AlreadyActive"));
      }
      state.timers[timer.id] = timer;
    });
    try {
      const message = await this.createTimerChatMessage(timer);
      if (!message) throw new Error(localize("Timers.Errors.StartFailed"));
    } catch (error) {
      await this.rollbackTimerStart(timer.id);
      throw error;
    }

    try {
      this.openTimerWindow(timer.id, { force: true, displayStyle: style });
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to open timer window`, error);
    }
    if (visibility === TIMER_VISIBILITY.public) {
      try {
        game.socket.emit(SOCKET_CHANNEL, {
          action: "timerStarted",
          timerId: timer.id
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Unable to broadcast timer start`, error);
      }
    }

    return timer;
  }

  async startBreakTimer(descriptor, { onDeadlineCalculated } = {}) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    if (this.getActiveBreakTimer()) {
      throw new Error(localize("Timers.Break.AlreadyActive"));
    }

    const source = Number.isFinite(Number(descriptor))
      ? { roundedDurationMinutes: Number(descriptor) }
      : descriptor && (typeof descriptor === "object")
        ? descriptor
        : {};
    const template = this.templateState.templates[BUILTIN_BREAK_TEMPLATE_ID]
      ?? createBuiltInBreakTimerTemplate();
    let sound = template.sound;
    if (sound !== TIMER_SOUND.none && !this.getSoundSource(sound)) sound = TIMER_SOUND.signal1;
    const mode = source.mode === TIMER_MODE.deadline
      ? TIMER_MODE.deadline
      : source.mode === TIMER_MODE.duration
        ? TIMER_MODE.duration
        : Object.hasOwn(source, "durationMilliseconds")
          ? TIMER_MODE.duration
          : TIMER_MODE.deadline;

    return this.startPausedTimer({
      name: localize("Timers.Break.TimerName"),
      mode,
      kind: TIMER_KIND.break,
      templateId: BUILTIN_BREAK_TEMPLATE_ID,
      roundedDurationMinutes: source.roundedDurationMinutes,
      durationMilliseconds: source.durationMilliseconds,
      deadlineTimestamp: source.deadlineTimestamp,
      visibility: TIMER_VISIBILITY.public,
      style: template.style,
      sound,
      volume: template.volume,
      onDeadlineCalculated: source.onDeadlineCalculated ?? onDeadlineCalculated
    });
  }

  getActiveBreakTimer(now = Date.now()) {
    return listTimers(this.state).find((timer) => {
      return timer.kind === TIMER_KIND.break && !isTimerExpired(timer, now);
    }) ?? null;
  }

  async repeatTimer(timerId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const timer = this.getTimer(timerId);
    if (!timer) throw new Error(localize("Timers.Errors.NotFound"));
    if (timer.kind === TIMER_KIND.break && this.getActiveBreakTimer()) {
      throw new Error(localize("Timers.Break.AlreadyActive"));
    }

    const input = {
      name: timer.name,
      mode: timer.mode,
      kind: timer.kind,
      templateId: timer.templateId,
      durationMilliseconds: timer.duration,
      visibility: timer.visibility,
      style: timer.style,
      sound: timer.sound,
      volume: timer.volume
    };
    return timer.kind === TIMER_KIND.break
      ? this.startPausedTimer({
        ...input,
        name: localize("Timers.Break.TimerName"),
        templateId: BUILTIN_BREAK_TEMPLATE_ID,
        visibility: TIMER_VISIBILITY.public
      })
      : this.startTimer(input);
  }

  async confirmRepeatTimer(timerId) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    const timer = this.getTimer(timerId);
    if (!timer) {
      ui.notifications.warn(localize("Timers.Errors.NotFound"));
      return null;
    }
    if (timer.kind === TIMER_KIND.break && this.getActiveBreakTimer()) {
      ui.notifications.warn(localize("Timers.Break.AlreadyActive"));
      return null;
    }

    const defaultAction = isTimerExpired(timer) ? "delete" : "keep";
    const content = `
      <div class="dmicher-timer-repeat-form">
        <p>${escapeHTML(format("Timers.Repeat.Prompt", { name: timer.name }))}</p>
        <label>
          <input type="radio" name="repeatDisposition" value="delete" ${defaultAction === "delete" ? "checked" : ""}>
          ${escapeHTML(localize("Timers.Repeat.Delete"))}
        </label>
        <label>
          <input type="radio" name="repeatDisposition" value="keep" ${defaultAction === "keep" ? "checked" : ""}>
          ${escapeHTML(localize("Timers.Repeat.Keep"))}
        </label>
      </div>`;
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    let action = null;

    if (DialogV2?.prompt) {
      action = await DialogV2.prompt({
        window: { title: localize("Timers.Repeat.Title") },
        content,
        modal: true,
        rejectClose: false,
        buttons: [{
          action: "cancel",
          label: localize("Timers.Repeat.Cancel"),
          icon: "fa-solid fa-xmark"
        }],
        ok: {
          label: localize("Timers.Repeat.Confirm"),
          icon: "fa-solid fa-rotate-right",
          callback: (_event, button) => {
            return button?.form?.elements?.repeatDisposition?.value ?? defaultAction;
          }
        }
      });
    } else {
      const confirmed = await confirmDialog({
        title: localize("Timers.Repeat.Title"),
        content,
        yes: localize("Timers.Repeat.Confirm"),
        no: localize("Timers.Repeat.Cancel"),
        icon: "fa-solid fa-rotate-right"
      });
      action = confirmed ? defaultAction : null;
    }

    if (action !== "delete" && action !== "keep") return null;
    const repeatedTimer = await this.repeatTimer(timer.id);
    if (action === "delete") await this.deleteTimer(timer.id);
    return repeatedTimer;
  }

  async startPausedTimer(input) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const wasPaused = Boolean(game.paused);
    try {
      await setGamePaused(true);
      return await this.startTimer(input);
    } catch (error) {
      const persistedState = normalizeTimerState(
        game.settings.get(MODULE_ID, SETTINGS.timers)
      );
      const activeBreakExists = listTimers(persistedState).some((timer) => {
        return timer.kind === TIMER_KIND.break && !isTimerExpired(timer);
      });
      if (!wasPaused && !activeBreakExists) {
        try {
          await setGamePaused(false);
        } catch (rollbackError) {
          console.error(`${MODULE_ID} | Unable to restore pause state`, rollbackError);
        }
      }
      throw error;
    }
  }

  async rollbackTimerStart(timerId) {
    try {
      await this.updateState((state) => {
        delete state.timers[timerId];
      });
    } catch (rollbackError) {
      console.error(`${MODULE_ID} | Unable to roll back timer start`, rollbackError);
    }

    const message = Array.from(game.messages ?? []).find((candidate) => {
      return candidate.getFlag(MODULE_ID, FLAGS.timer)?.id === timerId;
    });
    if (!message) return;

    try {
      await message.delete();
    } catch (rollbackError) {
      console.error(`${MODULE_ID} | Unable to remove rolled back timer message`, rollbackError);
    }
  }

  async createTimerChatMessage(timer) {
    const ChatMessageClass = getChatMessageClass();
    const messageData = {
      id: timer.id,
      kind: "started"
    };
    return ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content: this.buildTimerChatMessageContent(timer),
      whisper: timer.visibility === TIMER_VISIBILITY.private ? getModeratorUserIds() : undefined,
      flags: {
        [MODULE_ID]: {
          [FLAGS.timer]: messageData
        }
      }
    });
  }

  buildTimerChatMessageContent(timer) {
    return `
      <section class="dmicher-timer-chat-card" data-timer-chat-card>
        <h3 data-timer-chat-heading>${escapeHTML(localize("Timers.Chat.StartedTitle"))}</h3>
        <strong data-timer-chat-name>${escapeHTML(timer.name)}</strong>
        <small data-timer-chat-details>${escapeHTML(this.getTimerDetailsText(timer))}</small>
        <div class="dmicher-timer-chat-actions">
          <button type="button" data-timer-action="watch" data-timer-id="${escapeHTML(timer.id)}">
            <i class="fa-solid fa-eye" aria-hidden="true"></i>
            <span data-timer-action-label="watch">${escapeHTML(localize("Timers.Chat.Watch"))}</span>
          </button>
        </div>
      </section>`;
  }

  getTimerDetailsText(timer) {
    return format("Timers.Chat.Details", {
      deadline: formatClockTime(timer.endsAt),
      duration: formatDigitalDuration(timer.duration)
    });
  }

  renderChatMessage(message, html) {
    const timerData = message.getFlag(MODULE_ID, FLAGS.timer);
    if (!timerData || timerData.kind !== "started") return;

    const timer = this.getTimer(timerData.id);
    const root = getRenderedElement(html);
    const card = root?.querySelector("[data-timer-chat-card]");
    if (!card) return;

    const heading = card.querySelector("[data-timer-chat-heading]");
    const details = card.querySelector("[data-timer-chat-details]");
    const button = card.querySelector("[data-timer-action='watch']");
    const label = card.querySelector("[data-timer-action-label='watch']");

    if (heading) heading.textContent = localize("Timers.Chat.StartedTitle");
    if (details && timer) details.textContent = this.getTimerDetailsText(timer);
    if (label) label.textContent = localize("Timers.Chat.Watch");

    button?.addEventListener("click", (event) => {
      event.preventDefault();
      this.openTimerWindow(timer?.id ?? timerData.id, { force: true });
    });
  }

  openTimerWindow(timerId, options = {}) {
    const timer = this.getTimer(timerId);
    if (!timer || !this.canViewTimer(timer)) {
      ui.notifications.warn(localize("Timers.Errors.NotFound"));
      return null;
    }

    let app = this.timerWindows.get(timer.id);
    if (!app) {
      app = new TimerWindowApplication(this, timer.id, {
        displayStyle: options.displayStyle ?? timer.style
      });
      this.timerWindows.set(timer.id, app);
    } else if (options.displayStyle) {
      app.setDisplayStyle(options.displayStyle);
    }

    if (isTimerExpired(timer)) app.setDisplayStyle(TIMER_DISPLAY_STYLE.prominent);
    if (app.rendered) {
      if (options.force) app.bringToFront();
      app.refreshTime();
    } else {
      void app.render({ force: true }).then(() => {
        if (options.force) app.bringToFront();
      });
    }
    return app;
  }

  forgetTimerWindow(timerId, app) {
    if (this.timerWindows.get(timerId) === app) this.timerWindows.delete(timerId);
  }

  async confirmDeleteTimer(timerId) {
    await this.confirmRemoveTimer(timerId, {
      scope: "Delete",
      icon: "fa-solid fa-trash"
    });
  }

  async confirmCancelTimer(timerId) {
    await this.confirmRemoveTimer(timerId, {
      scope: "Cancel",
      icon: "fa-solid fa-ban"
    });
  }

  async confirmRemoveTimer(timerId, { scope, icon }) {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const timer = this.getTimer(timerId);
    if (!timer) {
      ui.notifications.warn(localize("Timers.Errors.NotFound"));
      return;
    }

    if (!isTimerExpired(timer)) {
      const confirmed = await confirmDialog({
        title: localize(`Timers.${scope}.Title`),
        content: `<p>${escapeHTML(format(`Timers.${scope}.Confirm`, { name: timer.name }))}</p>`,
        yes: localize(`Timers.${scope}.Yes`),
        no: localize(`Timers.${scope}.No`),
        icon
      });
      if (!confirmed) return;
    }

    await this.deleteTimer(timer.id);
  }

  async confirmDeleteExpiredTimers() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const expiredTimers = listTimers(this.state).filter((timer) => isTimerExpired(timer));
    if (!expiredTimers.length) {
      ui.notifications.warn(localize("Timers.DeleteExpired.None"));
      return;
    }

    const confirmed = await confirmDialog({
      title: localize("Timers.DeleteExpired.Title"),
      content: `<p>${escapeHTML(format("Timers.DeleteExpired.Confirm", { count: expiredTimers.length }))}</p>`,
      yes: localize("Timers.DeleteExpired.Yes"),
      no: localize("Timers.DeleteExpired.No"),
      icon: "fa-solid fa-trash"
    });
    if (!confirmed) return;

    await this.deleteTimers(expiredTimers.map((timer) => timer.id));
  }

  async deleteTimer(timerId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    await this.deleteTimers([timerId]);
  }

  async deleteTimers(timerIds) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const ids = new Set(timerIds.map((timerId) => String(timerId)));
    if (!ids.size) return;

    this.closeTimerWindows(ids);
    await this.updateState((state) => {
      for (const timerId of ids) delete state.timers[timerId];
    });
  }

  closeTimerWindows(timerIds) {
    for (const timerId of timerIds) {
      this.pendingForcedOpens.delete(timerId);
      const app = this.timerWindows.get(timerId);
      if (!app) continue;
      void app.close();
      this.timerWindows.delete(timerId);
    }
  }

  onTimersSettingChanged(rawState) {
    this.state = normalizeTimerState(rawState);
    this.flushPendingForcedOpens();
    this.managerWindow?.onTimerStateChanged();

    for (const [timerId, app] of Array.from(this.timerWindows.entries())) {
      if (!this.getTimer(timerId) || !this.canViewTimer(this.getTimer(timerId))) {
        void app.close();
        this.timerWindows.delete(timerId);
      } else {
        app.onTimerStateChanged();
      }
    }
  }

  onTimerTemplatesSettingChanged(rawState) {
    this.templateState = normalizeTimerTemplateState(rawState);
    this.managerWindow?.onTimerTemplateStateChanged?.();
  }

  receiveSocketMessage(payload) {
    if (payload?.action === "timerStarted") {
      this.queueForcedOpen(payload.timerId);
    }
  }

  queueForcedOpen(timerId, attempts = 8) {
    if (!timerId) return;
    this.pendingForcedOpens.set(String(timerId), attempts);
    this.flushPendingForcedOpens();
  }

  flushPendingForcedOpens({ consumeAttempt = false } = {}) {
    let retryNeeded = false;
    for (const [timerId, attempts] of Array.from(this.pendingForcedOpens.entries())) {
      const timer = this.getTimer(timerId);
      if (timer?.visibility === TIMER_VISIBILITY.public) {
        this.pendingForcedOpens.delete(timerId);
        this.openTimerWindow(timer.id, { force: true });
        continue;
      }

      if (attempts <= 0 || (consumeAttempt && attempts <= 1)) {
        this.pendingForcedOpens.delete(timerId);
        continue;
      }

      if (consumeAttempt) this.pendingForcedOpens.set(timerId, attempts - 1);
      retryNeeded = true;
    }

    if (retryNeeded && !this.pendingForcedOpenRetry) {
      this.pendingForcedOpenRetry = window.setTimeout(() => {
        this.pendingForcedOpenRetry = null;
        this.flushPendingForcedOpens({ consumeAttempt: true });
      }, 250);
    }
  }

  tick() {
    this.managerWindow?.onTimerTick();
    for (const app of this.timerWindows.values()) app.onTimerTick();
    this.checkExpiredTimers();
  }

  checkExpiredTimers() {
    const alerted = this.getAlertedExpirations();
    const timerIds = new Set(Object.keys(this.state.timers));
    let changed = false;

    for (const timerId of Object.keys(alerted)) {
      if (timerIds.has(timerId)) continue;
      delete alerted[timerId];
      changed = true;
    }

    for (const timer of this.getVisibleTimers()) {
      if (!isTimerExpired(timer) || alerted[timer.id]) continue;
      alerted[timer.id] = true;
      changed = true;
      this.openTimerWindow(timer.id, {
        force: true,
        displayStyle: TIMER_DISPLAY_STYLE.prominent
      });
      void this.playExpiredSound(timer);
    }

    if (changed) this.persistAlertedExpirations(alerted);
  }

  getAlertedExpirations() {
    return { ...this.alertedExpirations };
  }

  readAlertedExpirations() {
    const alerted = game.settings.get(MODULE_ID, SETTINGS.timerAlertedExpirations);
    return alerted && (typeof alerted === "object") ? { ...alerted } : {};
  }

  persistAlertedExpirations(alerted) {
    this.alertedExpirations = { ...alerted };
    const snapshot = { ...alerted };
    void this.runAlertPersistenceTask(async () => {
      await game.settings.set(MODULE_ID, SETTINGS.timerAlertedExpirations, snapshot);
    }).catch((error) => {
      console.warn(`${MODULE_ID} | Unable to persist timer alerts`, error);
    });
  }

  async playExpiredSound(timer) {
    try {
      await this.playTimerSound(timer?.sound, timer?.volume);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to play timer expiration sound`, error);
    }
  }

  updateState(mutator) {
    return this.runStateTask(async () => {
      const state = cloneTimerState(game.settings.get(MODULE_ID, SETTINGS.timers));
      mutator(state);
      await game.settings.set(MODULE_ID, SETTINGS.timers, state);
    });
  }

  updateTemplateState(mutator) {
    return this.runTemplateStateTask(async () => {
      const state = cloneTimerTemplateState(
        game.settings.get(MODULE_ID, SETTINGS.timerTemplates)
      );
      mutator(state);
      await game.settings.set(MODULE_ID, SETTINGS.timerTemplates, state);
    });
  }

}
