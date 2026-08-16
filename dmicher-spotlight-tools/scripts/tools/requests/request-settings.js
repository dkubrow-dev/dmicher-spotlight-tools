import {
  I18N_PREFIX,
  MODULE_ID,
  REQUEST_LIMIT_MODES,
  REQUEST_TIMEOUT_MODES,
  REQUEST_TYPES,
  SETTINGS,
  TIMER_SOUND_SOURCES
} from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import {
  canUseRequest,
  confirmDialog,
  formatDigitalDuration,
  getFoundryGeneration,
  getUserSettingScope,
  i18nKey,
  isFoundryAudioMuted,
  isModerator,
  localize,
  openSingletonApplication,
  playAudio,
  runAfterApplicationLifecycle,
  sanitizeTextStyle
} from "../../utils.js";
import {
  clampRequestCount,
  getActiveRequestState,
  getRequestConfiguration,
  getRequestImage,
  getRequestTimeoutStatus,
  normalizeRequestConfiguration
} from "./request-config.js";
import { REQUEST_TIMEOUT_TICK_MS, updateRequestTimeoutCounters } from "./request-timeout-display.js";
import {
  buildRequestTextStyle,
  normalizeRequestColor,
  parseRequestTextStyle
} from "./request-text-style.js";
import { parseDurationInput } from "../timers/timer-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const THANK_AUTHOR_URL = "https://boosty.to/dmicher";
const RESOURCE_VALIDATION_TIMEOUT_MS = 10000;

let actions;
let settingsWindow;
let masterSettingsWindow;

class RequestSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-request-settings",
    classes: getThemedWindowClasses("dmicher-request-settings"),
    position: { width: 820, height: 720 },
    window: {
      icon: "fa-solid fa-hand",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.Settings.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/request-settings.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.previewAudio = null;
    this.timeoutTickHandle = null;
    this.unsubscribeConfiguration = actions?.subscribeConfiguration?.(() => {
      if (this.rendered) void this.render({ force: true });
    });
    this.unsubscribeState = actions?.subscribeState?.(() => {
      if (this.rendered) void this.render({ force: true });
    });
  }

  get title() {
    return localize("Requests.Settings.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const moderator = isModerator();
    const configuration = getRequestConfiguration();
    const activeState = getActiveRequestState();
    const now = Date.now();
    const requests = getVisibleRequestEntries().map(([type, request]) => {
      const timeout = getRequestTimeoutStatus(type, game.user.id, activeState, configuration, now);
      const violation = !request.moderatorOnly && configuration.limits[type]?.mode === REQUEST_LIMIT_MODES.forbidden;
      const appearance = parseRequestTextStyle(game.settings.get(MODULE_ID, request.styleSetting));
      return {
        urgency: type,
        label: localize(request.labelKey),
        imageAlt: localize(request.imageAltKey),
        image: getRequestImage(type, configuration),
        text: getRequestTextOverride(request),
        placeholder: localize(request.defaultTextKey),
        color: appearance.color,
        fontSize: appearance.fontSize,
        underline: appearance.underline,
        italic: appearance.italic,
        bold: appearance.bold,
        alignment: appearance.alignment,
        alignCenter: appearance.alignment === "center",
        alignLeft: appearance.alignment === "left",
        alignRight: appearance.alignment === "right",
        disabled: violation,
        disabledText: violation ? "disabled" : "",
        forbiddenHint: violation ? localize("Requests.Limits.ForbiddenHint") : "",
        timeoutActive: timeout.active,
        timeoutExpiresAt: timeout.expiresAt,
        timeoutRemainingText: formatDigitalDuration(timeout.remaining)
      };
    });

    const resourceTypes = Object.entries(REQUEST_TYPES).map(([type, request]) => ({
      urgency: type,
      label: localize(request.labelKey),
      imageAlt: localize(request.imageAltKey),
      image: getRequestImage(type, configuration),
      customImage: configuration.images[type].custom,
      customImageChecked: configuration.images[type].custom ? "checked" : "",
      imageUrl: configuration.images[type].url,
      imageUrlDisabled: configuration.images[type].custom ? "" : "disabled",
      customSound: configuration.sounds[type].custom,
      customSoundChecked: configuration.sounds[type].custom ? "checked" : "",
      soundUrl: configuration.sounds[type].url,
      soundUrlDisabled: configuration.sounds[type].custom ? "" : "disabled",
      volumePercent: Math.round(configuration.sounds[type].volume * 100)
    }));

    const timerSoundTypes = ["timer", "break"].map((type) => {
      const sound = configuration.timerSounds[type];
      return {
        kind: type,
        label: localize(type === "timer"
          ? "Requests.Resources.TimerSound"
          : "Requests.Resources.BreakSound"),
        toggleLabel: localize(type === "timer"
          ? "Requests.Resources.UseCustomTimerSound"
          : "Requests.Resources.UseCustomBreakSound"),
        customChecked: sound.custom ? "checked" : "",
        url: sound.url,
        urlDisabled: sound.custom ? "" : "disabled",
        controlsDisabled: sound.custom ? "" : "disabled",
        volumePercent: Math.round(sound.volume * 100)
      };
    });

    const limits = ["common", "urgent"].map((type) => {
      const limit = configuration.limits[type];
      return {
        urgency: type,
        label: localize(REQUEST_TYPES[type].labelKey),
        mode: limit.mode,
        isNone: limit.mode === REQUEST_LIMIT_MODES.none,
        isCount: limit.mode === REQUEST_LIMIT_MODES.count,
        isForbidden: limit.mode === REQUEST_LIMIT_MODES.forbidden,
        count: limit.count,
        countDisabled: limit.mode === REQUEST_LIMIT_MODES.count ? "" : "disabled",
        timeoutMode: limit.timeoutMode,
        isTimeoutNone: limit.timeoutMode === REQUEST_TIMEOUT_MODES.none,
        isTimeoutSubmission: limit.timeoutMode === REQUEST_TIMEOUT_MODES.submission,
        isTimeoutGrant: limit.timeoutMode === REQUEST_TIMEOUT_MODES.grant,
        timeoutTime: formatDigitalDuration(limit.timeoutDuration),
        timeoutTimeDisabled: limit.timeoutMode === REQUEST_TIMEOUT_MODES.none ? "disabled" : ""
      };
    });

    return {
      ...context,
      requests,
      resourceTypes,
      timerSoundTypes,
      limits,
      moderator,
      chatEnabled: configuration.chatEnabled,
      soundsEnabled: configuration.soundsEnabled,
      blockWhenEnvironment: configuration.blockWhenEnvironment,
      showWelcome: configuration.showWelcome,
      feedEnabled: configuration.feed.enabled,
      feedShowTime: configuration.feed.showTime
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender(context, options), () => {
      const form = this.element.querySelector(".dmicher-request-settings-form");
      if (!form) return;
      form.addEventListener("submit", (event) => void this._saveSettings(event));
      for (const image of form.querySelectorAll("[data-request-image]")) {
        image.addEventListener("click", () => {
          if (image.dataset.disabled === "true") {
            ui.notifications.warn(localize("Requests.Limits.ForbiddenNotice"));
            return;
          }
          void actions.submitRequest(image.dataset.urgency);
        });
        image.addEventListener("keydown", (event) => {
          if ((event.key === "Enter") || (event.key === " ")) {
            event.preventDefault();
            image.click();
          }
        });
        image.addEventListener("dragstart", (event) => {
          if (image.dataset.disabled === "true") {
            event.preventDefault();
            ui.notifications.warn(localize("Requests.Limits.ForbiddenNotice"));
            return;
          }
          actions.onRequestDragStart(event);
        });
      }
      for (const picker of form.querySelectorAll("[data-request-color-picker]")) {
        const colorField = form.elements[`${picker.dataset.urgency}Color`];
        picker.addEventListener("input", () => {
          if (!colorField) return;
          colorField.value = picker.value.toLowerCase();
          colorField.setCustomValidity("");
        });
      }
      for (const colorField of form.querySelectorAll("[data-request-color-field]")) {
        const picker = form.elements[`${colorField.dataset.urgency}ColorPicker`];
        const syncColor = (normalizeField = false) => {
          const color = normalizeRequestColor(colorField.value);
          colorField.setCustomValidity(color ? "" : localize("Requests.Settings.ColorInvalid"));
          if (!color) return;
          if (normalizeField) colorField.value = color;
          if (picker) picker.value = color;
        };
        colorField.addEventListener("input", () => syncColor(false));
        colorField.addEventListener("change", () => syncColor(true));
        syncColor(true);
      }
      for (const button of form.querySelectorAll("[data-request-font-toggle]")) {
        button.addEventListener("click", () => {
          const active = button.getAttribute("aria-pressed") !== "true";
          button.setAttribute("aria-pressed", String(active));
          button.classList.toggle("active", active);
          const field = form.elements[`${button.dataset.urgency}${button.dataset.requestFontToggle}`];
          if (field) field.value = String(active);
        });
      }
      for (const toggle of form.querySelectorAll("[data-custom-resource-toggle]")) {
        toggle.addEventListener("change", () => this.updateResourceField(toggle));
        this.updateResourceField(toggle);
      }
      for (const toggle of form.querySelectorAll("[data-custom-timer-sound]")) {
        toggle.addEventListener("change", () => this.updateTimerSoundField(toggle));
        this.updateTimerSoundField(toggle);
      }
      for (const select of form.querySelectorAll("[data-request-limit-mode]")) {
        select.addEventListener("change", () => this.updateLimitCount(select));
        this.updateLimitCount(select);
      }
      for (const select of form.querySelectorAll("[data-request-timeout-mode]")) {
        select.addEventListener("change", () => this.updateTimeoutField(select));
        this.updateTimeoutField(select);
      }
      for (const slider of form.querySelectorAll(".dmicher-volume-field input[type='range']")) {
        const output = slider.parentElement?.querySelector("output");
        slider.addEventListener("input", () => {
          if (output) output.textContent = `${slider.value}%`;
        });
      }
      for (const button of form.querySelectorAll("[data-sound-preview]")) {
        button.addEventListener("click", () => void this.toggleSoundPreview(button, form));
      }
      this.startTimeoutTicking();
    });
  }

  updateResourceField(toggle) {
    const kind = toggle.dataset.customResourceToggle;
    const type = toggle.dataset.urgency;
    const field = this.element.querySelector(`[name="${type}${kind === "image" ? "ImageUrl" : "SoundUrl"}"]`);
    if (!field) return;
    field.disabled = !toggle.checked;
    field.required = toggle.checked;
    if (!toggle.checked) field.value = "";
  }

  updateTimerSoundField(toggle) {
    const kind = toggle.dataset.soundKind;
    const url = this.element.querySelector(`[name="${kind}TimerSoundUrl"]`);
    const volume = this.element.querySelector(`[name="${kind}TimerSoundVolume"]`);
    const preview = this.element.querySelector(`[data-sound-preview][data-timer-sound-kind="${kind}"]`);
    if (url) {
      url.disabled = !toggle.checked;
      url.required = toggle.checked;
      if (!toggle.checked) url.value = "";
    }
    if (volume) volume.disabled = !toggle.checked;
    if (preview) preview.disabled = !toggle.checked;
  }

  updateLimitCount(select) {
    const input = this.element.querySelector(`[name="${select.dataset.urgency}LimitCount"]`);
    if (input) input.disabled = select.value !== REQUEST_LIMIT_MODES.count;
  }

  updateTimeoutField(select) {
    const input = this.element.querySelector('[name="' + select.dataset.urgency + 'TimeoutTime"]');
    if (!input) return;
    const active = select.value !== REQUEST_TIMEOUT_MODES.none;
    input.disabled = !active;
    input.required = active;
  }

  startTimeoutTicking() {
    this.stopTimeoutTicking();
    updateRequestTimeoutCounters(this.element);
    this.timeoutTickHandle = window.setInterval(
      () => updateRequestTimeoutCounters(this.element),
      REQUEST_TIMEOUT_TICK_MS
    );
  }

  stopTimeoutTicking() {
    if (!this.timeoutTickHandle) return;
    window.clearInterval(this.timeoutTickHandle);
    this.timeoutTickHandle = null;
  }

  async toggleSoundPreview(button, form) {
    if (this.previewAudio) {
      await this.previewAudio.stop();
      this.previewAudio = null;
      this.updatePreviewButtons();
      if (button.dataset.playing === "true") return;
    }
    if (isFoundryAudioMuted()) return;
    const timerKind = button.dataset.timerSoundKind;
    const type = button.dataset.urgency;
    const custom = timerKind
      ? form.querySelector(`[name="${timerKind}TimerSoundCustom"]`)?.checked
      : form.querySelector(`[name="${type}SoundCustom"]`)?.checked;
    const customUrl = timerKind
      ? form.querySelector(`[name="${timerKind}TimerSoundUrl"]`)?.value.trim()
      : form.querySelector(`[name="${type}SoundUrl"]`)?.value.trim();
    const src = custom ? customUrl : REQUEST_TYPES[type]?.sound ?? TIMER_SOUND_SOURCES.signal1;
    if (!src) {
      ui.notifications.warn(localize("Requests.Resources.Required"));
      return;
    }
    const volumeName = timerKind ? `${timerKind}TimerSoundVolume` : `${type}SoundVolume`;
    const volume = Number(form.querySelector(`[name="${volumeName}"]`)?.value ?? 100) / 100;
    const userVolume = timerKind
      ? actions.volumeController?.getTimerVolume?.() ?? 1
      : actions.volumeController?.getVolume?.() ?? 1;
    try {
      const audio = await playAudio(src, {
        broadcast: false,
        volume: Math.min(1, Math.max(0, volume * userVolume))
      });
      if (!audio) return;
      this.previewAudio = audio;
      button.dataset.playing = "true";
      this.updatePreviewButtons();
      audio.addEventListener("end", () => {
        if (this.previewAudio === audio) this.previewAudio = null;
        this.updatePreviewButtons();
      }, { once: true });
    } catch (error) {
      this.previewAudio = null;
      this.updatePreviewButtons();
      ui.notifications.error(localize("Requests.Resources.SoundInvalid"));
    }
  }

  updatePreviewButtons() {
    for (const button of this.element?.querySelectorAll?.("[data-sound-preview]") ?? []) {
      const playing = Boolean(this.previewAudio) && button.dataset.playing === "true";
      if (!playing) button.dataset.playing = "false";
      const icon = button.querySelector("i");
      if (icon) icon.className = playing ? "fa-solid fa-stop" : "fa-solid fa-play";
      button.setAttribute("aria-label", localize(playing ? "Requests.Resources.Stop" : "Requests.Resources.Play"));
      button.title = localize(playing ? "Requests.Resources.Stop" : "Requests.Resources.Play");
    }
  }

  async _saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;

    try {
      const settingUpdates = [];
      if (!this.isMasterSettings) {
        for (const [type, request] of getVisibleRequestEntries()) {
          if (form.elements[`${type}Text`]?.disabled) continue;
          const text = String(formData.get(`${type}Text`) ?? "").trim().slice(0, 500);
          const color = normalizeRequestColor(formData.get(`${type}Color`));
          if (!color) throw new Error(localize("Requests.Settings.ColorInvalid"));
          const style = buildRequestTextStyle({
            color,
            fontSize: formData.get(`${type}FontSize`),
            underline: formData.get(`${type}Underline`) === "true",
            italic: formData.get(`${type}Italic`) === "true",
            bold: formData.get(`${type}Bold`) === "true",
            alignment: formData.get(`${type}Alignment`)
          });
          if (!style) throw new Error(localize("Requests.Settings.FontSizeInvalid"));
          settingUpdates.push([request.textSetting, text]);
          settingUpdates.push([request.styleSetting, sanitizeTextStyle(style)]);
        }
      }

      let feedEnabledChanged = false;
      if (this.isMasterSettings) {
        if (!isModerator()) throw new Error(localize("Requests.MasterSettings.Forbidden"));
        const previous = getRequestConfiguration();
        const next = normalizeRequestConfiguration({
          chatEnabled: formData.has("chatEnabled"),
          soundsEnabled: formData.has("soundsEnabled"),
          blockWhenEnvironment: formData.has("blockWhenEnvironment"),
          showWelcome: formData.has("showWelcome"),
          feed: {
            enabled: formData.has("feedEnabled"),
            showTime: formData.has("feedShowTime")
          },
          images: {},
          sounds: {},
          timerSounds: {},
          limits: {}
        });

        for (const type of Object.keys(REQUEST_TYPES)) {
          next.images[type] = {
            custom: formData.has(`${type}ImageCustom`),
            url: String(formData.get(`${type}ImageUrl`) ?? "").trim()
          };
          next.sounds[type] = {
            custom: formData.has(`${type}SoundCustom`),
            url: String(formData.get(`${type}SoundUrl`) ?? "").trim(),
            volume: Number(formData.get(`${type}SoundVolume`) ?? 100) / 100
          };
          if (next.images[type].custom) await validateResource(next.images[type].url, "image");
          if (next.sounds[type].custom) await validateResource(next.sounds[type].url, "sound");
        }
        for (const type of ["timer", "break"]) {
          next.timerSounds[type] = {
            custom: formData.has(`${type}TimerSoundCustom`),
            url: String(formData.get(`${type}TimerSoundUrl`) ?? "").trim(),
            volume: Number(formData.get(`${type}TimerSoundVolume`) ?? 100) / 100
          };
          if (next.timerSounds[type].custom) await validateResource(next.timerSounds[type].url, "sound");
        }
        for (const type of ["common", "urgent"]) {
          const timeoutModeValue = String(form.elements[type + "TimeoutMode"]?.value ?? REQUEST_TIMEOUT_MODES.none);
          const timeoutMode = Object.values(REQUEST_TIMEOUT_MODES).includes(timeoutModeValue)
            ? timeoutModeValue
            : REQUEST_TIMEOUT_MODES.none;
          const timeoutDuration = parseDurationInput(form.elements[type + "TimeoutTime"]?.value);
          if (timeoutMode !== REQUEST_TIMEOUT_MODES.none && !timeoutDuration) {
            throw new Error(localize("Requests.Limits.TimeoutInvalid"));
          }
          next.limits[type] = {
            mode: String(formData.get(type + "LimitMode") ?? REQUEST_LIMIT_MODES.none),
            count: clampRequestCount(formData.get(type + "LimitCount")),
            timeoutMode,
            timeoutDuration: timeoutDuration ?? previous.limits[type].timeoutDuration
          };
        }
        feedEnabledChanged = previous.feed.enabled !== next.feed.enabled;
        settingUpdates.unshift([SETTINGS.requestConfiguration, normalizeRequestConfiguration(next)]);
      }

      for (const [key, value] of settingUpdates) await game.settings.set(MODULE_ID, key, value);
      ui.notifications.info(localize("Requests.Settings.Saved"));
      await this.render({ force: true });
      if (feedEnabledChanged) await this.offerReload();
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save request settings`, error);
      ui.notifications.error(error?.message || localize("Requests.Settings.SaveError"));
      if (saveButton) saveButton.disabled = false;
    }
  }

  get isMasterSettings() {
    return false;
  }

  async offerReload() {
    const confirmed = await confirmDialog({
      title: localize("Requests.Feed.ReloadTitle"),
      content: `<p>${localize("Requests.Feed.ReloadHint")}</p>`,
      yes: localize("Requests.Feed.ReloadNow"),
      no: localize("Requests.Feed.ReloadLater"),
      icon: "fa-solid fa-rotate"
    });
    if (confirmed) window.location.reload();
  }

  async _onClose(options) {
    this.stopTimeoutTicking();
    await this.previewAudio?.stop?.();
    this.previewAudio = null;
    this.unsubscribeConfiguration?.();
    this.unsubscribeConfiguration = null;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    return super._onClose(options);
  }
}

class RequestMasterSettingsApplication extends RequestSettingsApplication {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-request-master-settings",
    classes: getThemedWindowClasses("dmicher-request-settings", "dmicher-request-master-settings"),
    position: { width: 820, height: 720 },
    window: {
      icon: "fa-solid fa-user-shield",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.MasterSettings.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/request-master-settings.hbs` }
  };

  get title() {
    return localize("Requests.MasterSettings.WindowTitle");
  }

  get isMasterSettings() {
    return true;
  }
}

class ThankAuthorApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-thank-author",
    window: { title: "DMICHERSPOTLIGHTTOOLS.Support.Thanks.MenuLabel" }
  };

  async render(_options = {}, _context = {}) {
    const opened = window.open(THANK_AUTHOR_URL, "_blank", "noopener,noreferrer");
    if (!opened) ui.notifications.warn(localize("Support.Thanks.PopupBlocked"));
    return this;
  }
}

export function registerRequestSettings(requestActions) {
  actions = requestActions;
  const userScope = getUserSettingScope();
  for (const request of Object.values(REQUEST_TYPES)) {
    game.settings.register(MODULE_ID, request.textSetting, {
      name: i18nKey(request.labelKey),
      scope: userScope,
      config: false,
      type: String,
      default: ""
    });
    game.settings.register(MODULE_ID, request.styleSetting, {
      name: i18nKey("Requests.Settings.Appearance"),
      scope: userScope,
      config: false,
      type: String,
      default: request.defaultStyle
    });
  }

  game.settings.registerMenu(MODULE_ID, "requestsSettings", {
    name: i18nKey("Requests.Settings.MenuName"),
    label: i18nKey("Requests.Settings.MenuLabel"),
    hint: i18nKey("Requests.Settings.MenuHint"),
    icon: "fa-solid fa-hand",
    type: RequestSettingsApplication,
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "requestMasterSettings", {
    name: i18nKey("Requests.MasterSettings.MenuName"),
    label: i18nKey("Requests.MasterSettings.MenuLabel"),
    hint: i18nKey("Requests.MasterSettings.MenuHint"),
    icon: "fa-solid fa-user-shield",
    type: RequestMasterSettingsApplication,
    restricted: true
  });
}

export function openThankAuthor() {
  return new ThankAuthorApplication().render();
}

export function registerThankAuthorMenu() {
  game.settings.registerMenu(MODULE_ID, "thankAuthor", {
    name: i18nKey("Support.Thanks.MenuName"),
    label: i18nKey("Support.Thanks.MenuLabel"),
    hint: i18nKey("Support.Thanks.MenuHint"),
    icon: "fa-solid fa-heart",
    type: ThankAuthorApplication,
    restricted: false
  });
}

export async function migrateLegacyClientRequestSettings() {
  if (getFoundryGeneration() < 13) return;
  const clientStorage = game.settings.storage?.get?.("client") ?? globalThis.localStorage;
  if (typeof clientStorage?.getItem !== "function") return;
  for (const request of Object.values(REQUEST_TYPES)) {
    for (const key of [request.textSetting, request.styleSetting]) {
      const current = game.settings.get(MODULE_ID, key, { document: true });
      if (current?.id) continue;
      const rawValue = clientStorage.getItem(`${MODULE_ID}.${key}`);
      if (rawValue == null) continue;
      let value = rawValue;
      try {
        value = JSON.parse(rawValue);
      } catch (_error) {
        // Older client storage can contain an unquoted string.
      }
      await game.settings.set(MODULE_ID, key, value);
    }
  }
}

export function openRequestSettings() {
  settingsWindow = openSingletonApplication(settingsWindow, () => new RequestSettingsApplication());
  return settingsWindow;
}

export function openRequestMasterSettings() {
  if (!isModerator()) {
    ui.notifications.warn(localize("Requests.MasterSettings.Forbidden"));
    return null;
  }
  masterSettingsWindow = openSingletonApplication(
    masterSettingsWindow,
    () => new RequestMasterSettingsApplication()
  );
  return masterSettingsWindow;
}

export function getRequestText(request) {
  return getRequestTextOverride(request) || localize(request.defaultTextKey);
}

export function getRequestStyle(request) {
  return sanitizeTextStyle(game.settings.get(MODULE_ID, request.styleSetting));
}

function getVisibleRequestEntries() {
  return Object.entries(REQUEST_TYPES).filter(([, request]) => canUseRequest(request));
}

function getRequestTextOverride(request) {
  const storedValue = game.settings.get(MODULE_ID, request.textSetting);
  if (storedValue == null) return "";
  const value = String(storedValue).trim();
  const legacyDefaultValue = `${I18N_PREFIX}.${request.defaultTextKey}`;
  return value === legacyDefaultValue ? "" : value;
}

async function validateResource(url, kind) {
  if (!url) throw new Error(localize("Requests.Resources.Required"));
  const error = new Error(localize(kind === "image" ? "Requests.Resources.ImageInvalid" : "Requests.Resources.SoundInvalid"));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), RESOURCE_VALIDATION_TIMEOUT_MS);
  let objectUrl = "";
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      signal: controller.signal
    });
    if (!response.ok) throw error;
    const blob = await response.blob();
    if (!blob.size || blob.size > 50 * 1024 * 1024) throw error;
    objectUrl = URL.createObjectURL(blob);
    await validatePlayableObjectUrl(objectUrl, kind, error);
  } catch (caught) {
    throw caught === error ? caught : error;
  } finally {
    window.clearTimeout(timeout);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function validatePlayableObjectUrl(url, kind, error) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (valid) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (valid) resolve();
      else reject(error);
    };
    const timeout = window.setTimeout(() => finish(false), RESOURCE_VALIDATION_TIMEOUT_MS);
    if (kind === "image") {
      const image = new Image();
      image.addEventListener("load", () => finish(image.naturalWidth > 0), { once: true });
      image.addEventListener("error", () => finish(false), { once: true });
      image.src = url;
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => finish(audio.readyState >= 1), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });
    audio.src = url;
    audio.load();
  });
}
