import { FLAGS, MODULE_ID, SETTINGS, SOCKET_CHANNEL } from "../../config.js";
import { generics } from "../../generics.js";
import { createTechnicalChatMessages, isTechnicalUser } from "../../technical-chat.js";
import {
  confirmDialog,
  createSerialTaskQueue,
  escapeHTML,
  format,
  formatDuration,
  getMessageAuthorId,
  getRenderedElement,
  getWhisperRecipientsWithModerators,
  isModerator,
  isPrimaryModerator,
  localize,
  openSingletonApplication
} from "../../utils.js";
import { FocusAuditApplication } from "./focus-audit-window.js";
import {
  AUDIT_METRICS,
  DEFAULT_AUDIT_THRESHOLDS,
  INDICATOR_LABEL_KEYS,
  INDICATOR_LEVEL,
  PLAYER_STATUS,
  PLAYER_STATUS_CONFIG,
  PLAYER_STATUS_OPTIONS,
  createCleanAuditEntry,
  createEmptyFocusAuditState,
  getActiveRequestTimestamp,
  getIndicatorLevel,
  normalizeAuditThresholds,
  normalizeFocusAuditState,
  normalizePlayerStatus,
  sortRowsByEnabledAndName
} from "./focus-utils.js";

export class FocusAuditTool {
  constructor() {
    this.state = createEmptyFocusAuditState();
    this.thresholds = DEFAULT_AUDIT_THRESHOLDS;
    this.auditWindow = null;
    this.runStateTask = createSerialTaskQueue();
    this.renderPlayers = this.renderPlayers.bind(this);
    this.handleUserConnected = this.handleUserConnected.bind(this);
    this.handleChatMessageCreated = this.handleChatMessageCreated.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
  }

  registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.focusAuditState, {
      scope: "world",
      config: false,
      type: Object,
      default: createEmptyFocusAuditState(),
      onChange: (value) => this.onStateChanged(value)
    });

    game.settings.register(MODULE_ID, SETTINGS.focusAuditThresholds, {
      scope: "world",
      config: false,
      type: Object,
      default: DEFAULT_AUDIT_THRESHOLDS,
      onChange: (value) => this.onThresholdsChanged(value)
    });
  }

  registerHooks() {
    Hooks.on("renderPlayers", this.renderPlayers);
    Hooks.on("renderPlayerList", this.renderPlayers);
    Hooks.on("userConnected", this.handleUserConnected);
    Hooks.on("createChatMessage", this.handleChatMessageCreated);
  }

  activate() {
    this.state = normalizeFocusAuditState(game.settings.get(MODULE_ID, SETTINGS.focusAuditState));
    this.thresholds = normalizeAuditThresholds(game.settings.get(MODULE_ID, SETTINGS.focusAuditThresholds));
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    window.setTimeout(() => {
      if (isPrimaryModerator()) void this.markActivePlayersPlaying();
      else this.requestOwnStatusChange(PLAYER_STATUS.playing);
      this.renderPlayersList();
    }, 250);
  }

  openAuditWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return null;
    }

    this.auditWindow = openSingletonApplication(
      this.auditWindow,
      () => new FocusAuditApplication(this)
    );
    return this.auditWindow;
  }

  forgetAuditWindow(app) {
    if (this.auditWindow === app) this.auditWindow = null;
  }

  onStateChanged(rawState) {
    this.state = normalizeFocusAuditState(rawState);
    this.renderPlayersList();
    this.auditWindow?.onAuditChanged();
  }

  onThresholdsChanged(rawThresholds) {
    this.thresholds = normalizeAuditThresholds(rawThresholds);
    this.auditWindow?.onAuditChanged();
  }

  getPlayerStatus(userId) {
    return normalizePlayerStatus(this.state.players[userId]?.selfStatus);
  }

  getPlayerStatusOptions(selectedStatus = PLAYER_STATUS.playing) {
    selectedStatus = normalizePlayerStatus(selectedStatus);
    if (selectedStatus === PLAYER_STATUS.unknown) selectedStatus = PLAYER_STATUS.playing;
    return PLAYER_STATUS_OPTIONS.map((value) => {
      const config = PLAYER_STATUS_CONFIG[value];
      return {
        value,
        label: localize(config.labelKey),
        title: localize(config.descriptionKey),
        indicator: config.indicator,
        selected: value === selectedStatus ? "selected" : ""
      };
    });
  }

  renderPlayers(_app, html) {
    window.setTimeout(() => this.injectPlayerStatus(html), 0);
  }

  injectPlayerStatus(html) {
    const root = getRenderedElement(html);
    if (!root) return;

    root.querySelector("[data-dmicher-player-status-control]")?.remove();
    const container = root.querySelector("#players-active") ?? root;
    const performanceStats = container.querySelector("#performance-stats");
    const status = this.getPlayerStatus(game.user.id);
    const config = PLAYER_STATUS_CONFIG[status];
    const wrapper = document.createElement("div");
    wrapper.className = `dmicher-player-status-control dmicher-status-fill-${config.indicator}`;
    wrapper.dataset.dmicherPlayerStatusControl = "true";

    const dot = document.createElement("span");
    dot.className = `dmicher-indicator dmicher-indicator-${config.indicator}`;
    dot.setAttribute("aria-hidden", "true");

    const select = document.createElement("select");
    select.className = "dmicher-player-status-select";
    select.title = localize(config.descriptionKey);
    select.setAttribute("aria-label", localize("Focus.Status.SelectLabel"));

    for (const optionData of this.getPlayerStatusOptions(status)) {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      option.title = optionData.title;
      option.selected = optionData.value === status;
      select.append(option);
    }

    select.addEventListener("change", () => this.requestOwnStatusChange(select.value));
    this.activatePlayerStatusInteraction(root, wrapper);
    wrapper.append(dot, select);
    if (performanceStats) container.insertBefore(wrapper, performanceStats);
    else container.append(wrapper);
  }

  activatePlayerStatusInteraction(root, wrapper) {
    const setInteracting = () => {
      root.classList.add("dmicher-player-status-interacting");
    };
    const clearInteracting = () => {
      window.setTimeout(() => {
        if (wrapper.matches(":hover") || wrapper.contains(document.activeElement)) return;
        root.classList.remove("dmicher-player-status-interacting");
      }, 0);
    };

    wrapper.addEventListener("pointerenter", setInteracting);
    wrapper.addEventListener("pointerleave", clearInteracting);
    wrapper.addEventListener("focusin", setInteracting);
    wrapper.addEventListener("focusout", clearInteracting);
    for (const eventName of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"]) {
      wrapper.addEventListener(eventName, (event) => {
        event.stopPropagation();
        setInteracting();
      });
    }
  }

  requestOwnStatusChange(status) {
    if (isTechnicalUser(game.user)) return;
    status = normalizePlayerStatus(status);
    if (this.getPlayerStatus(game.user.id) === status) return;

    if (isModerator()) {
      void this.setPlayerStatus(game.user.id, status);
      return;
    }

    game.socket.emit(SOCKET_CHANNEL, {
      action: "focusSetOwnStatus",
      userId: game.user.id,
      status
    });
  }

  receiveSocketMessage(payload) {
    if (payload?.action !== "focusSetOwnStatus") return;
    if (!isPrimaryModerator()) return;

    const userId = String(payload.userId ?? "");
    const user = game.users.get(userId);
    if (!user || isTechnicalUser(user)) return;
    void this.setPlayerStatus(userId, payload.status);
  }

  async setPlayerStatus(userId, status, { announce = true } = {}) {
    if (isTechnicalUser(game.users.get(userId))) return false;
    status = normalizePlayerStatus(status);
    const oldStatus = this.getPlayerStatus(userId);
    if (oldStatus === status) return false;

    await this.updateState((state) => {
      const entry = state.players[userId] ?? createCleanAuditEntry({ selfStatus: oldStatus });
      entry.selfStatus = status;
      state.players[userId] = entry;
    });

    if (announce) await this.createStatusChangeMessage(userId, oldStatus, status);
    return true;
  }

  async createStatusChangeMessage(userId, oldStatus, newStatus) {
    const user = game.users.get(userId);
    if (!user || isTechnicalUser(user)) return;

    await createTechnicalChatMessages({
      content: this.buildStatusChangeContent(user, oldStatus, newStatus),
      whisper: getWhisperRecipientsWithModerators(userId),
      flags: {
        [MODULE_ID]: {
          [FLAGS.playerStatus]: { userId, oldStatus, newStatus, changedAt: Date.now() }
        }
      }
    });
  }

  buildStatusChangeContent(user, oldStatus, newStatus) {
    const statusConfig = PLAYER_STATUS_CONFIG[normalizePlayerStatus(newStatus)];
    const newStatusLabel = localize(statusConfig.labelKey);
    const newStatusDescription = localize(statusConfig.descriptionKey);
    return `
      <section class="dmicher-technical-card dmicher-player-status-chat">
        <strong class="dmicher-technical-title">${escapeHTML(format("Focus.Status.ChatTitle", {
          player: user.name,
          newStatus: newStatusLabel
        }))}</strong>
        <small class="dmicher-technical-meta">${escapeHTML(format("Focus.Status.ChatDetails", {
          player: user.name,
          oldStatus: localize(PLAYER_STATUS_CONFIG[normalizePlayerStatus(oldStatus)].labelKey),
          newStatus: newStatusLabel,
          description: newStatusDescription
        }))}</small>
      </section>`;
  }

  handleUserConnected(user, connected) {
    if (!connected || !user?.id || isTechnicalUser(user)) return;
    if (isPrimaryModerator()) void this.setPlayerStatus(user.id, PLAYER_STATUS.playing);
    this.renderPlayersList();
    this.auditWindow?.onAuditChanged();
  }

  async markActivePlayersPlaying() {
    if (!isPrimaryModerator()) return;
    await this.updateState((state) => {
      for (const user of game.users) {
        if (!user.active || isTechnicalUser(user)) continue;
        const entry = state.players[user.id] ?? createCleanAuditEntry({}, Date.now());
        if (normalizePlayerStatus(entry.selfStatus) !== PLAYER_STATUS.unknown) continue;
        entry.selfStatus = PLAYER_STATUS.playing;
        state.players[user.id] = entry;
      }
    });
  }

  handleChatMessageCreated(message, _options, userId) {
    if (!isPrimaryModerator()) return;
    if (message.getFlag(MODULE_ID, FLAGS.playerStatus)) return;
    const pollResult = message.getFlag(MODULE_ID, FLAGS.pollResult);
    if (pollResult) {
      if (pollResult.status !== "noAnswer" && pollResult.userId) {
        void this.markTimestamp(String(pollResult.userId), "lastChatAt", Number(pollResult.answeredAt) || Number(message.timestamp) || Date.now());
      }
      return;
    }
    const readinessResult = message.getFlag(MODULE_ID, FLAGS.readinessResult);
    if (readinessResult) {
      if (readinessResult.status !== "waiting" && readinessResult.userId) {
        void this.markTimestamp(String(readinessResult.userId), "lastChatAt", Number(message.timestamp) || Date.now());
      }
      return;
    }
    if (message.getFlag(MODULE_ID, FLAGS.technical) || generics.chat.isTechnicalMessage(message)) return;
    if (message.getFlag(MODULE_ID, FLAGS.pollRequest)) return;
    if (message.getFlag(MODULE_ID, FLAGS.readinessRequest)) return;
    if (message.getFlag(MODULE_ID, FLAGS.request)) return;

    const authorId = getMessageAuthorId(message, userId);
    const author = game.users.get(authorId);
    if (!authorId || !author || isTechnicalUser(author)) return;
    void this.markTimestamp(authorId, "lastChatAt", Number(message.timestamp) || Date.now());
  }

  recordRequestSubmitted(message, requestData) {
    if (!isPrimaryModerator()) return;
    const userId = String(requestData.authorId ?? getMessageAuthorId(message));
    if (!userId) return;
    const submittedAt = Number(requestData.submittedAt ?? message.timestamp ?? Date.now());

    void this.updateState((state) => {
      const entry = this.getMutableEntry(state, userId);
      entry.lastRequestAt = submittedAt;
      entry.lastChatAt = submittedAt;
      entry.activeRequests[requestData.id ?? message.id] = submittedAt;
      entry.activeRequestAt = getActiveRequestTimestamp(entry, submittedAt);
    });
  }

  rebuildRequestsFromMessages(messages = game.messages) {
    if (!isPrimaryModerator()) return;
    const now = Date.now();
    void this.updateState((state) => {
      for (const entry of Object.values(state.players)) {
        entry.activeRequests = {};
        entry.activeRequestAt = now;
      }

      for (const message of messages ?? []) {
        const requestData = message.getFlag(MODULE_ID, FLAGS.request);
        if (!requestData) continue;
        const userId = String(requestData.authorId ?? getMessageAuthorId(message));
        if (!userId) continue;
        const submittedAt = Number(requestData.submittedAt ?? message.timestamp ?? now);
        const entry = this.getMutableEntry(state, userId);
        entry.activeRequests[message.id] = submittedAt;
        entry.activeRequestAt = getActiveRequestTimestamp(entry, now);
        entry.lastRequestAt = Math.max(Number(entry.lastRequestAt) || 0, submittedAt);
        entry.lastChatAt = Math.max(Number(entry.lastChatAt) || 0, submittedAt);
      }
    });
  }

  rebuildRequestsFromEntries(entries = []) {
    if (!isPrimaryModerator()) return;
    const now = Date.now();
    void this.updateState((state) => {
      for (const entry of Object.values(state.players)) {
        entry.activeRequests = {};
        entry.activeRequestAt = now;
      }

      for (const requestData of entries ?? []) {
        const userId = String(requestData.authorId ?? "");
        const requestId = String(requestData.id ?? requestData.messageId ?? "");
        if (!userId || !requestId) continue;
        const submittedAt = Number(requestData.submittedAt ?? now);
        const entry = this.getMutableEntry(state, userId);
        entry.activeRequests[requestId] = submittedAt;
        entry.activeRequestAt = getActiveRequestTimestamp(entry, now);
        entry.lastRequestAt = Math.max(Number(entry.lastRequestAt) || 0, submittedAt);
        entry.lastChatAt = Math.max(Number(entry.lastChatAt) || 0, submittedAt);
      }
    });
  }

  recordRequestResolved(messageId, requestData, completed) {
    if (!isPrimaryModerator()) return;
    const userId = String(requestData.authorId ?? "");
    if (!userId) return;
    const now = Date.now();

    void this.updateState((state) => {
      const entry = this.getMutableEntry(state, userId);
      delete entry.activeRequests[messageId];
      entry.activeRequestAt = Object.keys(entry.activeRequests).length
        ? getActiveRequestTimestamp(entry, now)
        : now;
      if (completed) entry.lastGrantedAt = now;
    });
  }

  async markLastGranted(userId) {
    await this.markTimestamp(userId, "lastGrantedAt", Date.now());
  }

  async markTimestamp(userId, key, timestamp) {
    if (isTechnicalUser(game.users.get(userId))) return;
    await this.updateState((state) => {
      const entry = this.getMutableEntry(state, userId);
      entry[key] = timestamp;
    });
  }

  async setAuditEnabled(userId, enabled) {
    await this.updateState((state) => {
      const entry = this.getMutableEntry(state, userId);
      entry.enabled = Boolean(enabled);
    });
  }

  async confirmResetPlayer(userId) {
    const user = game.users.get(userId);
    if (!user) return;

    const confirmed = await confirmDialog({
      title: localize("Focus.Audit.ResetPlayerTitle"),
      content: `<p>${escapeHTML(format("Focus.Audit.ResetPlayerConfirm", { player: user.name }))}</p>`,
      yes: localize("Focus.Audit.ResetYes"),
      no: localize("Focus.Audit.ResetNo"),
      icon: "fa-solid fa-trash"
    });
    if (confirmed) await this.resetPlayer(userId);
  }

  async confirmResetAll() {
    const confirmed = await confirmDialog({
      title: localize("Focus.Audit.ResetAllTitle"),
      content: `<p>${escapeHTML(localize("Focus.Audit.ResetAllConfirm"))}</p>`,
      yes: localize("Focus.Audit.ResetYes"),
      no: localize("Focus.Audit.ResetNo"),
      icon: "fa-solid fa-rotate"
    });
    if (confirmed) await this.resetAll();
  }

  async resetPlayer(userId) {
    const now = Date.now();
    await this.updateState((state) => {
      const existing = state.players[userId] ?? {};
      state.players[userId] = createCleanAuditEntry(existing, now);
    });
  }

  async resetAll() {
    const now = Date.now();
    await this.updateState((state) => {
      for (const user of game.users) {
        if (isTechnicalUser(user)) continue;
        const existing = state.players[user.id] ?? {};
        state.players[user.id] = createCleanAuditEntry(existing, now);
      }
    });
  }

  async ensureActiveRowsDefaults() {
    await this.updateState((state) => {
      let changed = false;
      const now = Date.now();
      for (const user of game.users) {
        if (isTechnicalUser(user)) continue;
        const entry = state.players[user.id];
        if (!entry) {
          state.players[user.id] = createCleanAuditEntry({}, now);
          changed = true;
          continue;
        }
        if (!entry.enabled) continue;
        const clean = createCleanAuditEntry(entry, now);
        for (const key of ["lastRequestAt", "activeRequestAt", "lastChatAt", "lastGrantedAt"]) {
          if (!entry[key]) {
            entry[key] = clean[key];
            changed = true;
          }
        }
      }
      return changed || false;
    });
  }

  getAuditRows() {
    const now = Date.now();
    return Array.from(game.users).filter((user) => !isTechnicalUser(user)).map((user) => {
      const entry = this.state.players[user.id] ?? createCleanAuditEntry({}, now);
      const enabled = Boolean(entry.enabled);
      if (!enabled) return this.getDisabledAuditRow(user);

      const selfStatus = user.active ? normalizePlayerStatus(entry.selfStatus) : PLAYER_STATUS.unknown;
      const statusConfig = PLAYER_STATUS_CONFIG[selfStatus];
      const selfStatusLabel = localize(statusConfig.labelKey);
      const selfStatusDescription = localize(statusConfig.descriptionKey);
      return {
        userId: user.id,
        name: user.name,
        enabled,
        inactive: enabled ? "" : "is-inactive",
        foundryLevel: user.active ? INDICATOR_LEVEL.good : INDICATOR_LEVEL.deadline,
        foundryTitle: localize(user.active ? "Focus.Audit.FoundryOnline" : "Focus.Audit.FoundryOffline"),
        selfIndicator: statusConfig.indicator,
        selfStatusTitle: `${selfStatusLabel}: ${selfStatusDescription}`,
        metricCells: this.getMetricCells(entry, now),
        controlsDisabled: enabled ? "" : "disabled"
      };
    }).sort(sortRowsByEnabledAndName);
  }

  getDisabledAuditRow(user) {
    const mutedTitle = localize("Focus.Indicators.Muted");
    return {
      userId: user.id,
      name: user.name,
      enabled: false,
      inactive: "is-inactive",
      foundryLevel: INDICATOR_LEVEL.muted,
      foundryTitle: mutedTitle,
      selfIndicator: INDICATOR_LEVEL.muted,
      selfStatusTitle: mutedTitle,
      metricCells: Object.keys(AUDIT_METRICS).map((metricId) => ({
        metricId,
        level: INDICATOR_LEVEL.muted,
        title: mutedTitle
      })),
      controlsDisabled: "disabled"
    };
  }

  getMetricCells(entry, now) {
    return Object.entries(AUDIT_METRICS).map(([metricId, metric]) => {
      const timestamp = metricId === "activeRequest"
        ? getActiveRequestTimestamp(entry, now)
        : Number(entry[metric.timestampKey]);
      const level = getIndicatorLevel(timestamp, this.thresholds[metricId], now);
      return {
        metricId,
        level,
        title: level === INDICATOR_LEVEL.muted
          ? localize("Focus.Indicators.Muted")
          : format("Focus.Audit.MetricTooltip", {
            label: localize(metric.titleKey),
            elapsed: formatDuration(now - timestamp),
            level: localize(INDICATOR_LABEL_KEYS[level])
          })
      };
    });
  }

  getMutableEntry(state, userId) {
    if (!state.players[userId]) state.players[userId] = createCleanAuditEntry({}, Date.now());
    state.players[userId] = {
      ...state.players[userId],
      activeRequests: { ...(state.players[userId].activeRequests ?? {}) }
    };
    return state.players[userId];
  }

  async updateState(mutator) {
    return this.runStateTask(async () => {
      const state = normalizeFocusAuditState(game.settings.get(MODULE_ID, SETTINGS.focusAuditState));
      const result = await mutator(state);
      if (result === false) return false;
      await game.settings.set(MODULE_ID, SETTINGS.focusAuditState, state);
      return result;
    });
  }

  renderPlayersList() {
    const players = ui.players;
    if (!players?.render) return;
    players.render(true);
  }
}
