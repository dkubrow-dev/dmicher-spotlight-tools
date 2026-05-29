import { MODULE_ID } from "../../config.js";
import { i18nKey, localize } from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ReadinessApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-readiness",
    classes: ["dmicher-readiness"],
    position: {
      width: 720,
      height: 480
    },
    window: {
      icon: "fa-solid fa-clipboard-check",
      title: "DMICHERSPOTLIGHTTOOLS.Readiness.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/readiness/readiness.hbs`
    }
  };

  constructor(readinessTool, options = {}) {
    super(options);
    this.readinessTool = readinessTool;
  }

  get title() {
    return localize("Readiness.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      rows: this.readinessTool.getRows(),
      keys: {
        heading: i18nKey("Readiness.Heading"),
        request: i18nKey("Readiness.Request"),
        selectedHint: i18nKey("Readiness.Columns.SelectedHint"),
        player: i18nKey("Readiness.Columns.Player"),
        playerHint: i18nKey("Readiness.Columns.PlayerHint"),
        status: i18nKey("Readiness.Columns.Status"),
        statusHint: i18nKey("Readiness.Columns.StatusHint"),
        clear: i18nKey("Readiness.Clear"),
        post: i18nKey("Readiness.Post")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners();
  }

  async _onClose(options) {
    this.readinessTool.forgetWindow(this);
    await super._onClose(options);
  }

  activateListeners() {
    this.element.querySelector("[data-readiness-action='request']")?.addEventListener("click", () => {
      void this.readinessTool.requestReadiness();
    });
    this.element.querySelector("[data-readiness-action='clear']")?.addEventListener("click", () => {
      void this.readinessTool.clear();
    });
    this.element.querySelector("[data-readiness-action='post']")?.addEventListener("click", () => {
      void this.readinessTool.postResultsToChat();
    });

    for (const checkbox of this.element.querySelectorAll("[data-readiness-action='selected']")) {
      checkbox.addEventListener("change", () => {
        void this.readinessTool.setSelected(checkbox.dataset.userId, checkbox.checked);
      });
    }
  }

  onReadinessChanged() {
    if (this.rendered) void this.render({ parts: ["main"] });
  }
}
