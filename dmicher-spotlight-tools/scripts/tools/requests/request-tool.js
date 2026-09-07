import {
  DEFAULT_USER_PORTRAIT,
  FLAGS,
  MODULE_ID,
  REQUEST_TYPES,
  SETTINGS,
  SOCKET_CHANNEL,
  SPEECH_GRANTED_SOUND,
  normalizeRequestType
} from "../../config.js";
import { createTechnicalChatMessages, isTechnicalChatEnabled, isTechnicalUser, synchronizeTechnicalIdentity } from "../../technical-chat.js";
import { waitForPremiumReady } from "../../premium-provider.js";
import { applyChatPortrait, renderChatPortrait } from "../../chat-portrait.js";
import {
  buildChatSpeaker,
  canUseRequest,
  createSerialTaskQueue,
  format,
  formatDigitalDuration,
  getChatMessageClass,
  getChatMessageRenderHook,
  getWhisperRecipientsWithModerators,
  isModerator,
  isPrimaryModerator,
  localize,
  preloadImage,
  setGamePaused
} from "../../utils.js";
import { ActiveRequestsController } from "./active-requests-controller.js";
import {
  createDefaultActiveRequestState,
  getActiveRequestState,
  getRequestBaseVolume,
  getRequestConfiguration,
  getRequestImage,
  getRequestLimitViolation,
  getRequestSound,
  getRequestTimeoutStatus,
  hasConfiguredRequestTimeouts,
  normalizeActiveRequestEntry,
  normalizeActiveRequestState,
  recordRequestTimeoutEvent,
  registerRequestWorldSettings
} from "./request-config.js";
import {
  buildRequestMessageContent,
  buildTechnicalMessageLines,
  buildWelcomeMessageContent,
  renderRequestChatMessage
} from "./request-message.js";
import { getRequestStyle, getRequestText } from "./request-settings.js";
import { sanitizeRequestTextStyle } from "./request-text-style.js";

export class RequestTool {
  constructor({ focusAuditTool = null, volumeController = null } = {}) {
    this.focusAuditTool = focusAuditTool;
    this.volumeController = volumeController;
    this.state = createDefaultActiveRequestState();
    this.resolvingRequests = new Set();
    this.deletingMessageIds = new Set();
    this.shownNotifications = new Set();
    this.welcomedUsers = new Set();
    this.runStateTask = createSerialTaskQueue();
    this.configurationListeners = new Set();
    this.stateListeners = new Set();
    this.submitRequest = this.submitRequest.bind(this);
    this.resolveRequest = this.resolveRequest.bind(this);
    this.resetRequestTimeouts = this.resetRequestTimeouts.bind(this);
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.handleChatMessageDeleted = this.handleChatMessageDeleted.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
    this.handleUserConnected = this.handleUserConnected.bind(this);
    this.activeRequests = new ActiveRequestsController({
      resolveRequest: this.resolveRequest,
      submitRequest: this.submitRequest,
      resetTimeouts: this.resetRequestTimeouts
    });
  }

  registerSettings() {
    registerRequestWorldSettings({
      onConfigurationChanged: () => this.notifyConfigurationChanged(),
      onActiveRequestsChanged: (value) => this.applyState(value)
    });
  }

  registerHooks() {
    Hooks.on(getChatMessageRenderHook(), this.renderChatMessage);
    Hooks.on("ChatPortraitReplaceData", applyChatPortrait);
    Hooks.on("dnd5e.renderChatMessage", renderChatPortrait);
    Hooks.on("deleteChatMessage", this.handleChatMessageDeleted);
    Hooks.on("userConnected", this.handleUserConnected);
  }

  activate() {
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    this.applyState(game.settings.get(MODULE_ID, SETTINGS.activeRequests));
    if (isPrimaryModerator()) {
      void this.initializeStateFromLegacyMessages();
      this.focusAuditTool?.rebuildRequestsFromEntries?.(this.state.entries);
    }
    void this.preloadAssets();
    window.setTimeout(() => void this.requestWelcome(game.user.id), 250);
  }

  subscribeConfiguration(listener) {
    this.configurationListeners.add(listener);
    return () => this.configurationListeners.delete(listener);
  }

