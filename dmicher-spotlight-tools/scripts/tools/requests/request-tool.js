import { FLAGS, MODULE_ID, REQUEST_TYPES, SOCKET_CHANNEL, SPEECH_GRANTED_SOUND, normalizeRequestType } from "../../config.js";
import {
  canUseRequest,
  escapeHTML,
  format,
  formatDuration,
  formatTimestamp,
  getChatMessageClass,
  isModerator,
  localize
} from "../../utils.js";
import { ActiveRequestsApplication } from "./active-requests-window.js";
import { getRequestStyle, getRequestText } from "./request-settings.js";

const { DialogV2 } = foundry.applications.api;
const CHAT_RENDER_BATCH_SIZE = 50;
const CHAT_RENDER_BATCH_MAX_ATTEMPTS = 60;

export class RequestTool {
  constructor() {
    this.activeRequests = [];
    this.activeRequestsWindow = null;
    this.resolvingRequests = new Set();
    this.shownNotifications = new Set();
    this.submitRequest = this.submitRequest.bind(this);
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.handleChatMessageCreated = this.handleChatMessageCreated.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
  }

  registerHooks() {
    Hooks.on("renderChatMessageHTML", this.renderChatMessage);
    Hooks.on("createChatMessage", this.handleChatMessageCreated);
  }

  activate() {
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    this.rebuildActiveRequests();
    void this.preloadAssets();
  }

  openActiveRequestsWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return null;
    }

    if (this.activeRequestsWindow?.rendered) {
      this.activeRequestsWindow.bringToFront();
      return this.activeRequestsWindow;
    }

    this.activeRequestsWindow = new ActiveRequestsApplication(this);
    void this.activeRequestsWindow.render({ force: true });
    return this.activeRequestsWindow;
  }

  forgetActiveRequestsWindow(app) {
    if (this.activeRequestsWindow === app) this.activeRequestsWindow = null;
  }

  async submitRequest(type) {
    const normalizedType = normalizeRequestType(type);
    const request = REQUEST_TYPES[normalizedType];
    if (!canUseRequest(request)) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    const ChatMessageClass = getChatMessageClass();
    const token = canvas?.tokens?.controlled?.[0] ?? null;
    const requestData = {
      urgency: normalizedType,
      authorId: game.user.id,
      authorName: game.user.name,
      tokenName: token?.name ?? "",
      submittedAt: Date.now(),
      createdAt: game.time.serverTime
    };
    const speaker = ChatMessageClass.getSpeaker(token ? { token } : {});

    try {
      await ChatMessageClass.create({
        user: game.user.id,
        speaker,
        content: this.buildRequestMessageContent(normalizedType, getRequestText(request), getRequestStyle(request)),
        flags: {
          [MODULE_ID]: {
            [FLAGS.request]: requestData
          }
        }
      });
      await this.playSound(request.sound, true, "request");
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to submit request`, error);
      ui.notifications.error(localize("Requests.Chat.SubmitError"));
    }
  }

  buildRequestMessageContent(type, text, style) {
    const request = REQUEST_TYPES[type];
    const message = escapeHTML(String(text ?? "")).replace(/\r?\n/g, "<br>");
    return `
      <section class="dmicher-request-card dmicher-request-${type}">
        <h3 data-request-label>${escapeHTML(localize(request.labelKey))}</h3>
        <p class="dmicher-request-text" style="${escapeHTML(style)}">${message}</p>
        <img class="dmicher-request-card-image" src="${request.image}" alt="${escapeHTML(localize(request.imageAltKey))}">
        <div class="dmicher-request-actions" aria-label="${escapeHTML(localize("Requests.Chat.Actions"))}">
          <button type="button" data-request-action="cancel">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span data-request-action-label="cancel">${escapeHTML(localize("Requests.Chat.Cancel"))}</span>
          </button>
          <button type="button" data-request-action="grant">
            <i class="fa-solid fa-comment" aria-hidden="true"></i>
            <span data-request-action-label="grant">${escapeHTML(localize(this.getGrantActionKey(type)))}</span>
          </button>
        </div>
      </section>`;
  }

  renderChatMessage(message, html) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.request);
    if (requestData) {
      this.attachRequestAnchor(message, html);
      this.activateRequestMessageActions(message, html, requestData);
    }

    const resolutionData = message.getFlag(MODULE_ID, FLAGS.resolution);
    if (!resolutionData || (typeof resolutionData !== "object")) return;
    const technicalMessage = html.querySelector(".dmicher-request-technical");
    if (technicalMessage) technicalMessage.innerHTML = this.buildTechnicalMessageLines(resolutionData);
  }

  attachRequestAnchor(message, html) {
    const card = html.querySelector(".dmicher-request-card");
    if (!card) return;
    card.id = this.getRequestAnchorId(message.id);
    card.dataset.dmicherRequestMessageId = message.id;
  }

  activateRequestMessageActions(message, html, requestData) {
    const request = REQUEST_TYPES[normalizeRequestType(requestData.urgency)];
    const heading = html.querySelector("[data-request-label], .dmicher-request-card h3");
    const image = html.querySelector(".dmicher-request-card-image");
    const actions = html.querySelector(".dmicher-request-actions");
    if (!actions) return;

    if (heading) heading.textContent = localize(request.labelKey);
    if (image) image.alt = localize(request.imageAltKey);
    actions.setAttribute("aria-label", localize("Requests.Chat.Actions"));

    const mayCancel = isModerator() || requestData.authorId === game.user.id;
    const mayGrant = isModerator();
    const cancelButton = actions.querySelector('[data-request-action="cancel"]');
    const grantButton = actions.querySelector('[data-request-action="grant"]');
    this.localizeActionButton(cancelButton, "Requests.Chat.Cancel", "cancel");
    this.localizeActionButton(grantButton, this.getGrantActionKey(requestData.urgency), "grant");
    if (cancelButton) cancelButton.hidden = !mayCancel;
    if (grantButton) grantButton.hidden = !mayGrant;

    if (mayCancel || mayGrant) actions.classList.add("is-available");
    actions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-request-action]");
      if (!button) return;
      event.preventDefault();
      void this.resolveRequest(message, button.dataset.requestAction);
    });
  }

  localizeActionButton(button, key, action) {
    if (!button) return;
    let label = button.querySelector(`[data-request-action-label="${action}"]`);
    if (!label) {
      for (const node of Array.from(button.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      }
      label = document.createElement("span");
      label.dataset.requestActionLabel = action;
      button.append(" ", label);
    }
    label.textContent = localize(key);
  }

  getGrantActionKey(type) {
    return normalizeRequestType(type) === "stop" ? "Requests.Chat.TakeFloor" : "Requests.Chat.GiveFloor";
  }

  async resolveRequest(message, action) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.request);
    if (!requestData) return false;

    const completed = action === "grant";
    const permitted = completed ? isModerator() : (isModerator() || requestData.authorId === game.user.id);
    if (!permitted) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return false;
    }
    if (!completed && !isModerator() && !game.user.can("MESSAGE_WHISPER")) {
      ui.notifications.warn(localize("Requests.Chat.WhisperRequired"));
      return false;
    }

    if (this.resolvingRequests.has(message.id)) return false;
    this.resolvingRequests.add(message.id);

    try {
      if (!game.messages.get(message.id)) return false;
      const createdAt = Number(requestData.createdAt ?? message.timestamp ?? game.time.serverTime);
      const elapsed = game.time.serverTime - createdAt;
      if (completed && normalizeRequestType(requestData.urgency) === "stop") {
        await game.togglePause(true, { broadcast: true });
      }
      await message.delete();
      this.removeActiveRequest(message.id);
      this.broadcastRequestResolved(message.id);

      if (completed) this.broadcastSpeechGranted(requestData);
      await this.createTechnicalMessage(requestData, completed, elapsed);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to resolve request`, error);
      ui.notifications.error(localize("Requests.Chat.ResolveError"));
      return false;
    } finally {
      this.resolvingRequests.delete(message.id);
    }
  }

  async createTechnicalMessage(requestData, completed, elapsed) {
    const ChatMessageClass = getChatMessageClass();
    const resolutionData = {
      outcome: completed ? "completed" : "cancelled",
      resolverName: completed ? "" : game.user.name,
      requestData,
      elapsed
    };

    await ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content: `<section class="dmicher-request-technical">${this.buildTechnicalMessageLines(resolutionData)}</section>`,
      whisper: this.getTechnicalMessageRecipients(requestData.authorId),
      flags: {
        [MODULE_ID]: {
          [FLAGS.resolution]: resolutionData
        }
      }
    });
  }

  buildTechnicalMessageLines(resolutionData) {
    const requestData = resolutionData.requestData ?? {};
    const request = REQUEST_TYPES[normalizeRequestType(requestData.urgency)];
    const author = requestData.tokenName
      ? `${requestData.authorName} (${requestData.tokenName})`
      : requestData.authorName;
    const submittedAt = Number(requestData.submittedAt ?? requestData.createdAt ?? (game.time.serverTime - Number(resolutionData.elapsed ?? 0)));
    const data = {
      author,
      resolver: resolutionData.resolverName ?? "",
      timestamp: formatTimestamp(submittedAt),
      duration: formatDuration(resolutionData.elapsed),
      type: localize(request.typeLabelKey)
    };
    const titleKey = resolutionData.outcome === "completed"
      ? "Requests.Technical.InGameTitle"
      : "Requests.Technical.CancelledTitle";
    const title = escapeHTML(format(titleKey, data));
    const details = escapeHTML(format("Requests.Technical.Details", data));
    const resolver = resolutionData.outcome === "cancelled"
      ? `<small class="dmicher-request-technical-meta">${escapeHTML(format("Requests.Technical.Resolver", data))}</small>`
      : "";
    const type = escapeHTML(format("Requests.Technical.Type", data));

    return `
      <strong class="dmicher-request-technical-title">${title}</strong>
      <small class="dmicher-request-technical-meta">${details}</small>
      ${resolver}
      <small class="dmicher-request-technical-meta">${type}</small>`;
  }

  getTechnicalMessageRecipients(authorId) {
    const recipients = new Set([authorId]);
    for (const user of game.users) {
      if (isModerator(user)) recipients.add(user.id);
    }
    return Array.from(recipients);
  }

  handleChatMessageCreated(message) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.request);
    if (requestData) this.registerActiveRequest(message, requestData);
  }

  rebuildActiveRequests() {
    this.activeRequests = [];
    for (const message of game.messages ?? []) {
      const requestData = message.getFlag(MODULE_ID, FLAGS.request);
      if (requestData) this.registerActiveRequest(message, requestData, { notify: false });
    }
    this.sortActiveRequests();
  }

  registerActiveRequest(message, requestData, { notify = true } = {}) {
    const entry = this.createActiveRequestEntry(message, requestData);
    const existingIndex = this.activeRequests.findIndex((request) => request.messageId === entry.messageId);
    if (existingIndex >= 0) this.activeRequests[existingIndex] = entry;
    else this.activeRequests.push(entry);
    this.sortActiveRequests();
    if (notify) this.onActiveRequestsChanged();
  }

  createActiveRequestEntry(message, requestData) {
    return {
      messageId: message.id,
      urgency: normalizeRequestType(requestData.urgency),
      authorId: String(requestData.authorId ?? ""),
      authorName: String(requestData.authorName ?? message.user?.name ?? "").slice(0, 100),
      submittedAt: Number(requestData.submittedAt ?? requestData.createdAt ?? message.timestamp ?? Date.now()),
      createdAt: Number(requestData.createdAt ?? message.timestamp ?? Date.now())
    };
  }

  sortActiveRequests() {
    this.activeRequests.sort((left, right) => Number(left.submittedAt) - Number(right.submittedAt));
  }

  removeActiveRequest(messageId) {
    const initialLength = this.activeRequests.length;
    this.activeRequests = this.activeRequests.filter((request) => request.messageId !== messageId);
    if (this.activeRequests.length === initialLength) return false;
    this.onActiveRequestsChanged();
    return true;
  }

  onActiveRequestsChanged() {
    this.activeRequestsWindow?.onActiveRequestsChanged();
  }

  getActiveRequestRows() {
    return this.activeRequests.map((entry, index) => {
      const request = REQUEST_TYPES[normalizeRequestType(entry.urgency)];
      return {
        ...entry,
        rowNumber: index + 1,
        image: request.image,
        typeLabel: localize(request.labelKey),
        authorText: entry.authorName || localize("Requests.Active.UnknownAuthor"),
        submittedText: format("Requests.Active.Ago", {
          duration: formatDuration(Date.now() - Number(entry.submittedAt))
        }),
        grantLabel: localize(this.getGrantActionKey(entry.urgency))
      };
    });
  }

  async goToActiveRequestMessage(messageId) {
    const message = game.messages.get(messageId);
    if (!message) {
      await this.confirmMissingRequestCleanup(messageId);
      return;
    }

    await this.activateChatSidebar();
    const element = await this.findRequestMessageAnchor(message.id);
    if (!element) {
      ui.notifications.warn(localize("Requests.Active.MessageNotRendered"));
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("dmicher-request-message-highlight");
    window.setTimeout(() => element.classList.remove("dmicher-request-message-highlight"), 1600);
  }

  async resolveActiveRequest(messageId, action) {
    const message = game.messages.get(messageId);
    if (!message) {
      await this.confirmMissingRequestCleanup(messageId);
      return;
    }
    await this.resolveRequest(message, action);
  }

  async confirmClearActiveRequests() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    if (!this.activeRequests.length) {
      ui.notifications.warn(localize("Requests.Active.Empty"));
      return;
    }

    const confirmed = await this.confirm({
      title: localize("Requests.Active.ClearTitle"),
      content: `<p>${escapeHTML(localize("Requests.Active.ClearConfirm"))}</p>`,
      yes: localize("Requests.Active.ClearYes"),
      no: localize("Requests.Active.ClearNo"),
      icon: "fa-solid fa-trash"
    });
    if (!confirmed) return;

    for (const entry of Array.from(this.activeRequests)) {
      const message = game.messages.get(entry.messageId);
      if (!message) {
        if (this.removeActiveRequest(entry.messageId)) this.broadcastRequestResolved(entry.messageId);
        continue;
      }
      await this.resolveRequest(message, "cancel");
    }
  }

  async confirmMissingRequestCleanup(messageId) {
    const confirmed = await this.confirm({
      title: localize("Requests.Active.MissingTitle"),
      content: `<p>${escapeHTML(localize("Requests.Active.MissingContent"))}</p>`,
      yes: localize("Requests.Active.MissingDelete"),
      no: localize("Requests.Active.MissingKeep"),
      icon: "fa-solid fa-trash"
    });
    if (confirmed) this.removeActiveRequest(messageId);
  }

  async confirm({ title, content, yes, no, icon }) {
    if (DialogV2?.confirm) {
      return DialogV2.confirm({
        window: { title },
        content,
        modal: true,
        rejectClose: false,
        yes: {
          label: yes,
          icon
        },
        no: {
          label: no
        }
      });
    }
    return window.confirm(`${title}\n\n${content.replace(/<[^>]+>/g, "")}`);
  }

  async activateChatSidebar() {
    ui.chat?.activate?.();
    ui.sidebar?.changeTab?.("chat", "primary");
    ui.sidebar?.activateTab?.("chat");
    if ((typeof ui.chat?.render === "function") && !ui.chat.rendered) {
      await ui.chat.render({ force: true });
    }
    await this.wait(50);
  }

  async findRequestMessageAnchor(messageId) {
    const batchAttempts = this.getChatRenderBatchAttempts(messageId);
    for (let attempt = 0; attempt <= batchAttempts; attempt += 1) {
      const element = document.getElementById(this.getRequestAnchorId(messageId));
      if (element) return element;
      if (attempt >= batchAttempts) break;
      if (!await this.renderOlderChatBatch()) break;
      await this.wait(50);
    }
    return null;
  }

  async renderOlderChatBatch() {
    if (typeof ui.chat?.renderBatch !== "function") return false;
    try {
      await ui.chat.renderBatch(CHAT_RENDER_BATCH_SIZE);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to render older chat messages while looking for active request`, error);
      return false;
    }
  }

  getChatRenderBatchAttempts(messageId) {
    const message = game.messages.get(messageId);
    if (!message) return 0;

    const messages = Array.from(game.messages ?? []);
    const targetTimestamp = Number(message.timestamp ?? message.createdAt ?? 0);
    const newerMessages = targetTimestamp
      ? messages.filter((item) => Number(item.timestamp ?? item.createdAt ?? 0) > targetTimestamp).length
      : messages.length;
    const requiredAttempts = Math.ceil((newerMessages + 1) / CHAT_RENDER_BATCH_SIZE) + 2;
    return Math.min(CHAT_RENDER_BATCH_MAX_ATTEMPTS, Math.max(6, requiredAttempts));
  }

  getRequestAnchorId(messageId) {
    return `dmicher-request-message-${messageId}`;
  }

  wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  broadcastSpeechGranted(requestData) {
    const payload = {
      action: "speechGranted",
      id: foundry.utils.randomID(),
      urgency: normalizeRequestType(requestData.urgency),
      authorName: String(requestData.authorName ?? "").slice(0, 100),
      tokenName: String(requestData.tokenName ?? "").slice(0, 100)
    };

    this.showSpeechGranted(payload);
    game.socket.emit(SOCKET_CHANNEL, payload);
  }

  receiveSocketMessage(payload) {
    switch (payload?.action) {
      case "speechGranted":
        this.showSpeechGranted(payload);
        break;
      case "requestResolved":
        this.removeActiveRequest(payload.messageId);
        break;
    }
  }

  broadcastRequestResolved(messageId) {
    game.socket.emit(SOCKET_CHANNEL, {
      action: "requestResolved",
      messageId
    });
  }

  showSpeechGranted(payload) {
    if (!payload.id || this.shownNotifications.has(payload.id)) return;
    this.shownNotifications.add(payload.id);
    window.setTimeout(() => this.shownNotifications.delete(payload.id), 10000);

    const request = REQUEST_TYPES[normalizeRequestType(payload.urgency)];
    const tokenSuffix = payload.tokenName ? ` (${payload.tokenName})` : "";
    const popup = document.createElement("aside");
    popup.classList.add("dmicher-speech-popup");
    popup.setAttribute("role", "status");
    popup.setAttribute("aria-live", "polite");

    const image = document.createElement("img");
    image.src = request.image;
    image.alt = localize(request.imageAltKey);
    const text = document.createElement("p");
    text.textContent = format("Requests.Popup.Granted", {
      name: payload.authorName,
      token: tokenSuffix
    });
    popup.append(image, text);
    document.body.append(popup);
    void this.playSound(SPEECH_GRANTED_SOUND, false, "speech granted");

    window.setTimeout(() => {
      popup.classList.add("is-closing");
      window.setTimeout(() => popup.remove(), 200);
    }, 3000);
  }

  async playSound(src, broadcast, context) {
    try {
      await foundry.audio.AudioHelper.play({
        src,
        volume: 1,
        autoplay: true,
        loop: false
      }, broadcast);
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to play ${context} sound`, error);
    }
  }

  async preloadAssets() {
    const work = [foundry.audio.AudioHelper.preloadSound(SPEECH_GRANTED_SOUND)];
    for (const request of Object.values(REQUEST_TYPES)) {
      work.push(this.preloadImage(request.image));
      work.push(foundry.audio.AudioHelper.preloadSound(request.sound));
    }
    await Promise.allSettled(work);
  }

  preloadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
      image.src = src;
    });
  }
}
