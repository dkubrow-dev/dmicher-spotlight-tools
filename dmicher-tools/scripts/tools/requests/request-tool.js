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
import { getRequestStyle, getRequestText } from "./request-settings.js";

export class RequestTool {
  constructor() {
    this.resolvingRequests = new Set();
    this.shownNotifications = new Set();
    this.submitRequest = this.submitRequest.bind(this);
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
  }

  activate() {
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
    void this.preloadAssets();
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
    if (requestData) this.activateRequestMessageActions(message, html, requestData);

    const resolutionData = message.getFlag(MODULE_ID, FLAGS.resolution);
    if (!resolutionData || (typeof resolutionData !== "object")) return;
    const technicalMessage = html.querySelector(".dmicher-request-technical");
    if (technicalMessage) technicalMessage.innerHTML = this.buildTechnicalMessageLines(resolutionData);
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
    if (!requestData) return;

    const completed = action === "grant";
    const permitted = completed ? isModerator() : (isModerator() || requestData.authorId === game.user.id);
    if (!permitted) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }
    if (!completed && !isModerator() && !game.user.can("MESSAGE_WHISPER")) {
      ui.notifications.warn(localize("Requests.Chat.WhisperRequired"));
      return;
    }

    if (this.resolvingRequests.has(message.id)) return;
    this.resolvingRequests.add(message.id);

    try {
      if (!game.messages.get(message.id)) return;
      const createdAt = Number(requestData.createdAt ?? message.timestamp ?? game.time.serverTime);
      const elapsed = game.time.serverTime - createdAt;
      if (completed && normalizeRequestType(requestData.urgency) === "stop") {
        await game.togglePause(true, { broadcast: true });
      }
      await message.delete();

      if (completed) this.broadcastSpeechGranted(requestData);
      await this.createTechnicalMessage(requestData, completed, elapsed);
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to resolve request`, error);
      ui.notifications.error(localize("Requests.Chat.ResolveError"));
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
    if (payload?.action !== "speechGranted") return;
    this.showSpeechGranted(payload);
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
