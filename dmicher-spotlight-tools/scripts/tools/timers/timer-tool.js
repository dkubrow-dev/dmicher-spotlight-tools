import {
  FLAGS,
  MODULE_ID,
  SETTINGS,
  SOCKET_CHANNEL,
  TIMER_SOUND_SOURCES
} from "../../config.js";
import {
  escapeHTML,
  format,
  formatClockTime,
  formatDigitalDuration,
  getChatMessageClass,
  isModerator,
  localize
} from "../../utils.js";
import { BreakTimerApplication } from "./break-timer.js";
import { TimerManagerApplication } from "./timer-manager.js";
import { TimerWindowApplication } from "./timer-window.js";
import {
  TIMER_DISPLAY_STYLE,
  TIMER_MODE,
  TIMER_SOUND,
  TIMER_TICK_MS,
  TIMER_VISIBILITY,
  cloneTimerState,
  createEmptyTimerState,
  isTimerExpired,
  listTimers,
  normalizeTimerState,
  parseDeadlineInput,
  parseDurationInput
} from "./timer-utils.js";

const { DialogV2 } = foundry.applications.api;

export class TimerTool {
  constructor() {
    this.state = createEmptyTimerState();
    this.managerWindow = null;
    this.breakWindow = null;
    this.timerWindows = new Map();
    this.pendingForcedOpens = new Map();
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

  activate() {
    this.state = normalizeTimerState(game.settings.get(MODULE_ID, SETTINGS.timers));
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    this.tickHandle = window.setInterval(this.tick, TIMER_TICK_MS);
    for (const src of Object.values(TIMER_SOUND_SOURCES)) {
      void foundry.audio.AudioHelper.preloadSound(src);
    }
    window.setTimeout(() => this.openExistingPublicTimers(), 250);
    this.tick();
  }

  openManager() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    if (this.managerWindow?.rendered) {
      this.managerWindow.bringToFront();
      return this.managerWindow;
    }

    this.managerWindow = new TimerManagerApplication(this);
    void this.managerWindow.render({ force: true });
    return this.managerWindow;
  }

