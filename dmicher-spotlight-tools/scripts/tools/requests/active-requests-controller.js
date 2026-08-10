import { FLAGS, MODULE_ID, REQUEST_TYPES, normalizeRequestType } from "../../config.js";
import {
  confirmDialog,
  escapeHTML,
  getMessageAuthorName,
  isModerator,
  localize
} from "../../utils.js";
import { ActiveRequestsApplication } from "./active-requests-window.js";
import { getGrantActionKey, getRequestAnchorId } from "./request-message.js";

const CHAT_RENDER_BATCH_SIZE = 50;
const CHAT_RENDER_BATCH_MAX_ATTEMPTS = 60;

export class ActiveRequestsController {
  constructor({ resolveRequest, onRequestResolved }) {
    this.entries = [];
    this.nextSequence = 0;
    this.window = null;
    this.resolveRequest = resolveRequest;
    this.onRequestResolved = onRequestResolved;
  }

  openWindow() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return null;
    }

    if (this.window?.rendered) {
      this.window.bringToFront();
      return this.window;
    }

    this.window = new ActiveRequestsApplication(this);
    void this.window.render({ force: true });
    return this.window;
  }

  forgetWindow(app) {
    if (this.window === app) this.window = null;
  }

  rebuild(messages = game.messages, { notify = true } = {}) {
    this.entries = [];
    this.nextSequence = 0;
    for (const message of messages ?? []) {
      const requestData = message.getFlag(MODULE_ID, FLAGS.request);
      if (requestData) this.register(message, requestData, { notify: false });
    }
    this.sort();
    if (notify) this.notifyChanged();
  }

  refresh() {
    this.rebuild(game.messages, { notify: false });
  }

  register(message, requestData, { notify = true } = {}) {
    const entry = this.createEntry(message, requestData);
    const existingIndex = this.entries.findIndex((request) => request.messageId === entry.messageId);
    if (existingIndex >= 0) {
      entry.sequence = this.entries[existingIndex].sequence;
      this.entries[existingIndex] = entry;
    }
    else this.entries.push(entry);
    this.sort();
    if (notify) this.notifyChanged();
  }

  createEntry(message, requestData) {
    const submittedAt = Number(message.timestamp ?? requestData.submittedAt ?? requestData.createdAt ?? Date.now());
    return {
      messageId: message.id,
      urgency: normalizeRequestType(requestData.urgency),
      authorId: String(requestData.authorId ?? ""),
      authorName: String(requestData.authorName ?? getMessageAuthorName(message)).slice(0, 100),
      submittedAt,
      sequence: this.nextSequence++
    };
  }

  sort() {
    this.entries.sort((left, right) => (
      (Number(left.sequence) - Number(right.sequence))
      || String(left.messageId).localeCompare(String(right.messageId))
    ));
  }

  remove(messageId, { broadcast = false } = {}) {
    const initialLength = this.entries.length;
    this.entries = this.entries.filter((request) => request.messageId !== messageId);
    if (this.entries.length === initialLength) return false;
    this.notifyChanged();
    if (broadcast) this.onRequestResolved(messageId);
    return true;
  }

  notifyChanged() {
    this.window?.onActiveRequestsChanged();
  }

  getCount() {
    return this.entries.length;
  }

  getUrgentCount() {
    return this.entries.filter((entry) => normalizeRequestType(entry.urgency) === "urgent").length;
  }

  getRows() {
    this.sort();
    return this.entries.map((entry) => {
      const request = REQUEST_TYPES[normalizeRequestType(entry.urgency)];
      const submittedAt = Number(entry.submittedAt);
      return {
        ...entry,
        image: request.image,
        typeLabel: localize(request.labelKey),
        authorText: entry.authorName || localize("Requests.Active.UnknownAuthor"),
        submittedText: foundry.utils.timeSince(new Date(Number.isFinite(submittedAt) ? submittedAt : Date.now())),
        grantLabel: localize(getGrantActionKey(entry.urgency))
      };
    });
  }

  async goToMessage(messageId) {
    const message = game.messages.get(messageId);
    if (!message) {
      await this.confirmMissingCleanup(messageId);
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

  async resolve(messageId, action) {
    const message = game.messages.get(messageId);
    if (!message) {
      await this.confirmMissingCleanup(messageId);
      return;
    }
    await this.resolveRequest(message, action);
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

    for (const entry of Array.from(this.entries)) {
      const message = game.messages.get(entry.messageId);
      if (!message) {
        this.remove(entry.messageId, { broadcast: true });
        continue;
      }
      await this.resolveRequest(message, "cancel");
    }
  }

  async confirmMissingCleanup(messageId) {
    const confirmed = await confirmDialog({
      title: localize("Requests.Active.MissingTitle"),
      content: `<p>${escapeHTML(localize("Requests.Active.MissingContent"))}</p>`,
      yes: localize("Requests.Active.MissingDelete"),
      no: localize("Requests.Active.MissingKeep"),
      icon: "fa-solid fa-trash"
    });
    if (confirmed) this.remove(messageId, { broadcast: true });
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

  async findMessageAnchor(messageId) {
    const batchAttempts = this.getChatRenderBatchAttempts(messageId);
    for (let attempt = 0; attempt <= batchAttempts; attempt += 1) {
      const element = document.getElementById(getRequestAnchorId(messageId));
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

  wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
