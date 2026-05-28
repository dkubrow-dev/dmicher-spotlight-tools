import { FLAGS, MODULE_ID, REQUEST_TYPES, normalizeRequestType } from "../../config.js";
import {
  escapeHTML,
  format,
  formatDuration,
  formatTimestamp,
  isModerator,
  localize
} from "../../utils.js";

export function getGrantActionKey(type) {
  return normalizeRequestType(type) === "stop" ? "Requests.Chat.TakeFloor" : "Requests.Chat.GiveFloor";
}

export function getRequestAnchorId(messageId) {
  return `dmicher-request-message-${messageId}`;
}

export function buildRequestMessageContent(type, text, style) {
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
          <span data-request-action-label="grant">${escapeHTML(localize(getGrantActionKey(type)))}</span>
        </button>
      </div>
    </section>`;
}

export function renderRequestChatMessage(message, html, { resolveRequest }) {
  const requestData = message.getFlag(MODULE_ID, FLAGS.request);
  if (requestData) {
    attachRequestAnchor(message, html);
    activateRequestMessageActions(message, html, requestData, resolveRequest);
  }

  const resolutionData = message.getFlag(MODULE_ID, FLAGS.resolution);
  if (!resolutionData || (typeof resolutionData !== "object")) return;
  const technicalMessage = html.querySelector(".dmicher-request-technical");
  if (technicalMessage) technicalMessage.innerHTML = buildTechnicalMessageLines(resolutionData);
}

export function buildTechnicalMessageLines(resolutionData) {
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

function attachRequestAnchor(message, html) {
  const card = html.querySelector(".dmicher-request-card");
  if (!card) return;
  card.id = getRequestAnchorId(message.id);
  card.dataset.dmicherRequestMessageId = message.id;
}

function activateRequestMessageActions(message, html, requestData, resolveRequest) {
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
  localizeActionButton(cancelButton, "Requests.Chat.Cancel", "cancel");
  localizeActionButton(grantButton, getGrantActionKey(requestData.urgency), "grant");
  if (cancelButton) cancelButton.hidden = !mayCancel;
  if (grantButton) grantButton.hidden = !mayGrant;

  if (mayCancel || mayGrant) actions.classList.add("is-available");
  actions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-request-action]");
    if (!button) return;
    event.preventDefault();
    void resolveRequest(message, button.dataset.requestAction);
  });
}

function localizeActionButton(button, key, action) {
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
