import { MODULE_ID, SETTINGS } from "../../config.js";
import { i18nKey, localize } from "../../utils.js";
import {
  AUDIT_METRICS,
  normalizeAuditThresholds
} from "./focus-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let settingsWindow;

class FocusAuditSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-focus-audit-settings",
    classes: ["dmicher-focus-audit-settings"],
    position: {
      width: 700,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-chart-simple",
      title: "DMICHERSPOTLIGHTTOOLS.Focus.Settings.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/focus/focus-audit-settings.hbs`
    }
  };

  get title() {
    return localize("Focus.Settings.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const thresholds = normalizeAuditThresholds(game.settings.get(MODULE_ID, SETTINGS.focusAuditThresholds));
    return {
      ...context,
      blocks: Object.entries(AUDIT_METRICS).map(([metricId, metric]) => ({
        metricId,
        title: localize(metric.titleKey),
        description: localize(metric.descriptionKey),
        doubt: thresholds[metricId].doubt,
        problem: thresholds[metricId].problem,
        deadline: thresholds[metricId].deadline
      })),
      keys: {
        doubt: i18nKey("Focus.Indicators.Doubt"),
        problem: i18nKey("Focus.Indicators.Problem"),
        deadline: i18nKey("Focus.Indicators.Deadline"),
        minutes: i18nKey("Focus.Settings.Minutes"),
        save: i18nKey("Focus.Settings.Save")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const form = this.element.querySelector(".dmicher-focus-audit-settings-form");
    form?.addEventListener("submit", (event) => void this.saveSettings(event));
  }

  async saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const next = {};

    for (const metricId of Object.keys(AUDIT_METRICS)) {
      const doubt = Number(formData.get(`${metricId}.doubt`));
      const problem = Number(formData.get(`${metricId}.problem`));
      const deadline = Number(formData.get(`${metricId}.deadline`));
      if (!isValidThresholds(doubt, problem, deadline)) {
        ui.notifications.error(localize("Focus.Settings.ValidationError"));
        return;
      }
      next[metricId] = { doubt, problem, deadline };
    }

    try {
      await game.settings.set(MODULE_ID, SETTINGS.focusAuditThresholds, next);
      ui.notifications.info(localize("Focus.Settings.Saved"));
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to save focus audit settings`, error);
      ui.notifications.error(localize("Focus.Settings.SaveError"));
    }
  }
}

export function openFocusAuditSettings() {
  if (settingsWindow?.rendered) {
    settingsWindow.bringToFront();
    return settingsWindow;
  }

  settingsWindow = new FocusAuditSettingsApplication();
  void settingsWindow.render({ force: true });
  return settingsWindow;
}

function isValidThresholds(doubt, problem, deadline) {
  return [doubt, problem, deadline].every((value) => Number.isFinite(value) && value >= 0)
    && doubt <= problem
    && problem <= deadline;
}
