const MODULE_ID = "dmicher-tools";
const I18N_PREFIX = "DMICHERTOOLS";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const REQUEST_FLAG = "request";
const SPEECH_GRANTED_SOUND = `modules/${MODULE_ID}/assets/requests/next-request.ogg`;
const CHAT_MACRO_COMMAND = "/dmicher-tools-request";

const REQUEST_TYPES = Object.freeze({
  common: {
    labelKey: "Requests.Common.Label",
    typeLabelKey: "Requests.Common.Type",
    imageAltKey: "Requests.Common.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-common.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-common.ogg`,
    textSetting: "requestCommonText",
    styleSetting: "requestCommonStyle",
    defaultTextKey: "Requests.Common.DefaultText",
    defaultStyle: "text-align: center; font-size: 1.2em;"
  },
  urgent: {
    labelKey: "Requests.Urgent.Label",
    typeLabelKey: "Requests.Urgent.Type",
    imageAltKey: "Requests.Urgent.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-urgent.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-urgent.ogg`,
    textSetting: "requestUrgentText",
    styleSetting: "requestUrgentStyle",
    defaultTextKey: "Requests.Urgent.DefaultText",
    defaultStyle: "text-align: center; color: #b4232d; font-size: 1.35em; font-weight: bold;"
  },
  stop: {
    labelKey: "Requests.Stop.Label",
    typeLabelKey: "Requests.Stop.Type",
    imageAltKey: "Requests.Stop.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-stop.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-stop.ogg`,
    textSetting: "requestStopText",
    styleSetting: "requestStopStyle",
    defaultTextKey: "Requests.Stop.DefaultText",
    defaultStyle: "text-align: center; color: #5b3a12; font-size: 1.2em; font-weight: bold;",
    moderatorOnly: true
  }
});

const ALLOWED_STYLE_PROPERTIES = new Set([
  "background-color",
  "border",
  "border-radius",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "padding",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space"
]);