  openBreakTimer() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return null;
    }

    if (this.breakWindow?.rendered) {
      this.breakWindow.bringToFront();
      return this.breakWindow;
    }

    this.breakWindow = new BreakTimerApplication(this);
    void this.breakWindow.render({ force: true });
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
    const sound = Object.hasOwn(TIMER_SOUND_SOURCES, input.sound) ? input.sound : TIMER_SOUND.none;
    const duration = mode === TIMER_MODE.duration
      ? parseDurationInput(input.time)
      : null;
    const endsAt = mode === TIMER_MODE.duration
      ? now + Number(duration)
      : Number(input.deadlineTimestamp) || parseDeadlineInput(input.time, now);

    if (!endsAt || !Number.isFinite(endsAt)) throw new Error(localize("Timers.Errors.BadTime"));
    const totalDuration = endsAt - now;
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) throw new Error(localize("Timers.Errors.BadTime"));

    const timer = {
      id: foundry.utils.randomID(),
      name,
      mode,
      startAt: now,
      endsAt,
      duration: totalDuration,
      visibility,
      style,
      sound,
      messageId: "",
      createdBy: game.user.id,
      createdByName: game.user.name,
      createdAt: now
    };

    const state = cloneTimerState(this.state);
    state.timers[timer.id] = timer;
    await game.settings.set(MODULE_ID, SETTINGS.timers, state);

    const message = await this.createTimerChatMessage(timer);
    if (message?.id) {
      const latestState = cloneTimerState(game.settings.get(MODULE_ID, SETTINGS.timers));
      if (latestState.timers[timer.id]) {
        latestState.timers[timer.id].messageId = message.id;
        await game.settings.set(MODULE_ID, SETTINGS.timers, latestState);
      }
    }

    this.openTimerWindow(timer.id, { force: true, displayStyle: style });
    if (visibility === TIMER_VISIBILITY.public) {
      game.socket.emit(SOCKET_CHANNEL, {
        action: "timerStarted",
        timerId: timer.id
      });
    }

    return timer;
  }

  async startBreakTimer(deadlineTimestamp) {
    if (!isModerator()) throw new Error(localize("Timers.Errors.Forbidden"));
    await game.togglePause(true, { broadcast: true });
    return this.startTimer({
      name: localize("Timers.Break.TimerName"),
      mode: TIMER_MODE.deadline,
      deadlineTimestamp,
      visibility: TIMER_VISIBILITY.public,
      style: TIMER_DISPLAY_STYLE.prominent,
      sound: TIMER_SOUND.signal1
    });
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
      whisper: timer.visibility === TIMER_VISIBILITY.private ? this.getModeratorUserIds() : undefined,
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
    const card = html.querySelector("[data-timer-chat-card]");
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
    if (!isModerator()) {
      ui.notifications.warn(localize("Timers.Errors.Forbidden"));
      return;
    }

    const timer = this.getTimer(timerId);
    if (!timer) {
      ui.notifications.warn(localize("Timers.Errors.NotFound"));
      return;
    }

    const confirmed = await this.confirm({
      title: localize("Timers.Delete.Title"),
      content: `<p>${escapeHTML(format("Timers.Delete.Confirm", { name: timer.name }))}</p>`,
      yes: localize("Timers.Delete.Yes"),
      no: localize("Timers.Delete.No")
    });
    if (!confirmed) return;

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

    const confirmed = await this.confirm({
      title: localize("Timers.DeleteExpired.Title"),
      content: `<p>${escapeHTML(format("Timers.DeleteExpired.Confirm", { count: expiredTimers.length }))}</p>`,
      yes: localize("Timers.DeleteExpired.Yes"),
      no: localize("Timers.DeleteExpired.No")
    });
    if (!confirmed) return;

    await this.deleteTimers(expiredTimers.map((timer) => timer.id));
  }

  async confirm({ title, content, yes, no }) {
    if (DialogV2?.confirm) {
      return DialogV2.confirm({
        window: { title },
        content,
        modal: true,
        rejectClose: false,
        yes: {
          label: yes,
          icon: "fa-solid fa-trash"
        },
        no: {
          label: no
        }
      });
    }
    return window.confirm(`${title}\n\n${content.replace(/<[^>]+>/g, "")}`);
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
    const state = cloneTimerState(game.settings.get(MODULE_ID, SETTINGS.timers));
    for (const timerId of ids) delete state.timers[timerId];
    await game.settings.set(MODULE_ID, SETTINGS.timers, state);
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

  flushPendingForcedOpens() {
    for (const [timerId, attempts] of Array.from(this.pendingForcedOpens.entries())) {
      const timer = this.getTimer(timerId);
      if (timer?.visibility === TIMER_VISIBILITY.public) {
        this.pendingForcedOpens.delete(timerId);
        this.openTimerWindow(timer.id, { force: true });
        continue;
      }

      if (attempts <= 0) {
        this.pendingForcedOpens.delete(timerId);
        continue;
      }

      this.pendingForcedOpens.set(timerId, attempts - 1);
      window.setTimeout(() => this.flushPendingForcedOpens(), 250);
    }
  }

  tick() {
    this.managerWindow?.onTimerTick();
    for (const app of this.timerWindows.values()) app.onTimerTick();
    this.checkExpiredTimers();
  }

  checkExpiredTimers() {
    const alerted = this.getAlertedExpirations();
    for (const timer of this.getVisibleTimers()) {
      if (!isTimerExpired(timer) || alerted[timer.id]) continue;
      alerted[timer.id] = true;
      void game.settings.set(MODULE_ID, SETTINGS.timerAlertedExpirations, alerted);
      this.openTimerWindow(timer.id, {
        force: true,
        displayStyle: TIMER_DISPLAY_STYLE.prominent
      });
      void this.playExpiredSound(timer);
    }
  }

  getAlertedExpirations() {
    const alerted = game.settings.get(MODULE_ID, SETTINGS.timerAlertedExpirations);
    return alerted && (typeof alerted === "object") ? { ...alerted } : {};
  }

  async playExpiredSound(timer) {
    const src = TIMER_SOUND_SOURCES[timer?.sound];
    if (!src) return;

    try {
      await foundry.audio.AudioHelper.play({
        src,
        volume: 1,
        autoplay: true,
        loop: false
      }, false);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to play timer expiration sound`, error);
    }
  }

  getModeratorUserIds() {
    return game.users.filter((user) => isModerator(user)).map((user) => user.id);
  }
}
