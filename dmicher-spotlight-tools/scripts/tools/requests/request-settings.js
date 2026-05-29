import { I18N_PREFIX, MODULE_ID, REQUEST_TYPES } from "../../config.js";
import { canUseRequest, i18nKey, localize, sanitizeTextStyle } from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let actions;
let settingsWindow;

class RequestSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-request-settings",
    classes: ["dmicher-request-settings"],
    position: {
      width: 750,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-hand",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.Settings.WindowTitle",
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
    const requests = getVisibleRequestEntries().map(([type, request]) => ({
      urgency: type,
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
      image.addEventListener("click", () => void actions.submitRequest(image.dataset.urgency));
      image.addEventListener("keydown", (event) => {
        if ((event.key === "Enter") || (event.key === " ")) {
          event.preventDefault();
          void actions.submitRequest(image.dataset.urgency);
        }
      });
      image.addEventListener("dragstart", actions.onRequestDragStart);
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
      for (const [type, request] of getVisibleRequestEntries()) {
        const text = String(formData.get(`${type}Text`) ?? "").trim().slice(0, 500);
        const style = sanitizeTextStyle(formData.get(`${type}Style`));
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

export function registerRequestSettings(requestActions) {
  actions = requestActions;

  for (const request of Object.values(REQUEST_TYPES)) {
    game.settings.register(MODULE_ID, request.textSetting, {
      name: i18nKey(request.labelKey),
      scope: "user",
      config: false,
      type: String,
      default: ""
    });
    game.settings.register(MODULE_ID, request.styleSetting, {
      name: i18nKey("Requests.Settings.CssStyle"),
      scope: "user",
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
}

export function openRequestSettings() {
  if (settingsWindow?.rendered) {
    settingsWindow.bringToFront();
    return settingsWindow;
  }

  settingsWindow = new RequestSettingsApplication();
  void settingsWindow.render({ force: true });
  return settingsWindow;
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