const resolvingRequests = new Set();
const shownNotifications = new Set();
let requestSettingsWindow;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class RequestSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-tools-request-settings",
    classes: ["dmicher-request-settings"],
    position: {
      width: 680,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-hand",
      title: "DMICHERTOOLS.Requests.Settings.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/request-settings.hbs`
    }
  };

  get title() {
    return localize("Requests.Settings.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const requests = getConfigurableRequestEntries().map(([urgency, request]) => ({
      urgency,
      label: localize(request.labelKey),
      imageAlt: localize(request.imageAltKey),
      image: request.image,
      text: getRequestTextOverride(request),
      placeholder: localize(request.defaultTextKey),
      style: game.settings.get(MODULE_ID, request.styleSetting)
    }));

    return { ...context, requests };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const form = this.element.querySelector(".dmicher-request-settings-form");
    if (!form) return;

    form.addEventListener("submit", (event) => void this._saveSettings(event));
    for (const image of form.querySelectorAll("[data-request-image]")) {
      image.addEventListener("click", () => void submitRequest(image.dataset.urgency));
      image.addEventListener("keydown", (event) => {
        if ((event.key === "Enter") || (event.key === " ")) {
          event.preventDefault();
          void submitRequest(image.dataset.urgency);
        }
      });
      image.addEventListener("dragstart", onRequestDragStart);
    }
  }

  async _saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;

    try {
      const saves = [];
      for (const [urgency, request] of getConfigurableRequestEntries()) {
        const text = String(formData.get(`${urgency}Text`) ?? "").trim().slice(0, 500);
        const style = sanitizeTextStyle(formData.get(`${urgency}Style`));
        saves.push(game.settings.set(MODULE_ID, request.textSetting, text));
        saves.push(game.settings.set(MODULE_ID, request.styleSetting, style));
      }
      await Promise.all(saves);
      ui.notifications.info(localize("Requests.Settings.Saved"));
      await this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save request settings`, error);
      ui.notifications.error(localize("Requests.Settings.SaveError"));
      if (saveButton) saveButton.disabled = false;
    }
  }
}

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
    submitRequest
  };

  Hooks.on("renderSettings", injectSettingsSidebarSection);
  Hooks.on("renderChatMessageHTML", renderLocalizedChatMessage);
  Hooks.on("chatMessage", handleRequestChatCommand);
  Hooks.on("hotbarDrop", handleHotbarDrop);
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_CHANNEL, receiveSocketMessage);
  void preloadAssets();
  void migrateRequestMacros();

  const settingsTab = ui.sidebar?.tabs?.settings;
  if (settingsTab?.element) injectSettingsSidebarSection(settingsTab, settingsTab.element);
});

function registerSettings() {
  for (const request of Object.values(REQUEST_TYPES)) {
    game.settings.register(MODULE_ID, request.textSetting, {
      name: localize(request.labelKey),
      scope: "user",
      config: false,
      type: String,
      default: ""
    });
    game.settings.register(MODULE_ID, request.styleSetting, {
      name: format("Requests.Settings.CssSettingName", { label: localize(request.labelKey) }),
      scope: "user",
      config: false,
      type: String,
      default: request.defaultStyle
    });
  }

  game.settings.registerMenu(MODULE_ID, "requestsSettings", {
    name: localize("Requests.Settings.MenuName"),
    label: localize("Requests.Settings.MenuLabel"),
    hint: localize("Requests.Settings.MenuHint"),
    icon: "fa-solid fa-hand",
    type: RequestSettingsApplication,
    restricted: false
  });
}

function normalizeUrgency(urgency) {
  return Object.hasOwn(REQUEST_TYPES, urgency) ? urgency : "common";
}

function getConfigurableRequestEntries() {
  return Object.entries(REQUEST_TYPES).filter(([, request]) => !request.moderatorOnly || isModerator());
}

function openRequestSettings() {
  if (requestSettingsWindow?.rendered) {
    requestSettingsWindow.bringToFront();
    return requestSettingsWindow;
  }

  requestSettingsWindow = new RequestSettingsApplication();
  void requestSettingsWindow.render({ force: true });
  return requestSettingsWindow;
}

function injectSettingsSidebarSection(app, html) {
  const root = html instanceof HTMLElement ? html : (html?.[0] ?? app?.element);
  if (!root || root.querySelector("[data-dmicher-tools-sidebar]")) return;

  const section = document.createElement("section");
  section.classList.add("dmicher-tools-sidebar");
  section.dataset.dmicherToolsSidebar = "";

  const heading = document.createElement("h3");
  heading.textContent = localize("Title");
  section.append(heading);

  const button = document.createElement("button");
  button.type = "button";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-hand";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, document.createTextNode(` ${localize("Requests.Label")}`));
  button.addEventListener("click", openRequestSettings);
  section.append(button);

  root.append(section);
}

async function submitRequest(urgency) {
  const normalizedUrgency = normalizeUrgency(urgency);
  const request = REQUEST_TYPES[normalizedUrgency];
  if (request.moderatorOnly && !isModerator()) {
    ui.notifications.warn(localize("Requests.Chat.Forbidden"));
    return;
  }
  const ChatMessageClass = getChatMessageClass();
  const token = canvas?.tokens?.controlled?.[0] ?? null;
  const requestData = {
    urgency: normalizedUrgency,
    authorId: game.user.id,
    authorName: game.user.name,
    tokenName: token?.name ?? "",
    submittedAt: Date.now(),
    createdAt: game.time.serverTime
  };
  const text = getRequestText(request);
  const style = sanitizeTextStyle(game.settings.get(MODULE_ID, request.styleSetting));
  const speaker = ChatMessageClass.getSpeaker(token ? { token } : {});

  try {
    await ChatMessageClass.create({
      user: game.user.id,
      speaker,
      content: buildRequestMessageContent(normalizedUrgency, text, style),
      flags: {
        [MODULE_ID]: {
          [REQUEST_FLAG]: requestData
        }
      }
    });
    await playRequestSound(normalizedUrgency, true);
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to submit request`, error);
    ui.notifications.error(localize("Requests.Chat.SubmitError"));
  }
}

function buildRequestMessageContent(urgency, text, style) {
  const request = REQUEST_TYPES[urgency];
  const message = escapeHTML(String(text ?? "")).replace(/\r?\n/g, "<br>");
  return `
    <section class="dmicher-request-card dmicher-request-${urgency}">
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
          <span data-request-action-label="grant">${escapeHTML(localize(getGrantActionKey(urgency)))}</span>
        </button>
      </div>
    </section>`;
}

function getRequestText(request) {
  return getRequestTextOverride(request) || localize(request.defaultTextKey);
}

function getRequestTextOverride(request) {
  const storedValue = game.settings.get(MODULE_ID, request.textSetting);
  if (storedValue == null) return "";

  const value = String(storedValue).trim();
  const legacyDefaultValue = `${I18N_PREFIX}.${request.defaultTextKey}`;
  return value === legacyDefaultValue ? "" : value;
}

function renderLocalizedChatMessage(message, html) {
  const requestData = message.getFlag(MODULE_ID, REQUEST_FLAG);
  if (requestData) activateRequestMessageActions(message, html, requestData);

  const resolutionData = message.getFlag(MODULE_ID, "resolution");
  if (resolutionData && (typeof resolutionData === "object")) {
    const technicalMessage = html.querySelector(".dmicher-request-technical");
    if (technicalMessage) technicalMessage.innerHTML = buildTechnicalMessageLines(resolutionData);
  }
}

