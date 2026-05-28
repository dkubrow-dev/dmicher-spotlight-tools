import { FLAGS, MODULE_ID, REQUEST_TYPES, SOCKET_CHANNEL, SPEECH_GRANTED_SOUND, normalizeRequestType } from "../../config.js";
import {
  canUseRequest,
  format,
  getChatMessageClass,
  isModerator,
  localize,
  playAudio,
  preloadImage
} from "../../utils.js";
import { ActiveRequestsController } from "./active-requests-controller.js";
import {
  buildRequestMessageContent,
  buildTechnicalMessageLines,
  renderRequestChatMessage
} from "./request-message.js";
import { getRequestStyle, getRequestText } from "./request-settings.js";

export class RequestTool {
  constructor() {
    this.resolvingRequests = new Set();
    this.shownNotifications = new Set();
    this.submitRequest = this.submitRequest.bind(this);
    this.resolveRequest = this.resolveRequest.bind(this);
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.handleChatMessageCreated = this.handleChatMessageCreated.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
    this.activeRequests = new ActiveRequestsController({
      resolveRequest: this.resolveRequest,
      onRequestResolved: (messageId) => this.broadcastRequestResolved(messageId)
    });
  }

  registerHooks() {
    Hooks.on("renderChatMessageHTML", this.renderChatMessage);
    Hooks.on("createChatMessage", this.handleChatMessageCreated);
  }

  activate() {
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    this.activeRequests.rebuild();
    void this.preloadAssets();
  }

  openActiveRequestsWindow() {
    return this.activeRequests.openWindow();
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
        content: buildRequestMessageContent(normalizedType, getRequestText(request), getRequestStyle(request)),
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

  renderChatMessage(message, html) {
    renderRequestChatMessage(message, html, {
      resolveRequest: this.resolveRequest
    });
  }

  handleChatMessageCreated(message) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.request);
    if (requestData) this.activeRequests.register(message, requestData);
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
      this.activeRequests.remove(message.id);
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
      content: `<section class="dmicher-request-technical">${buildTechnicalMessageLines(resolutionData)}</section>`,
      whisper: this.getTechnicalMessageRecipients(requestData.authorId),
      flags: {
        [MODULE_ID]: {
          [FLAGS.resolution]: resolutionData
        }
      }
    });
  }

  getTechnicalMessageRecipients(authorId) {
    const recipients = new Set([authorId]);
    for (const user of game.users) {
      if (isModerator(user)) recipients.add(user.id);
    }
    return Array.from(recipients);
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
        this.activeRequests.remove(payload.messageId);
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
      await playAudio(src, { broadcast });
    } catch (error) {
      console.warn(`${MODULE_ID} | Unable to play ${context} sound`, error);
    }
  }

  async preloadAssets() {
    const work = [foundry.audio.AudioHelper.preloadSound(SPEECH_GRANTED_SOUND)];
    for (const request of Object.values(REQUEST_TYPES)) {
      work.push(preloadImage(request.image));
      work.push(foundry.audio.AudioHelper.preloadSound(request.sound));
    }
    await Promise.allSettled(work);
  }
}
