import { MODULE_ID } from "../../config.js";
import { i18nKey, localize } from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ACTIVE_REQUESTS_TICK_MS = 15000;

export class ActiveRequestsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-active-requests",
    classes: ["dmicher-active-requests"],
    position: {
      width: 720,
      height: 420
    },
    window: {
      icon: "fa-solid fa-hand",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.Active.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/requests/active-requests.hbs`
    }
  };

  constructor(activeRequests, options = {}) {
    super(options);
    this.activeRequests = activeRequests;
    this.tickHandle = null;
  }

  get title() {
    return localize("Requests.Active.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const requests = this.activeRequests.getRows();
    return {
      ...context,
      requests,
      hasRequests: requests.length > 0,
      keys: {
        heading: i18nKey("Requests.Active.Heading"),
        empty: i18nKey("Requests.Active.Empty"),
        columnIcon: i18nKey("Requests.Active.Columns.Icon"),
        columnSubmitted: i18nKey("Requests.Active.Columns.Submitted"),
        columnAuthor: i18nKey("Requests.Active.Columns.Author"),
        columnControls: i18nKey("Requests.Active.Columns.Controls"),
        openMessage: i18nKey("Requests.Active.OpenMessage"),
        cancel: i18nKey("Requests.Active.Cancel"),
        clear: i18nKey("Requests.Active.Clear")
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
    this.activeRequests.forgetWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-active-request-action='clear']")?.addEventListener("click", () => {
      void this.activeRequests.confirmClear();
    });

    for (const button of this.element.querySelectorAll("[data-active-request-action][data-message-id]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const messageId = button.dataset.messageId;
        switch (button.dataset.activeRequestAction) {
          case "open":
            void this.activeRequests.goToMessage(messageId);
            break;
          case "grant":
            void this.activeRequests.resolve(messageId, "grant");
            break;
          case "cancel":
            void this.activeRequests.resolve(messageId, "cancel");
            break;
        }
      });
    }
  }

  startTicking() {
    this.stopTicking();
    this.tickHandle = window.setInterval(() => this.onActiveRequestsChanged(), ACTIVE_REQUESTS_TICK_MS);
  }

  stopTicking() {
    if (!this.tickHandle) return;
    window.clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  onActiveRequestsChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
