import {
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
import { renderChatPortrait } from "../../chat-portrait.js";
import { getRequestConfiguration, getRequestImage } from "./request-config.js";
import { isPremiumActive } from "../../premium-provider.js";
import { generics } from "../../generics.js";

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
  const configuration = getRequestConfiguration();
  const status = isPremiumActive()
    ? escapeHTML(localize("Requests.Welcome.PremiumActive"))
    : includeHelp
      ? `${escapeHTML(localize("Requests.Welcome.FreeMasterBefore"))} <a href="https://boosty.to/dmicher" target="_blank" rel="noopener noreferrer">Boosty</a>.`
      : escapeHTML(localize("Requests.Welcome.FreePlayer"));
  const support = configuration.welcome.showPremiumStatus
    ? `<p class="dmicher-request-welcome-support">${status}</p>`
    : "";
  return `
    <section class="dmicher-technical-card dmicher-request-welcome">
      <p>${escapeHTML(format("Requests.Welcome.MainBefore", { module: moduleTitle, version: moduleVersion }))} <button type="button" class="dmicher-inline-link" data-request-welcome-action="settings">${escapeHTML(localize("Requests.Welcome.MenuLink"))}</button>${escapeHTML(localize("Requests.Welcome.MainAfter"))}</p>
      ${help}
      ${support ? `<hr class="dmicher-request-welcome-divider">${support}` : ""}
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
    const callbacks = { settings: openSettings, "master-settings": openMasterSettings, help: openHelp, thanks: openThankAuthor };
    for (const action of Object.keys(callbacks)) prepareWelcomeAction(welcome, action);
    if (welcome) generics.chat.bindActions({
      moduleId: MODULE_ID, message, root: welcome, key: "request-welcome",
      actions: Object.entries(callbacks).map(([action, callback]) => ({
        selector: `[data-request-welcome-action="${action}"]`,
        authorize: ({ message: current }) => Boolean(current.getFlag(MODULE_ID, FLAGS.requestWelcome)),
        handle: ({ event }) => {
          event.stopPropagation();
          return callback?.();
        }
      }))
    });
  }

  renderChatPortrait(message, root);
}

function prepareWelcomeAction(welcome, action) {
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
  generics.chat.bindActions({
    moduleId: MODULE_ID, message, root: actions, key: "request-resolution",
    actions: [{
      selector: "[data-request-action]",
      authorize: ({ message: current, user, control }) => {
        const currentRequest = current.getFlag(MODULE_ID, FLAGS.request);
        if (!currentRequest) return false;
        const action = control.dataset.requestAction;
        return action === "grant" ? isModerator(user)
          : action === "cancel" && (isModerator(user) || currentRequest.authorId === user?.id);
      },
      handle: ({ message: current, control }) => resolveRequest(current, control.dataset.requestAction)
    }]
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
