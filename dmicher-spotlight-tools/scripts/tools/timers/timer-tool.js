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
    this.managerWindow = null;
    this.breakWindow = null;
    this.timerWindows = new Map();
    this.pendingForcedOpens = new Map();
    this.pendingForcedOpenRetry = null;
    this.runStateTask = createSerialTaskQueue();
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
    const mode = input.mode === TIMER_MODE.deadline ? TIMER_MODE.deadline : TIMER_MODE.duration;
    const name = String(input.name ?? "").trim().slice(0, 120) || format("Timers.DefaultName", { number: this.getTimerCount() + 1 });
    const visibility = input.visibility === TIMER_VISIBILITY.private ? TIMER_VISIBILITY.private : TIMER_VISIBILITY.public;
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
      kind: input.kind === TIMER_KIND.break ? TIMER_KIND.break : TIMER_KIND.standard,
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

  async startBreakTimer(minutes, { onDeadlineCalculated } = {}) {
    return this.startPausedTimer({
      name: localize("Timers.Break.TimerName"),
      mode: TIMER_MODE.deadline,
      kind: TIMER_KIND.break,
      roundedDurationMinutes: minutes,
      visibility: TIMER_VISIBILITY.public,
      style: TIMER_DISPLAY_STYLE.prominent,
      sound: this.getSoundSource(TIMER_SOUND.breakCustom) ? TIMER_SOUND.breakCustom : TIMER_SOUND.signal1,
      volume: 1,
      onDeadlineCalculated
    });
  }

  async repeatTimer(timerId) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const timer = this.getTimer(timerId);
    if (!timer) throw new Error(localize("Timers.Errors.NotFound"));

    const input = {
      name: timer.name,
      mode: timer.mode,
      kind: timer.kind,
      durationMilliseconds: timer.duration,
      visibility: timer.visibility,
      style: timer.style,
      sound: timer.sound,
      volume: timer.volume
    };
    return timer.kind === TIMER_KIND.break
      ? this.startPausedTimer(input)
      : this.startTimer(input);
  }

  async startPausedTimer(input) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    const wasPaused = Boolean(game.paused);
    try {
      await setGamePaused(true);
      return await this.startTimer(input);
    } catch (error) {
      if (!wasPaused) {
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

}
