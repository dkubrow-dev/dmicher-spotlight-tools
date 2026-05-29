import { MODULE_ID } from "../../config.js";
import { i18nKey, localize } from "../../utils.js";
import { openFocusAuditSettings } from "./focus-audit-settings.js";
import { AUDIT_METRICS } from "./focus-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FOCUS_AUDIT_TICK_MS = 5000;

export class FocusAuditApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-focus-audit",
    classes: ["dmicher-focus-audit"],
    position: {
      width: 920,
      height: 520
    },
    window: {
      icon: "fa-solid fa-chart-simple",
      title: "DMICHERSPOTLIGHTTOOLS.Focus.Audit.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/focus/focus-audit.hbs`
    }
  };

  constructor(focusAuditTool, options = {}) {
    super(options);
    this.focusAuditTool = focusAuditTool;
    this.tickHandle = null;
  }

  get title() {
    return localize("Focus.Audit.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      rows: this.focusAuditTool.getAuditRows(),
      metrics: Object.entries(AUDIT_METRICS).map(([metricId, metric]) => ({
        metricId,
        labelKey: i18nKey(metric.abbreviationKey),
        title: `${localize(metric.titleKey)}: ${localize(metric.descriptionKey)}`
      })),
      keys: {
        heading: i18nKey("Focus.Audit.Heading"),
        resetAll: i18nKey("Focus.Audit.ResetAll"),
        settings: i18nKey("Focus.Settings.WindowTitle"),
        activate: i18nKey("Focus.Audit.Columns.ActivateHint"),
        player: i18nKey("Focus.Audit.Columns.Player"),
        playerHint: i18nKey("Focus.Audit.Columns.PlayerHint"),
        foundryStatus: i18nKey("Focus.Audit.Columns.FoundryStatus"),
        foundryStatusHint: i18nKey("Focus.Audit.Columns.FoundryStatusHint"),
        selfStatus: i18nKey("Focus.Audit.Columns.SelfStatus"),
        selfStatusHint: i18nKey("Focus.Audit.Columns.SelfStatusHint"),
        controls: i18nKey("Focus.Audit.Columns.Controls"),
        controlsHint: i18nKey("Focus.Audit.Columns.ControlsHint"),
        grant: i18nKey("Focus.Audit.Grant"),
        resetPlayer: i18nKey("Focus.Audit.ResetPlayer")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
    this.startTicking();
  }

  async _onClose(options) {
    this.stopTicking();
    this.focusAuditTool.forgetAuditWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-focus-action='reset-all']")?.addEventListener("click", () => {
      void this.focusAuditTool.confirmResetAll();
    });
    this.element.querySelector("[data-focus-action='settings']")?.addEventListener("click", () => {
      openFocusAuditSettings();
    });

    for (const checkbox of this.element.querySelectorAll("[data-focus-action='toggle-enabled']")) {
      checkbox.addEventListener("change", () => {
        void this.focusAuditTool.setAuditEnabled(checkbox.dataset.userId, checkbox.checked);
      });
    }

    for (const button of this.element.querySelectorAll("[data-focus-action='grant']")) {
      button.addEventListener("click", () => void this.focusAuditTool.markLastGranted(button.dataset.userId));
    }

    for (const button of this.element.querySelectorAll("[data-focus-action='reset-player']")) {
      button.addEventListener("click", () => void this.focusAuditTool.confirmResetPlayer(button.dataset.userId));
    }
  }

  startTicking() {
    this.stopTicking();
    this.tickHandle = window.setInterval(() => {
      void this.focusAuditTool.ensureActiveRowsDefaults().then(() => this.onAuditChanged());
    }, FOCUS_AUDIT_TICK_MS);
    void this.focusAuditTool.ensureActiveRowsDefaults();
  }

  stopTicking() {
    if (!this.tickHandle) return;
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  onAuditChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