  subscribeState(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  notifyConfigurationChanged() {
    for (const listener of this.configurationListeners) listener(getRequestConfiguration());
    this.activeRequests.notifyChanged();
    void this.preloadAssets();
  }

  applyState(value) {
    this.state = normalizeActiveRequestState(value);
    this.activeRequests.setEntries(this.state.entries);
    for (const listener of this.stateListeners) listener(this.state);
    this.focusAuditTool?.rebuildRequestsFromEntries?.(this.state.entries);
  }

  openActiveRequestsWindow() {
    return this.activeRequests.openWindow();
  }

  async resetRequestTimeouts() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return false;
    }
    if (!hasConfiguredRequestTimeouts(getRequestConfiguration())) {
      ui.notifications.warn(localize("Requests.Limits.ResetUnavailable"));
      return false;
    }
    if (isPrimaryModerator()) return this.processRequestTimeoutReset(game.user.id);
    if (!this.hasActiveModerator()) {
      ui.notifications.error(localize("Requests.Queue.NoModerator"));
      return false;
    }
    game.socket.emit(SOCKET_CHANNEL, { action: "requestResetTimeouts", resolverId: game.user.id });
    return true;
  }

  async processRequestTimeoutReset(resolverId) {
    if (!isPrimaryModerator()) return false;
    const resolver = game.users.get(String(resolverId ?? ""));
    if (!isModerator(resolver)) {
      this.sendFeedback(resolver?.id, "Requests.Chat.Forbidden", "warn");
      return false;
    }
    if (!hasConfiguredRequestTimeouts(getRequestConfiguration())) {
      this.sendFeedback(resolver.id, "Requests.Limits.ResetUnavailable", "warn");
      return false;
    }
    return this.runStateTask(async () => {
      const current = getActiveRequestState();
      current.cooldowns = {};
      current.cooldownsResetAt = Date.now();
      current.revision += 1;
      await game.settings.set(MODULE_ID, SETTINGS.activeRequests, current);
      this.applyState(current);
      this.sendFeedback(resolver.id, "Requests.Limits.ResetSuccess", "info");
      return true;
    });
  }

  async submitRequest(type) {
    const normalizedType = normalizeRequestType(type);
    const request = REQUEST_TYPES[normalizedType];
    if (!canUseRequest(request)) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return false;
    }

    const configuration = getRequestConfiguration();
    const violation = getRequestLimitViolation(
      normalizedType,
      game.user.id,
      this.state,
      configuration
    );
    if (violation) {
      this.showLimitViolation(violation, {
        type: normalizedType,
        authorId: game.user.id,
        state: this.state,
        configuration
      });
      return false;
    }

    const payload = this.createSubmissionPayload(normalizedType);
    if (isPrimaryModerator()) return this.processSubmission(payload);
    if (!this.hasActiveModerator()) {
      ui.notifications.error(localize("Requests.Queue.NoModerator"));
      return false;
    }
    game.socket.emit(SOCKET_CHANNEL, { action: "requestSubmit", payload });
    return true;
  }

  createSubmissionPayload(type) {
    const token = canvas?.tokens?.controlled?.[0] ?? null;
    const actor = token?.actor ?? game.user.character ?? null;
    const tokenDocument = token?.document ?? null;
    return {
      id: createRequestId(),
      urgency: type,
      authorId: game.user.id,
      authorName: String(game.user.name ?? "").slice(0, 100),
      characterName: firstNonEmptyString(actor?.name, token?.name).slice(0, 100),
      actorId: String(actor?.id ?? "").slice(0, 100),
      tokenId: String(tokenDocument?.id ?? token?.id ?? "").slice(0, 100),
      sceneId: String(tokenDocument?.parent?.id ?? canvas?.scene?.id ?? "").slice(0, 100),
      text: getRequestText(REQUEST_TYPES[type]).slice(0, 500),
      style: getRequestStyle(REQUEST_TYPES[type]),
      portrait: firstNonEmptyString(
        tokenDocument?.texture?.src,
        token?.texture?.src,
        game.user.avatar,
        DEFAULT_USER_PORTRAIT
      ).slice(0, 2048),
      submittedAt: Date.now(),
      createdAt: Number(game.time.serverTime) || Date.now()
    };
  }

  async processSubmission(payload) {
    if (!isPrimaryModerator()) return false;
    try {
      return await this.runStateTask(async () => {
      const type = normalizeRequestType(payload?.urgency);
      const request = REQUEST_TYPES[type];
      const user = game.users.get(String(payload?.authorId ?? ""));
      if (!user || isTechnicalUser(user) || !canUseRequest(request, user)) {
        this.sendFeedback(payload?.authorId, "Requests.Chat.Forbidden", "warn");
        return false;
      }

      const current = getActiveRequestState();
      const configuration = getRequestConfiguration();
      const violation = getRequestLimitViolation(type, user.id, current, configuration);
      if (violation) {
        this.sendFeedback(
          user.id,
          this.getViolationKey(violation),
          "warn",
          this.getViolationData(violation, { type, authorId: user.id, state: current, configuration })
        );
        return false;
      }

      const acceptedAt = Date.now();
      const sequence = current.entries.reduce((maximum, entry) => Math.max(maximum, Number(entry.sequence) || 0), -1) + 1;
      const entry = normalizeActiveRequestEntry({
        id: String(payload.id || createRequestId()),
        urgency: type,
        authorId: user.id,
        authorName: String(user.name ?? payload.authorName ?? "").slice(0, 100),
        characterName: payload.characterName,
        actorId: payload.actorId,
        tokenId: payload.tokenId,
        sceneId: payload.sceneId,
        portrait: firstNonEmptyString(payload.portrait, user.avatar, DEFAULT_USER_PORTRAIT),
        submittedAt: acceptedAt,
        createdAt: Number(game.time.serverTime) || acceptedAt,
        sequence,
        messageId: ""
      });
      if (!entry) throw new Error(localize("Requests.Chat.SubmitError"));

      if (configuration.chatEnabled) {
        await synchronizeTechnicalIdentity();
        const ChatMessageClass = getChatMessageClass();
        const message = await ChatMessageClass.create({
          author: user.id,
          speaker: buildRequestSpeaker(entry),
          content: buildRequestMessageContent(
            type,
            String(payload.text ?? getRequestText(request)).slice(0, 500),
            sanitizeRequestTextStyle(payload.style ?? getRequestStyle(request)),
            getRequestImage(type, configuration)
          ),
          flags: { [MODULE_ID]: { [FLAGS.request]: entry } }
        });
        if (!message) throw new Error(localize("Requests.Chat.SubmitError"));
        entry.messageId = message.id;
      }

      current.initialized = true;
      current.revision += 1;
      current.entries.push(entry);
      recordRequestTimeoutEvent(current, type, user.id, "submission", acceptedAt);
      await game.settings.set(MODULE_ID, SETTINGS.activeRequests, current);
      this.applyState(current);
      this.focusAuditTool?.recordRequestSubmitted?.({ id: entry.id, timestamp: entry.submittedAt }, entry);
      this.broadcastRequestSound(type, configuration);
      return true;
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to submit request`, error);
      this.sendFeedback(payload?.authorId, "Requests.Chat.SubmitError", "error");
      return false;
    }
  }

  renderChatMessage(message, html) {
    renderRequestChatMessage(message, html, {
      resolveRequest: this.resolveRequest,
      openSettings: () => globalThis.game.modules.get(MODULE_ID)?.api?.openRequestSettings?.(),
      openMasterSettings: () => globalThis.game.modules.get(MODULE_ID)?.api?.openRequestMasterSettings?.(),
      openHelp: () => globalThis.game.modules.get(MODULE_ID)?.api?.openHelp?.(),
      openThankAuthor: () => globalThis.game.modules.get(MODULE_ID)?.api?.openThankAuthor?.()
    });
  }

  handleChatMessageDeleted(message) {
    if (!isPrimaryModerator() || this.deletingMessageIds.has(message.id)) return;
    const requestData = message.getFlag(MODULE_ID, FLAGS.request);
    const requestId = requestData?.id
      ?? this.state.entries.find((entry) => entry.messageId === message.id)?.id;
    if (requestId) void this.removeRequestFromState(requestId, { completed: false, createTechnical: false });
  }

  async resolveRequest(target, action) {
    const requestId = typeof target === "string"
      ? target
      : target?.getFlag?.(MODULE_ID, FLAGS.request)?.id
        ?? this.state.entries.find((entry) => entry.messageId === target?.id)?.id;
    const entry = this.state.entries.find((item) => item.id === requestId);
    if (!entry) return false;

    const completed = action === "grant";
    const permitted = completed ? isModerator() : (isModerator() || entry.authorId === game.user.id);
    if (!permitted) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return false;
    }
    if (isPrimaryModerator()) return this.processResolution(requestId, completed, game.user.id);
    game.socket.emit(SOCKET_CHANNEL, {
      action: "requestResolve",
      requestId,
      completed,
      resolverId: game.user.id
    });
    return true;
  }

  async processResolution(requestId, completed, resolverId) {
    if (!isPrimaryModerator() || this.resolvingRequests.has(requestId)) return false;
    this.resolvingRequests.add(requestId);
    try {
      return await this.runStateTask(async () => {
        const current = getActiveRequestState();
        const entry = current.entries.find((item) => item.id === requestId);
        if (!entry) return false;
        const resolver = game.users.get(String(resolverId ?? ""));
        const permitted = completed ? isModerator(resolver) : (isModerator(resolver) || resolver?.id === entry.authorId);
        if (!permitted) {
          this.sendFeedback(resolver?.id, "Requests.Chat.Forbidden", "warn");
          return false;
        }

        const configuration = getRequestConfiguration();
        const elapsed = Date.now() - Number(entry.submittedAt);
        if (completed && normalizeRequestType(entry.urgency) === "stop") await setGamePaused(true);

        current.entries = current.entries.filter((item) => item.id !== requestId);
        if (completed) recordRequestTimeoutEvent(current, entry.urgency, entry.authorId, "grant", Date.now());
        current.revision += 1;
        await game.settings.set(MODULE_ID, SETTINGS.activeRequests, current);
        this.applyState(current);

        if (entry.messageId) {
          const message = game.messages.get(entry.messageId);
          if (message) {
            this.deletingMessageIds.add(message.id);
            try {
              await message.delete();
            } finally {
              this.deletingMessageIds.delete(message.id);
            }
          }
        }

        this.focusAuditTool?.recordRequestResolved?.(entry.id, entry, completed);
        if (completed) this.broadcastSpeechGranted(entry);
        if (configuration.chatEnabled) await this.createTechnicalMessage(entry, completed, elapsed, resolver);
        return true;
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to resolve request`, error);
      ui.notifications.error(localize("Requests.Chat.ResolveError"));
      return false;
    } finally {
      this.resolvingRequests.delete(requestId);
    }
  }

  async removeRequestFromState(requestId, { completed = false, createTechnical = false } = {}) {
    return this.runStateTask(async () => {
      const current = getActiveRequestState();
      const entry = current.entries.find((item) => item.id === requestId);
      if (!entry) return false;
      current.entries = current.entries.filter((item) => item.id !== requestId);
      if (completed) recordRequestTimeoutEvent(current, entry.urgency, entry.authorId, "grant", Date.now());
      current.revision += 1;
      await game.settings.set(MODULE_ID, SETTINGS.activeRequests, current);
      this.applyState(current);
      this.focusAuditTool?.recordRequestResolved?.(entry.id, entry, completed);
      if (createTechnical) await this.createTechnicalMessage(entry, completed, Date.now() - entry.submittedAt, game.user);
      return true;
    });
  }

  async createTechnicalMessage(requestData, completed, elapsed, resolver) {
    const resolutionData = {
      outcome: completed ? "completed" : "cancelled",
      resolverName: completed ? "" : String(resolver?.name ?? game.user.name),
      requestData,
      elapsed
    };
    await createTechnicalChatMessages({
      content: `<section class="dmicher-request-technical">${buildTechnicalMessageLines(resolutionData)}</section>`,
      whisper: getWhisperRecipientsWithModerators(requestData.authorId),
      flags: { [MODULE_ID]: { [FLAGS.resolution]: resolutionData } }
    });
  }

  broadcastRequestSound(type, configuration = getRequestConfiguration()) {
    const payload = {
      action: "requestSound",
      id: createRequestId(),
      urgency: type,
      src: getRequestSound(type, configuration),
      volume: getRequestBaseVolume(type, configuration)
    };
    this.playRequestSound(payload);
    game.socket.emit(SOCKET_CHANNEL, payload);
  }

  broadcastSpeechGranted(requestData) {
    const payload = {
      action: "speechGranted",
      id: createRequestId(),
      urgency: normalizeRequestType(requestData.urgency),
      authorName: String(requestData.authorName ?? "").slice(0, 100),
      characterName: String(requestData.characterName ?? "").slice(0, 100),
      portrait: String(requestData.portrait || DEFAULT_USER_PORTRAIT).slice(0, 2048)
    };
    this.showSpeechGranted(payload);
    game.socket.emit(SOCKET_CHANNEL, payload);
  }

  receiveSocketMessage(payload) {
    switch (payload?.action) {
      case "requestSubmit":
        if (isPrimaryModerator()) void this.processSubmission(payload.payload);
        break;
      case "requestResolve":
        if (isPrimaryModerator()) void this.processResolution(payload.requestId, Boolean(payload.completed), payload.resolverId);
        break;
      case "requestResetTimeouts":
        if (isPrimaryModerator()) void this.processRequestTimeoutReset(payload.resolverId);
        break;
      case "requestSound":
        void this.playRequestSound(payload);
        break;
      case "speechGranted":
        this.showSpeechGranted(payload);
        break;
      case "requestFeedback":
        if (payload.userId === game.user.id) this.showFeedback(payload);
        break;
      case "requestWelcome":
        if (isPrimaryModerator()) void this.createWelcomeMessage(payload.userId);
        break;
    }
  }

  async playRequestSound(payload) {
    if (!payload?.id || this.shownNotifications.has(payload.id)) return;
    this.shownNotifications.add(payload.id);
    window.setTimeout(() => this.shownNotifications.delete(payload.id), 10000);
    try {
      await this.volumeController?.play(payload.src, payload.volume);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to play request sound`, error);
    }
  }

  showSpeechGranted(payload) {
    if (!payload?.id || this.shownNotifications.has(payload.id)) return;
    this.shownNotifications.add(payload.id);
    window.setTimeout(() => this.shownNotifications.delete(payload.id), 10000);
    const type = normalizeRequestType(payload.urgency);
    const authorName = String(payload.authorName || localize("Requests.Active.UnknownAuthor"));
    const characterSuffix = payload.characterName ? ` \u2014 ${payload.characterName}` : "";
    const popup = document.createElement("aside");
    popup.classList.add("dmicher-speech-popup");
    popup.setAttribute("role", "status");
    popup.setAttribute("aria-live", "polite");
    const portrait = document.createElement("img");
    portrait.classList.add("dmicher-speech-popup-portrait");
    portrait.src = String(payload.portrait || DEFAULT_USER_PORTRAIT);
    portrait.alt = authorName;
    const typeImage = document.createElement("img");
    typeImage.classList.add("dmicher-speech-popup-type");
    typeImage.src = getRequestImage(type);
    typeImage.alt = localize(REQUEST_TYPES[type].imageAltKey);
    const text = document.createElement("div");
    text.classList.add("dmicher-speech-popup-text");
    const title = document.createElement("strong");
    title.classList.add("dmicher-speech-popup-title");
    title.textContent = localize("Requests.Popup.Granted");
    const person = document.createElement("span");
    person.classList.add("dmicher-speech-popup-person");
    person.textContent = `${authorName}${characterSuffix}`;
    text.append(title, person);
    popup.append(portrait, typeImage, text);
    document.body.append(popup);
    void this.volumeController?.play(SPEECH_GRANTED_SOUND, getRequestBaseVolume(type));
    window.setTimeout(() => {
      popup.classList.add("is-closing");
      window.setTimeout(() => popup.remove(), 200);
    }, 3000);
  }

  showLimitViolation(violation, context = {}) {
    const key = this.getViolationKey(violation);
    const data = this.getViolationData(violation, context);
    ui.notifications.warn(Object.keys(data).length ? format(key, data) : localize(key));
  }

  getViolationKey(violation) {
    return {
      forbidden: "Requests.Limits.ForbiddenNotice",
      environment: "Requests.Limits.EnvironmentNotice",
      count: "Requests.Limits.CountNotice",
      timeout: "Requests.Limits.TimeoutNotice"
    }[violation] ?? "Requests.Chat.Forbidden";
  }

  getViolationData(violation, { type, authorId, state = this.state, configuration = getRequestConfiguration(), now = Date.now() } = {}) {
    if (violation !== "timeout") return {};
    const timeout = getRequestTimeoutStatus(type, authorId, state, configuration, now);
    return { time: formatDigitalDuration(timeout.remaining) };
  }

  sendFeedback(userId, key, level = "warn", data = {}) {
    const payload = { action: "requestFeedback", userId, key, level, data };
    if (userId === game.user.id) this.showFeedback(payload);
    else game.socket.emit(SOCKET_CHANNEL, payload);
  }

  showFeedback(payload) {
    const method = ui.notifications[payload.level] ?? ui.notifications.warn;
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    const message = Object.keys(data).length ? format(payload.key, data) : localize(payload.key);
    method.call(ui.notifications, message);
  }

  hasActiveModerator() {
    return Boolean(game.users?.some?.((user) => user.active && isModerator(user))
      ?? game.users?.find?.((user) => user.active && isModerator(user)));
  }

  handleUserConnected(user, connected) {
    if (!user?.id || isTechnicalUser(user)) return;
    if (!connected) {
      this.welcomedUsers.delete(user.id);
      return;
    }
    if (isPrimaryModerator()) void this.createWelcomeMessage(user.id);
  }

  async requestWelcome(userId) {
    await waitForPremiumReady();
    const user = game.users.get(userId);
    if (!user || !isTechnicalChatEnabled() || !getRequestConfiguration().welcome[isModerator(user) ? "gm" : "players"]) return;
    if (isPrimaryModerator()) return this.createWelcomeMessage(userId);
    if (this.hasActiveModerator()) game.socket.emit(SOCKET_CHANNEL, { action: "requestWelcome", userId });
  }

  async createWelcomeMessage(userId) {
    await waitForPremiumReady();
    if (!isPrimaryModerator() || !isTechnicalChatEnabled() || this.welcomedUsers.has(userId)) return;
    const user = game.users.get(userId);
    if (!user || isTechnicalUser(user) || !getRequestConfiguration().welcome[isModerator(user) ? "gm" : "players"]) return;
    this.welcomedUsers.add(userId);
    try {
      await createTechnicalChatMessages({
        content: buildWelcomeMessageContent(isModerator(user)),
        whisper: [user.id],
        flags: { [MODULE_ID]: { [FLAGS.requestWelcome]: { userId, createdAt: Date.now() } } }
      });
    } catch (error) {
      this.welcomedUsers.delete(userId);
      console.warn(`${MODULE_ID} | Unable to create request welcome message`, error);
    }
  }

  async initializeStateFromLegacyMessages() {
    const current = getActiveRequestState();
    if (current.initialized) return;
    const entries = [];
    let sequence = 0;
    for (const message of game.messages ?? []) {
      const data = message.getFlag(MODULE_ID, FLAGS.request);
      if (!data) continue;
      const storedSequence = Number(data.sequence);
      const entrySequence = Number.isFinite(storedSequence) && storedSequence >= 0
        ? Math.trunc(storedSequence)
        : sequence;
      sequence = Math.max(sequence, entrySequence + 1);
      entries.push({
        ...data,
        id: data.id ?? message.id,
        messageId: message.id,
        sequence: entrySequence,
        characterName: data.characterName ?? data.tokenName ?? "",
        portrait: data.portrait ?? game.users.get(data.authorId)?.avatar ?? DEFAULT_USER_PORTRAIT
      });
    }
    current.initialized = true;
    current.revision += 1;
    current.entries = entries;
    await game.settings.set(MODULE_ID, SETTINGS.activeRequests, current);
    this.applyState(current);
  }

  async preloadAssets() {
    const configuration = getRequestConfiguration();
    const work = [foundry.audio.AudioHelper.preloadSound(SPEECH_GRANTED_SOUND)];
    for (const type of Object.keys(REQUEST_TYPES)) {
      work.push(preloadImage(getRequestImage(type, configuration)));
      work.push(foundry.audio.AudioHelper.preloadSound(getRequestSound(type, configuration)));
    }
    await Promise.allSettled(work);
  }
}

function buildRequestSpeaker(requestData) {
  const scene = String(requestData?.sceneId ?? "");
  const token = scene ? String(requestData?.tokenId ?? "") : "";
  return buildChatSpeaker({
    alias: requestData?.characterName || requestData?.authorName,
    actor: requestData?.actorId,
    token,
    scene: token ? scene : null
  });
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function createRequestId() {
  return foundry.utils.randomID?.()
    ?? globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
