import { FLAGS, MODULE_ID, SETTINGS, SOCKET_CHANNEL } from "../../config.js";
import {
  escapeHTML,
  format,
  formatTimestamp,
  getChatMessageClass,
  getModeratorUserIds,
  isModerator,
  isPrimaryModerator,
  localize
} from "../../utils.js";
import { ReadinessApplication } from "./readiness-window.js";
import {
  READINESS_STATUS,
  READINESS_STATUS_CONFIG,
  createEmptyReadinessState,
  normalizeReadinessState,
  normalizeReadinessStatus
} from "./readiness-utils.js";

const READINESS_CARD_STYLES = Object.freeze({
  "align-items": "stretch",
  display: "flex",
  "flex-direction": "column",
  gap: "0.45rem",
  "justify-content": "center",
  "text-align": "center",
  width: "100%"
});

const READINESS_TEXT_STYLES = Object.freeze({
  margin: "0",
  "text-align": "center",
  width: "100%"
});

const READINESS_ACTIONS_STYLES = Object.freeze({
  "align-items": "center",
  display: "flex",
  "flex-wrap": "wrap",
  gap: "0.45rem",
  "justify-content": "center",
  margin: "0.15rem auto 0",
  "text-align": "center",
  width: "100%"
});

const READINESS_BUTTON_BASE_STYLES = Object.freeze({
  "align-items": "center",
  display: "inline-flex",
  flex: "0 0 auto",
  "justify-content": "center",
  margin: "0",
  "min-width": "7rem",
  width: "auto"
});

const READINESS_BUTTON_STYLES = Object.freeze({
  ready: Object.freeze({
    "--button-background-color": "rgba(105, 183, 128, 0.3)",
    "--button-border-color": "rgba(74, 145, 94, 0.75)",
    "--button-hover-background-color": "rgba(105, 183, 128, 0.44)",
    "--button-hover-border-color": "rgba(74, 145, 94, 0.9)",
    background: "rgba(105, 183, 128, 0.3)",
    "border-color": "rgba(74, 145, 94, 0.75)"
  }),
  notReady: Object.freeze({
    "--button-background-color": "rgba(204, 94, 94, 0.3)",
    "--button-border-color": "rgba(166, 72, 72, 0.75)",
    "--button-hover-background-color": "rgba(204, 94, 94, 0.44)",
    "--button-hover-border-color": "rgba(166, 72, 72, 0.9)",
    background: "rgba(204, 94, 94, 0.3)",
    "border-color": "rgba(166, 72, 72, 0.75)"
  })
});

function applyImportantStyles(element, styles) {
  if (!element) return;
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value, "important");
  }
}

export class ReadinessTool {
  constructor() {
    this.state = createEmptyReadinessState();
    this.window = null;
    this.renderChatMessage = this.renderChatMessage.bind(this);
    this.receiveSocketMessage = this.receiveSocketMessage.bind(this);
  }

  registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.readinessState, {
      scope: "world",
      config: false,
      type: Object,
      default: createEmptyReadinessState(),
      onChange: (value) => this.onStateChanged(value)
    });
  }

  registerHooks() {
    Hooks.on("renderChatMessageHTML", this.renderChatMessage);
  }

  activate() {
    this.state = normalizeReadinessState(game.settings.get(MODULE_ID, SETTINGS.readinessState));
    game.socket.on(SOCKET_CHANNEL, this.receiveSocketMessage);
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

    this.window = new ReadinessApplication(this);
    void this.window.render({ force: true });
    return this.window;
  }

  forgetWindow(app) {
    if (this.window === app) this.window = null;
  }

  onStateChanged(rawState) {
    this.state = normalizeReadinessState(rawState);
    this.window?.onReadinessChanged();
  }

  getRows() {
    return Array.from(game.users).map((user) => {
      const entry = this.state.players[user.id] ?? {};
      const status = normalizeReadinessStatus(entry.status);
      const statusConfig = READINESS_STATUS_CONFIG[status];
      const selected = Boolean(this.state.selected[user.id]);
      return {
        userId: user.id,
        name: user.name,
        selected,
        inactive: selected ? "" : "is-inactive",
        status,
        statusLabel: localize(statusConfig.labelKey),
        statusLevel: statusConfig.indicator
      };
    }).sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      return left.name.localeCompare(right.name, game.i18n.lang);
    });
  }

  async setSelected(userId, selected) {
    await this.updateState((state) => {
      state.selected[userId] = Boolean(selected);
      if (!state.players[userId]) state.players[userId] = this.createWaitingEntry();
    });
  }

  async requestReadiness() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    const selectedUsers = Array.from(game.users).filter((user) => this.state.selected[user.id]);
    if (!selectedUsers.length) {
      ui.notifications.warn(localize("Readiness.NoPlayers"));
      return;
    }
    if (Object.values(this.state.players).some((entry) => entry.status !== READINESS_STATUS.waiting)) {
      ui.notifications.warn(localize("Readiness.ClearFirst"));
      return;
    }

    const requestedAt = Date.now();
    await this.updateState((state) => {
      for (const user of selectedUsers) {
        state.players[user.id] = {
          status: READINESS_STATUS.pending,
          requestedAt,
          requestedByName: game.user.name,
          requestMessageId: ""
        };
      }
    });

    for (const user of selectedUsers) {
      const message = await this.createRequestMessage(user, requestedAt);
      if (!message?.id) continue;
      await this.updateState((state) => {
        const entry = state.players[user.id] ?? this.createWaitingEntry();
        entry.requestMessageId = message.id;
        state.players[user.id] = entry;
      });
    }
  }

  async createRequestMessage(user, requestedAt) {
    const ChatMessageClass = getChatMessageClass();
    const requestData = {
      userId: user.id,
      requestedAt,
      requestedByName: game.user.name
    };

    return ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content: this.buildRequestContent(requestData),
      whisper: Array.from(new Set([user.id, ...getModeratorUserIds()])),
      flags: {
        [MODULE_ID]: {
          [FLAGS.readinessRequest]: requestData
        }
      }
    });
  }

  buildRequestContent(requestData) {
    return `
      <section class="dmicher-readiness-card" data-readiness-request>
        <h3 data-readiness-heading>${escapeHTML(localize("Readiness.Message.Title"))}</h3>
        <p data-readiness-text>${escapeHTML(format("Readiness.Message.Text", { gm: requestData.requestedByName }))}</p>
        <div class="dmicher-readiness-actions">
          <button type="button" class="dmicher-readiness-ready" data-readiness-response="ready">
            <i class="fa-solid fa-check" aria-hidden="true"></i>
            <span data-readiness-label="ready">${escapeHTML(localize("Readiness.Message.Ready"))}</span>
          </button>
          <button type="button" class="dmicher-readiness-not-ready" data-readiness-response="notReady">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span data-readiness-label="notReady">${escapeHTML(localize("Readiness.Message.NotReady"))}</span>
          </button>
        </div>
      </section>`;
  }

  renderChatMessage(message, html) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.readinessRequest);
    if (!requestData) return;

    const card = html.querySelector("[data-readiness-request]");
    if (!card) return;
    card.querySelector("[data-readiness-heading]").textContent = localize("Readiness.Message.Title");
    card.querySelector("[data-readiness-text]").textContent = format("Readiness.Message.Text", { gm: requestData.requestedByName });
    card.querySelector("[data-readiness-label='ready']").textContent = localize("Readiness.Message.Ready");
    card.querySelector("[data-readiness-label='notReady']").textContent = localize("Readiness.Message.NotReady");
    this.styleRequestCard(card);

    const actions = card.querySelector(".dmicher-readiness-actions");
    if (requestData.userId !== game.user.id) {
      if (actions) {
        actions.hidden = true;
        actions.style.setProperty("display", "none", "important");
      }
      return;
    }

    actions?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-readiness-response]");
      if (!button) return;
      event.preventDefault();
      void this.answerRequest(message, button.dataset.readinessResponse);
    });
  }

  styleRequestCard(card) {
    applyImportantStyles(card, READINESS_CARD_STYLES);
    applyImportantStyles(card.querySelector("[data-readiness-heading]"), READINESS_TEXT_STYLES);
    applyImportantStyles(card.querySelector("[data-readiness-text]"), READINESS_TEXT_STYLES);
    applyImportantStyles(card.querySelector(".dmicher-readiness-actions"), READINESS_ACTIONS_STYLES);

    for (const button of card.querySelectorAll("[data-readiness-response]")) {
      applyImportantStyles(button, READINESS_BUTTON_BASE_STYLES);
      applyImportantStyles(button, READINESS_BUTTON_STYLES[button.dataset.readinessResponse] ?? {});
    }
  }

  async answerRequest(message, status) {
    const requestData = message.getFlag(MODULE_ID, FLAGS.readinessRequest);
    if (!requestData || requestData.userId !== game.user.id) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    status = normalizeReadinessStatus(status);
    if (![READINESS_STATUS.ready, READINESS_STATUS.notReady].includes(status)) return;

    if (isModerator()) {
      await this.processResponse(message.id, requestData.userId, status);
      return;
    }

    game.socket.emit(SOCKET_CHANNEL, {
      action: "readinessResponse",
      messageId: message.id,
      userId: requestData.userId,
      status
    });
  }

  receiveSocketMessage(payload) {
    if (payload?.action !== "readinessResponse") return;
    if (!isPrimaryModerator()) return;
    void this.processResponse(payload.messageId, payload.userId, payload.status);
  }

  async processResponse(messageId, userId, status) {
    status = normalizeReadinessStatus(status);
    if (![READINESS_STATUS.ready, READINESS_STATUS.notReady].includes(status)) return;

    const stateEntry = this.state.players[userId] ?? this.createWaitingEntry();
    const message = game.messages.get(messageId);
    const requestData = message?.getFlag(MODULE_ID, FLAGS.readinessRequest) ?? {
      userId,
      requestedAt: stateEntry.requestedAt,
      requestedByName: stateEntry.requestedByName
    };

    await this.updateState((state) => {
      state.players[userId] = {
        status,
        requestedAt: Number(requestData.requestedAt) || stateEntry.requestedAt,
        requestedByName: requestData.requestedByName || stateEntry.requestedByName,
        requestMessageId: ""
      };
    });

    if (message) await message.delete();
    await this.createResultMessage(userId, requestData, status);
  }

  async clear() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    for (const [userId, entry] of Object.entries(this.state.players)) {
      if (entry.status !== READINESS_STATUS.pending) continue;
      const message = entry.requestMessageId ? game.messages.get(entry.requestMessageId) : null;
      if (message) await message.delete();
      await this.createNoAnswerMessage(userId, entry);
    }

    await this.updateState((state) => {
      for (const user of game.users) state.players[user.id] = this.createWaitingEntry();
    });
  }

  async postResultsToChat() {
    if (!isModerator()) {
      ui.notifications.warn(localize("Requests.Chat.Forbidden"));
      return;
    }

    const rows = this.getRows().filter((row) => row.selected);
    const content = `
      <section class="dmicher-readiness-results-card">
        <h3>${escapeHTML(localize("Readiness.Results.Title"))}</h3>
        <table>
          <thead>
            <tr>
              <th>${escapeHTML(localize("Readiness.Results.Name"))}</th>
              <th>${escapeHTML(localize("Readiness.Results.Status"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHTML(row.name)}</td>
                <td>${escapeHTML(row.statusLabel)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </section>`;

    const ChatMessageClass = getChatMessageClass();
    const messageData = {
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      content
    };
    ChatMessageClass.applyRollMode?.(messageData, game.settings.get("core", "rollMode"));
    await ChatMessageClass.create(messageData);
  }

  async createResultMessage(userId, requestData, status) {
    const user = game.users.get(userId);
    if (!user) return;
    const titleKey = status === READINESS_STATUS.ready
      ? "Readiness.Technical.ReadyTitle"
      : "Readiness.Technical.NotReadyTitle";
    await this.createTechnicalMessage({
      title: localize(titleKey),
      text: format("Readiness.Technical.ResponseDetails", {
        player: user.name,
        timestamp: formatTimestamp(requestData.requestedAt),
        status: localize(READINESS_STATUS_CONFIG[status].labelKey)
      }),
      data: { userId, status, requestedAt: requestData.requestedAt }
    });
  }

  async createNoAnswerMessage(userId, entry) {
    const user = game.users.get(userId);
    if (!user) return;
    await this.createTechnicalMessage({
      title: localize("Readiness.Technical.NoAnswerTitle"),
      text: format("Readiness.Technical.NoAnswerDetails", {
        player: user.name,
        timestamp: formatTimestamp(entry.requestedAt)
      }),
      data: { userId, status: READINESS_STATUS.waiting, requestedAt: entry.requestedAt }
    });
  }

  async createTechnicalMessage({ title, text, data }) {
    const ChatMessageClass = getChatMessageClass();
    await ChatMessageClass.create({
      user: game.user.id,
      speaker: ChatMessageClass.getSpeaker(),
      whisper: getModeratorUserIds(),
      content: `
        <section class="dmicher-technical-card dmicher-readiness-technical">
          <strong class="dmicher-technical-title">${escapeHTML(title)}</strong>
          <small class="dmicher-technical-meta">${escapeHTML(text)}</small>
        </section>`,
      flags: {
        [MODULE_ID]: {
          [FLAGS.readinessResult]: data
        }
      }
    });
  }

  createWaitingEntry() {
    return {
      status: READINESS_STATUS.waiting,
      requestedAt: 0,
      requestedByName: "",
      requestMessageId: ""
    };
  }

  async updateState(mutator) {
    const state = normalizeReadinessState(game.settings.get(MODULE_ID, SETTINGS.readinessState));
    mutator(state);
    await game.settings.set(MODULE_ID, SETTINGS.readinessState, state);
  }
}