function activateRequestMessageActions(message, html, requestData) {
  const request = REQUEST_TYPES[normalizeUrgency(requestData.urgency)];
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

function getGrantActionKey(urgency) {
  return normalizeUrgency(urgency) === "stop" ? "Requests.Chat.TakeFloor" : "Requests.Chat.GiveFloor";
}

async function resolveRequest(message, action) {
  const requestData = message.getFlag(MODULE_ID, REQUEST_FLAG);
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

  if (resolvingRequests.has(message.id)) return;
  resolvingRequests.add(message.id);

  try {
    if (!game.messages.get(message.id)) return;
    const createdAt = Number(requestData.createdAt ?? message.timestamp ?? game.time.serverTime);
    const elapsed = game.time.serverTime - createdAt;
    if (completed && normalizeUrgency(requestData.urgency) === "stop") {
      await game.togglePause(true, { broadcast: true });
    }
    await message.delete();

    if (completed) broadcastSpeechGranted(requestData);
    await createTechnicalMessage(requestData, completed, elapsed);
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to resolve request`, error);
    ui.notifications.error(localize("Requests.Chat.ResolveError"));
  } finally {
    resolvingRequests.delete(message.id);
  }
}

async function createTechnicalMessage(requestData, completed, elapsed) {
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
    whisper: getTechnicalMessageRecipients(requestData.authorId),
    flags: {
      [MODULE_ID]: {
        resolution: resolutionData
      }
    }
  });
}

function buildTechnicalMessageLines(resolutionData) {
  const requestData = resolutionData.requestData ?? {};
  const request = REQUEST_TYPES[normalizeUrgency(requestData.urgency)];
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

function getTechnicalMessageRecipients(authorId) {
  const recipients = new Set([authorId]);
  for (const user of game.users) {
    if (isModerator(user)) recipients.add(user.id);
  }
  return Array.from(recipients);
}

function isModerator(user = game.user) {
  return Number(user?.role ?? 0) >= Number(CONST.USER_ROLES.ASSISTANT);
}

function broadcastSpeechGranted(requestData) {
  const payload = {
    action: "speechGranted",
    id: foundry.utils.randomID(),
    urgency: normalizeUrgency(requestData.urgency),
    authorName: String(requestData.authorName ?? "").slice(0, 100),
    tokenName: String(requestData.tokenName ?? "").slice(0, 100)
  };

  showSpeechGranted(payload);
  game.socket.emit(SOCKET_CHANNEL, payload);
}

function receiveSocketMessage(payload) {
  if (payload?.action !== "speechGranted") return;
  showSpeechGranted(payload);
}

function showSpeechGranted(payload) {
  if (!payload.id || shownNotifications.has(payload.id)) return;
  shownNotifications.add(payload.id);
  window.setTimeout(() => shownNotifications.delete(payload.id), 10000);

  const request = REQUEST_TYPES[normalizeUrgency(payload.urgency)];
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
  void playSpeechGrantedSound();

  window.setTimeout(() => {
    popup.classList.add("is-closing");
    window.setTimeout(() => popup.remove(), 200);
  }, 3000);
}

function onRequestDragStart(event) {
  const urgency = normalizeUrgency(event.currentTarget.dataset.urgency);
  const data = JSON.stringify({
    type: `${MODULE_ID}.request`,
    urgency
  });
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", data);
}

function handleHotbarDrop(_hotbar, data, slot) {
  if (data.type !== `${MODULE_ID}.request`) return;
  void createRequestMacro(normalizeUrgency(data.urgency), slot);
  return false;
}

function handleRequestChatCommand(_chatLog, message) {
  const pattern = new RegExp(`^${CHAT_MACRO_COMMAND}\\s+(common|urgent|stop)\\s*$`, "i");
  const match = pattern.exec(String(message).trim());
  if (!match) return;

  void submitRequest(normalizeUrgency(match[1].toLowerCase()));
  return false;
}

async function createRequestMacro(urgency, slot, notify = true) {
  const request = REQUEST_TYPES[urgency];
  if (request.moderatorOnly && !isModerator()) {
    ui.notifications.warn(localize("Requests.Chat.Forbidden"));
    return;
  }
  const label = localize(request.labelKey);
  const name = format("Requests.Hotbar.MacroName", {
    label,
    title: localize("Title")
  });
  const command = getChatMacroCommand(urgency);
  const MacroClass = CONFIG.Macro.documentClass ?? foundry.documents.Macro;

  try {
    let macro = game.macros.find((item) => item.isOwner && isRequestMacro(item, urgency));
    if (!macro) {
      macro = await MacroClass.create({
        name,
        type: "chat",
        img: request.image,
        command,
        flags: {
          [MODULE_ID]: {
            requestMacro: urgency
          }
        }
      });
    } else if ((macro.type !== "chat") || (macro.command !== command) || (macro.name !== name) || (macro.img !== request.image)) {
      await macro.update({
        name,
        type: "chat",
        img: request.image,
        command,
        [`flags.${MODULE_ID}.requestMacro`]: urgency
      });
    }
    await game.user.assignHotbarMacro(macro, slot);
    if (notify) ui.notifications.info(format("Requests.Hotbar.Added", { label }));
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to create hotbar macro`, error);
    ui.notifications.error(localize("Requests.Hotbar.AddError"));
  }
}

