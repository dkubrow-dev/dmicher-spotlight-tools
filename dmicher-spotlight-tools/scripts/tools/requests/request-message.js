import {
  DEFAULT_USER_PORTRAIT,
  FLAGS,
  MODULE_ID,
  REQUEST_TYPES,
  normalizeRequestType
} from "../../config.js";
import {
  escapeHTML,
  format,
  formatDuration,
  formatTimestamp,
  getRenderedElement,
  isModerator,
  localize
} from "../../utils.js";
import { getRequestImage } from "./request-config.js";

const REQUEST_PORTRAIT_SELECTOR = ".message-sender .avatar img, .message-sender .avatar video";
const VIDEO_PORTRAIT_PATTERN = /\.(?:m4v|mp4|ogg|ogv|webm)(?:[?#].*)?$/i;

function getMessageRequestData(message) {
  const requestData = message?.getFlag?.(MODULE_ID, FLAGS.request);
  if (requestData && typeof requestData === "object") return requestData;
  const resolutionData = message?.getFlag?.(MODULE_ID, FLAGS.resolution);
  return resolutionData?.requestData && typeof resolutionData.requestData === "object"
    ? resolutionData.requestData
    : null;
}

function getRequestFallbackPortrait(requestData) {
  const userPortrait = globalThis.game?.users?.get?.(String(requestData?.authorId ?? ""))?.avatar;
  return firstNonEmptyString(userPortrait, DEFAULT_USER_PORTRAIT);
}

export function getRequestDisplayPortrait(requestData) {
  return firstNonEmptyString(requestData?.portrait, getRequestFallbackPortrait(requestData));
}

export function applyRequestChatPortrait(customData, message) {
  const requestData = getMessageRequestData(message);
  if (!requestData || !customData || typeof customData !== "object") return customData;
  customData.customIconPortraitImage = getRequestDisplayPortrait(requestData);
  return customData;
}

function applyPortraitSource(portrait, sources, alt, index = 0) {
  if (!portrait || index >= sources.length) return portrait;
  const source = sources[index];
  const tagName = VIDEO_PORTRAIT_PATTERN.test(source) ? "video" : "img";
  let media = portrait;
  if (String(portrait.tagName ?? "").toLowerCase() !== tagName && portrait.replaceWith) {
    media = document.createElement(tagName);
    portrait.replaceWith(media);
  }
  if (tagName === "video") {
    for (const attribute of ["autoplay", "muted", "disablepictureinpicture", "loop", "playsinline"]) {
      media.toggleAttribute?.(attribute, true);
    }
  }
  media.alt = alt;
  if (media.dataset) media.dataset.dmicherRequestPortraitSources = JSON.stringify(sources);
  if (index + 1 < sources.length) {
    media.addEventListener?.("error", () => {
      applyPortraitSource(media, sources, alt, index + 1);
    }, { once: true });
  }
  media.src = source;
  return media;
}

export function renderRequestChatPortrait(message, html) {
  const requestData = getMessageRequestData(message);
  if (!requestData) return;
  const root = getRenderedElement(html);
  const portrait = root?.querySelector?.(REQUEST_PORTRAIT_SELECTOR);
  if (!portrait) return;
  const sources = Array.from(new Set([
    getRequestDisplayPortrait(requestData),
    getRequestFallbackPortrait(requestData),
    DEFAULT_USER_PORTRAIT
  ].filter(Boolean)));
  const sourceSignature = JSON.stringify(sources);
  if (portrait.dataset?.dmicherRequestPortraitSources === sourceSignature) return;
  applyPortraitSource(
    portrait,
    sources,
    String(requestData.characterName || requestData.authorName || "")
  );
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function getGrantActionKey(type) {
  return normalizeRequestType(type) === "stop" ? "Requests.Chat.TakeFloor" : "Requests.Chat.GiveFloor";
}

export function getRequestAnchorId(messageId) {
  return `dmicher-request-message-${messageId}`;
}

export function buildRequestMessageContent(type, text, style, image = getRequestImage(type)) {
  type = normalizeRequestType(type);
  const request = REQUEST_TYPES[type];
  const message = escapeHTML(String(text ?? "")).replace(/\r?\n/g, "<br>");
  return `
    <section class="dmicher-request-card dmicher-request-${type}">
      <h3 data-request-label>${escapeHTML(localize(request.labelKey))}</h3>
      <p class="dmicher-request-text" style="${escapeHTML(style)}">${message}</p>
      <img class="dmicher-request-card-image" src="${escapeHTML(image)}" alt="${escapeHTML(localize(request.imageAltKey))}">
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

export function buildWelcomeMessageContent(includeHelp) {
  const moduleRecord = game.modules?.get?.(MODULE_ID);
  const moduleTitle = String(moduleRecord?.title ?? localize("Title"));
  const moduleVersion = String(moduleRecord?.version ?? moduleRecord?.manifest?.version ?? "");
  const masterSettingsLink = `<span class="dmicher-inline-link-tail"><button type="button" class="dmicher-inline-link" data-request-welcome-action="master-settings">${escapeHTML(localize("Requests.Welcome.MasterSettingsLink"))}</button>${escapeHTML(localize("Requests.Welcome.DisableAfter"))}</span>`;
  const help = includeHelp
    ? `<p>${escapeHTML(localize("Requests.Welcome.HelpBefore"))} <button type="button" class="dmicher-inline-link" data-request-welcome-action="help">${escapeHTML(localize("Requests.Welcome.HelpLink"))}</button>${escapeHTML(localize("Requests.Welcome.HelpAfter"))} ${escapeHTML(localize("Requests.Welcome.DisableBefore"))} ${masterSettingsLink}</p>`
    : "";
  const supportLink = `<span class="dmicher-inline-link-tail"><button type="button" class="dmicher-inline-link" data-request-welcome-action="thanks">${escapeHTML(localize("Requests.Welcome.SupportLink"))}</button>${escapeHTML(localize("Requests.Welcome.FreeAfter"))}</span>`;
  const support = `<p class="dmicher-request-welcome-support">${escapeHTML(localize("Requests.Welcome.FreeBefore"))} ${supportLink}</p>`;
  return `
    <section class="dmicher-technical-card dmicher-request-welcome">
      <p>${escapeHTML(format("Requests.Welcome.MainBefore", { module: moduleTitle, version: moduleVersion }))} <button type="button" class="dmicher-inline-link" data-request-welcome-action="settings">${escapeHTML(localize("Requests.Welcome.MenuLink"))}</button>${escapeHTML(localize("Requests.Welcome.MainAfter"))}</p>
      ${help}
      <hr class="dmicher-request-welcome-divider">
      ${support}
    </section>`;
}

export function renderRequestChatMessage(message, html, {
  resolveRequest,
  openSettings,
  openMasterSettings,
  openHelp,
  openThankAuthor
}) {
  const root = getRenderedElement(html);
  if (!root) return;

  const requestData = message.getFlag(MODULE_ID, FLAGS.request);
  if (requestData) {
    attachRequestAnchor(message, root);
    activateRequestMessageActions(message, root, requestData, resolveRequest);
  }

  const resolutionData = message.getFlag(MODULE_ID, FLAGS.resolution);
  if (resolutionData && typeof resolutionData === "object") {
    const technicalMessage = root.querySelector(".dmicher-request-technical");
    if (technicalMessage) renderTechnicalMessageContent(technicalMessage, resolutionData);
  }

  if (message.getFlag(MODULE_ID, FLAGS.requestWelcome)) {
    const welcome = root.querySelector(".dmicher-request-welcome");
    activateWelcomeAction(welcome, "settings", openSettings);
    activateWelcomeAction(welcome, "master-settings", openMasterSettings);
    activateWelcomeAction(welcome, "help", openHelp);
    activateWelcomeAction(welcome, "thanks", openThankAuthor);
  }

  renderRequestChatPortrait(message, root);
}

function activateWelcomeAction(welcome, action, callback) {
  let control = welcome?.querySelector(`[data-request-welcome-action="${action}"]`);
  if (!control) return;
  if (String(control.tagName ?? "").toLowerCase() === "a") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = control.className;
    button.classList.add("dmicher-inline-link");
    button.dataset.requestWelcomeAction = action;
    button.textContent = control.textContent;
    control.replaceWith(button);
    control = button;
  }
  control.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    callback?.();
  });
}

export function buildTechnicalMessageLines(resolutionData) {
  const content = getTechnicalMessageContent(resolutionData);
  const resolver = content.resolver
    ? `<small class="dmicher-request-technical-meta">${escapeHTML(content.resolver)}</small>`
    : "";
  return `
    <strong class="dmicher-request-technical-title">${escapeHTML(content.title)}</strong>
    <small class="dmicher-request-technical-meta">${escapeHTML(content.details)}</small>
    ${resolver}
    <small class="dmicher-request-technical-meta">${escapeHTML(content.type)}</small>`;
}

function getTechnicalMessageContent(resolutionData) {
  const requestData = resolutionData.requestData ?? {};
  const request = REQUEST_TYPES[normalizeRequestType(requestData.urgency)];
  const characterName = requestData.characterName ?? requestData.tokenName ?? "";
  const author = characterName ? `${requestData.authorName} (${characterName})` : requestData.authorName;
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
  return {
    title: format(titleKey, data),
    details: format("Requests.Technical.Details", data),
    resolver: resolutionData.outcome === "cancelled" ? format("Requests.Technical.Resolver", data) : "",
    type: format("Requests.Technical.Type", data)
  };
}

function renderTechnicalMessageContent(element, resolutionData) {
  const content = getTechnicalMessageContent(resolutionData);
  const title = document.createElement("strong");
  title.className = "dmicher-request-technical-title";
  title.textContent = content.title;
  const details = document.createElement("small");
  details.className = "dmicher-request-technical-meta";
  details.textContent = content.details;
  const type = document.createElement("small");
  type.className = "dmicher-request-technical-meta";
  type.textContent = content.type;
  const nodes = [title, details];
  if (content.resolver) {
    const resolver = document.createElement("small");
    resolver.className = "dmicher-request-technical-meta";
    resolver.textContent = content.resolver;
    nodes.push(resolver);
  }
  nodes.push(type);
  element.replaceChildren(...nodes);
}

function attachRequestAnchor(message, html) {
  const card = html.querySelector(".dmicher-request-card");
  if (!card) return;
  card.id = getRequestAnchorId(message.id);
  card.dataset.dmicherRequestMessageId = message.id;
}

function activateRequestMessageActions(message, html, requestData, resolveRequest) {
  const type = normalizeRequestType(requestData.urgency);
  const request = REQUEST_TYPES[type];
  const heading = html.querySelector("[data-request-label], .dmicher-request-card h3");
  const image = html.querySelector(".dmicher-request-card-image");
  const actions = html.querySelector(".dmicher-request-actions");
  if (!actions) return;
  if (heading) heading.textContent = localize(request.labelKey);
  if (image) {
    image.src = getRequestImage(type);
    image.alt = localize(request.imageAltKey);
  }
  actions.setAttribute("aria-label", localize("Requests.Chat.Actions"));
  const mayCancel = isModerator() || requestData.authorId === game.user.id;
  const mayGrant = isModerator();
  const cancelButton = actions.querySelector('[data-request-action="cancel"]');
  const grantButton = actions.querySelector('[data-request-action="grant"]');
  localizeActionButton(cancelButton, "Requests.Chat.Cancel", "cancel");
  localizeActionButton(grantButton, getGrantActionKey(type), "grant");
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
    for (const node of Array.from(button.childNodes)) if (node.nodeType === Node.TEXT_NODE) node.remove();
    label = document.createElement("span");
    label.dataset.requestActionLabel = action;
    button.append(" ", label);
  }
  label.textContent = localize(key);
}
