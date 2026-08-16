import { MODULE_ID, REQUEST_TYPES } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { format, i18nKey, localize, runAfterApplicationLifecycle } from "../../utils.js";
import { getRequestConfiguration, hasConfiguredRequestTimeouts } from "./request-config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ACTIVE_REQUESTS_TICK_MS = 15000;

export class ActiveRequestsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-active-requests",
    classes: getThemedWindowClasses("dmicher-active-requests"),
    position: { width: 820, height: 520 },
    window: {
      icon: "fa-solid fa-hand",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.Active.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/requests/active-requests.hbs` }
  };

  constructor(activeRequests, options = {}) {
    super(options);
    this.activeRequests = activeRequests;
    this.tickHandle = null;
    this.visibleTypes = new Set(Object.keys(REQUEST_TYPES));
    this.duplicateMode = "none";
  }

  get title() {
    return this.getWindowTitle();
  }

  getWindowTitle() {
    return `${localize("Requests.Active.WindowTitle")} - ${this.activeRequests?.getCount?.() ?? 0}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const requests = this.activeRequests.getRows().map((row) => ({
      ...row,
      hasChatMessage: Boolean(row.messageId)
    }));
    const totalCount = requests.length;
    const urgentCount = this.activeRequests.getUrgentCount();
    const typeFilters = Object.entries(REQUEST_TYPES).map(([type, request]) => ({
      type,
      label: localize(request.labelKey),
      checked: this.visibleTypes.has(type)
    }));
    return {
      ...context,
      requests,
      typeFilters,
      totalCount,
      urgentCount,
      summaryText: format("Requests.Active.Summary", { total: totalCount, urgent: urgentCount }),
      hasRequests: requests.length > 0,
      showResetTimeouts: hasConfiguredRequestTimeouts(getRequestConfiguration()),
      duplicateNone: this.duplicateMode === "none",
      duplicateType: this.duplicateMode === "type",
      duplicatePlayer: this.duplicateMode === "player",
      keys: {
        heading: i18nKey("Requests.Active.Heading"),
        empty: i18nKey("Requests.Active.Empty"),
        columnIcon: i18nKey("Requests.Active.Columns.Icon"),
        columnSubmitted: i18nKey("Requests.Active.Columns.Submitted"),
        columnAuthor: i18nKey("Requests.Active.Columns.Author"),
        columnControls: i18nKey("Requests.Active.Columns.Controls"),
        openMessage: i18nKey("Requests.Active.OpenMessage"),
        cancel: i18nKey("Requests.Active.Cancel"),
        environment: i18nKey("Requests.Active.EnvironmentRequest"),
        resetTimeouts: i18nKey("Requests.Limits.ResetTimers"),
        clear: i18nKey("Requests.Active.Clear")
      }
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender(context, options), () => {
      ui.chat?.updateTimestamps?.();
      this.updateWindowTitle();
      this.activateListeners();
      this.applyFilters();
      this.startTicking();
    });
  }

  _onClose(options) {
    this.stopTicking();
    this.activeRequests.forgetWindow(this);
    return super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-active-request-action='reset-timeouts']")?.addEventListener("click", () => {
      void this.activeRequests.confirmResetTimeouts();
    });

    this.element.querySelector("[data-active-request-action='environment']")?.addEventListener("click", () => {
      void this.activeRequests.submitEnvironmentRequest();
    });

    this.element.querySelector("[data-active-request-action='clear']")?.addEventListener("click", () => {
      void this.activeRequests.confirmClear();
    });

    for (const input of this.element.querySelectorAll("[data-active-request-filter='type']")) {
      input.addEventListener("change", () => {
        if (input.checked) this.visibleTypes.add(input.value);
        else this.visibleTypes.delete(input.value);
        this.applyFilters();
      });
    }
    for (const input of this.element.querySelectorAll("[data-active-request-filter='duplicates']")) {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.duplicateMode = input.value;
        this.applyFilters();
      });
    }

    for (const button of this.element.querySelectorAll("[data-active-request-action][data-request-id]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const requestId = button.dataset.requestId;
        switch (button.dataset.activeRequestAction) {
          case "open":
            void this.activeRequests.goToMessage(requestId);
            break;
          case "grant":
            void this.activeRequests.resolve(requestId, "grant");
            break;
          case "cancel":
            void this.activeRequests.resolve(requestId, "cancel");
            break;
        }
      });
    }
  }

  applyFilters() {
    const seen = new Set();
    let visibleCount = 0;
    for (const row of this.element?.querySelectorAll?.("[data-active-request-row]") ?? []) {
      const typeVisible = this.visibleTypes.has(row.dataset.urgency);
      const duplicateKey = this.duplicateMode === "type"
        ? `${row.dataset.authorId}:${row.dataset.urgency}`
        : this.duplicateMode === "player"
          ? row.dataset.authorId
          : "";
      const duplicate = duplicateKey && seen.has(duplicateKey);
      if (typeVisible && duplicateKey && !duplicate) seen.add(duplicateKey);
      row.hidden = !typeVisible || Boolean(duplicate);
      if (!row.hidden) visibleCount += 1;
    }
    const counter = this.element?.querySelector?.("[data-visible-request-count]");
    if (counter) counter.textContent = String(visibleCount);
  }

  startTicking() {
    this.stopTicking();
    this.tickHandle = window.setInterval(() => this.onActiveRequestsChanged({ refresh: true }), ACTIVE_REQUESTS_TICK_MS);
  }

  stopTicking() {
    if (!this.tickHandle) return;
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  updateWindowTitle() {
    const title = this.getWindowTitle();
    if (typeof this.setTitle === "function") {
      this.setTitle(title);
      return;
    }
    this.element?.querySelector(".window-title")?.replaceChildren(title);
    this.element?.setAttribute("aria-label", title);
  }

  onActiveRequestsChanged({ refresh = false } = {}) {
    if (!this.rendered) return;
    if (refresh) this.activeRequests.refresh();
    this.updateWindowTitle();
    void this.render({ parts: ["main"] }).then(() => this.updateWindowTitle());
  }
}