async function migrateRequestMacros() {
  const migrations = [];
  for (const urgency of Object.keys(REQUEST_TYPES)) {
    for (const macro of game.macros.filter((item) => item.isOwner && isRequestMacro(item, urgency))) {
      if ((macro.type === "chat") && (macro.command === getChatMacroCommand(urgency))) continue;
      migrations.push(macro.update({
        type: "chat",
        command: getChatMacroCommand(urgency),
        [`flags.${MODULE_ID}.requestMacro`]: urgency
      }));
    }
  }
  if (migrations.length) await Promise.allSettled(migrations);

  for (const [slot, macroId] of Object.entries(game.user.hotbar ?? {})) {
    const macro = game.macros.get(macroId);
    if (!macro || macro.isOwner) continue;
    const urgency = Object.keys(REQUEST_TYPES).find((type) => isRequestMacro(macro, type));
    if (urgency) await createRequestMacro(urgency, Number(slot), false);
  }
}

function isRequestMacro(macro, urgency) {
  const flaggedUrgency = macro.getFlag(MODULE_ID, "requestMacro");
  const legacyCommand = `game.modules.get("${MODULE_ID}").api.submitRequest("${urgency}");`;
  return (flaggedUrgency === urgency) || (macro.command === legacyCommand);
}

function getChatMacroCommand(urgency) {
  return `${CHAT_MACRO_COMMAND} ${urgency}`;
}

async function playRequestSound(urgency, broadcast) {
  const request = REQUEST_TYPES[normalizeUrgency(urgency)];
  try {
    await foundry.audio.AudioHelper.play({
      src: request.sound,
      volume: 1,
      autoplay: true,
      loop: false
    }, broadcast);
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to play request sound`, error);
  }
}

async function playSpeechGrantedSound() {
  try {
    await foundry.audio.AudioHelper.play({
      src: SPEECH_GRANTED_SOUND,
      volume: 1,
      autoplay: true,
      loop: false
    }, false);
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to play speech granted sound`, error);
  }
}

async function preloadAssets() {
  const work = [];
  for (const request of Object.values(REQUEST_TYPES)) {
    work.push(preloadImage(request.image));
    work.push(foundry.audio.AudioHelper.preloadSound(request.sound));
  }
  work.push(foundry.audio.AudioHelper.preloadSound(SPEECH_GRANTED_SOUND));
  await Promise.allSettled(work);
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
    image.src = src;
  });
}

function sanitizeTextStyle(rawStyle) {
  const probe = document.createElement("span");
  probe.style.cssText = String(rawStyle ?? "").slice(0, 1000);
  const safeDeclarations = [];

  for (const property of ALLOWED_STYLE_PROPERTIES) {
    const value = probe.style.getPropertyValue(property).trim();
    if (!value || /(url\s*\(|expression\s*\(|javascript\s*:)/i.test(value)) continue;
    const priority = probe.style.getPropertyPriority(property);
    safeDeclarations.push(`${property}: ${value}${priority ? " !important" : ""}`);
  }

  return safeDeclarations.length ? `${safeDeclarations.join("; ")};` : "";
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) parts.push(format("Duration.Hours", { count: hours }));
  if (minutes || hours) parts.push(format("Duration.Minutes", { count: minutes }));
  parts.push(format("Duration.Seconds", { count: seconds }));
  return parts.join(" ");
}

function formatTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || game.time.serverTime);
  try {
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const options = {
      timeStyle: "medium"
    };
    if (systemTimeZone) options.timeZone = systemTimeZone;
    return new Intl.DateTimeFormat(game.i18n.lang, options).format(date);
  } catch (_error) {
    return date.toLocaleTimeString();
  }
}

function localize(key) {
  return game.i18n.localize(`${I18N_PREFIX}.${key}`);
}

function format(key, data) {
  return game.i18n.format(`${I18N_PREFIX}.${key}`, data);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getChatMessageClass() {
  return CONFIG.ChatMessage.documentClass ?? foundry.documents.ChatMessage;
}
