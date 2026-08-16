import { DEFAULT_USER_PORTRAIT, MODULE_ID, REQUEST_TYPES, normalizeRequestType } from "../../config.js";
import {
  confirmDialog,
  escapeHTML,
  format,
  isModerator,
  localize,
  openSingletonApplication
} from "../../utils.js";
import { getRequestImage, normalizeActiveRequestEntry } from "./request-config.js";
import { ActiveRequestsApplication } from "./active-requests-window.js";
import { getGrantActionKey, getRequestAnchorId } from "./request-message.js";

const CHAT_RENDER_BATCH_SIZE = 50;
const CHAT_RENDER_BATCH_MAX_ATTEMPTS = 60;

export class ActiveRequestsController {
  constructor({ resolveRequest, submitRequest }) {
    this.entries = [];
    this.window = null;
    this.feed = null;
    this.resolveRequest = resolveRequest;
    this.submitRequest = submitRequest;
  }

  attachFeed(feed) {
    this.feed = feed;
  }

  openWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return null;
    }
    this.window = openSingletonApplication(this.window, () => new ActiveRequestsApplication(this));
    return this.window;
  }

  forgetWindow(app) {
    if (this.window === app) this.window = null;
  }

  setEntries(entries, { notify = true } = {}) {
    this.entries = (entries ?? []).map(normalizeActiveRequestEntry).filter(Boolean);
    this.sort();
    if (notify) this.notifyChanged();
  }

  rebuild(_messages = game.messages, { notify = true } = {}) {
    if (notify) this.notifyChanged();
  }

  refresh() {
    this.sort();
  }

  register(message, requestData, { notify = true } = {}) {
    const entry = normalizeActiveRequestEntry({
      ...requestData,
      id: requestData.id ?? message?.id,
      messageId: message?.id ?? requestData.messageId
    });
    if (!entry) return;
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) this.entries[index] = entry;
    else this.entries.push(entry);
    this.sort();
    if (notify) this.notifyChanged();
  }

  sort() {
    this.entries.sort((left, right) => (
      (Number(left.sequence) - Number(right.sequence))
      || (Number(left.submittedAt) - Number(right.submittedAt))
      || left.id.localeCompare(right.id)
    ));
  }

  remove(requestId) {
    const initialLength = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== requestId && entry.messageId !== requestId);
    if (initialLength === this.entries.length) return false;
    this.notifyChanged();
    return true;
  }

  notifyChanged() {
    this.window?.onActiveRequestsChanged();
    this.feed?.onActiveRequestsChanged?.();
  }

  getCount() {
    return this.entries.length;
  }

  getUrgentCount() {
    return this.entries.filter((entry) => normalizeRequestType(entry.urgency) === "urgent").length;
  }

  getRows({ showTime = true } = {}) {
    this.sort();
    return this.entries.map((entry) => {
      const request = REQUEST_TYPES[normalizeRequestType(entry.urgency)];
      const submittedAt = Number(entry.submittedAt);
      const characterSuffix = entry.characterName ? ` \u2014 ${entry.characterName}` : "";
      return {
        ...entry,
        portrait: entry.portrait || DEFAULT_USER_PORTRAIT,
        image: getRequestImage(entry.urgency),
        typeLabel: localize(request.labelKey),
        authorText: `${entry.authorName || localize("Requests.Active.UnknownAuthor")}${characterSuffix}`,
        submittedText: showTime
          ? foundry.utils.timeSince(new Date(Number.isFinite(submittedAt) ? submittedAt : Date.now()))
          : "",
        grantLabel: localize(getGrantActionKey(entry.urgency)),
        mayCancel: isModerator() || entry.authorId === game.user.id,
        mayGrant: isModerator()
      };
    });
  }

  async goToMessage(requestId) {
    const entry = this.entries.find((item) => item.id === requestId);
    const messageId = entry?.messageId;
    const message = messageId ? game.messages.get(messageId) : null;
    if (!message) {
      ui.notifications.warn(localize("Requests.Active.NoChatMessage"));
      return;
    }

    await this.activateChatSidebar();
    const element = await this.findMessageAnchor(message.id);
    if (!element) {
      ui.notifications.warn(localize("Requests.Active.MessageNotRendered"));
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("dmicher-request-message-highlight");
    window.setTimeout(() => element.classList.remove("dmicher-request-message-highlight"), 1600);
  }

  async resolve(requestId, action) {
    await this.resolveRequest(requestId, action);
  }

  async submitEnvironmentRequest() {
    if (typeof this.submitRequest !== "function") return false;
    return this.submitRequest("stop");
  }

  async confirmClear() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }
    if (!this.entries.length) {
      ui.notifications.warn(localize("Requests.Active.Empty"));
      return;
    }
    const confirmed = await confirmDialog({
      title: localize("Requests.Active.ClearTitle"),
      content: `<p>${escapeHTML(localize("Requests.Active.ClearConfirm"))}</p>`,
      yes: localize("Requests.Active.ClearYes"),
      no: localize("Requests.Active.ClearNo"),
      icon: "fa-solid fa-trash"
    });
    if (!confirmed) return;
    for (const entry of Array.from(this.entries)) await this.resolveRequest(entry.id, "cancel");
  }

  async activateChatSidebar() {
    ui.chat?.activate?.();
    ui.sidebar?.changeTab?.("chat", "primary");
    ui.sidebar?.activateTab?.("chat");
    if ((typeof ui.chat?.render === "function") && !ui.chat.rendered) await ui.chat.render(true);
    await this.wait(50);
  }

  async findMessageAnchor(messageId) {
    const batchAttempts = this.getChatRenderBatchAttempts(messageId);
    for (let attempt = 0; attempt <= batchAttempts; attempt += 1) {
      const element = document.getElementById(getRequestAnchorId(messageId));
      if (element) return element;
      if (attempt >= batchAttempts || !await this.renderOlderChatBatch()) break;
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
    return Math.min(CHAT_RENDER_BATCH_MAX_ATTEMPTS, Math.max(6, Math.ceil((newerMessages + 1) / CHAT_RENDER_BATCH_SIZE) + 2));
  }

  wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
