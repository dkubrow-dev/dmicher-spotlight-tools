import { MODULE_ID } from "../../config.js";
import { getThemedWindowClasses } from "../../theme.js";
import { REQUEST_HELP_GROUPS, REQUEST_HELP_PAGES } from "./request-help-content.js";
import {
  i18nKey,
  isModerator,
  localize,
  openSingletonApplication,
  runAfterApplicationLifecycle
} from "../../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let helpWindow;
let helpActions = {};

export class RequestHelpApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dmicher-spotlight-tools-request-help",
    classes: getThemedWindowClasses("dmicher-request-help"),
    position: { width: 920, height: 700 },
    window: {
      icon: "fa-solid fa-circle-question",
      title: "DMICHERSPOTLIGHTTOOLS.Requests.Help.WindowTitle",
      resizable: true
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/requests/help.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.activePage = "overview";
  }

  get title() {
    return localize("Requests.Help.WindowTitle");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const active = REQUEST_HELP_PAGES.find((page) => page.id === this.activePage) ?? REQUEST_HELP_PAGES[0];
    const page = prepareHelpPage(active);
    const activeGroup = REQUEST_HELP_GROUPS.find((group) => group.pages.includes(active));
    return {
      ...context,
      groups: REQUEST_HELP_GROUPS.map((group) => ({
        id: group.id,
        title: localize(groupKey(group)),
        active: group === activeGroup,
        pages: group.pages.map((candidate) => ({
          id: candidate.id,
          title: localize(helpKey(candidate, "Title")),
          active: candidate.id === active.id
        }))
      })),
      pageTitle: page.title,
      pageIntro: page.intro,
      pageSections: page.sections,
      showRequestActions: activeGroup?.id === "requests"
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender(context, options), () => {
      for (const link of this.element.querySelectorAll("[data-help-page]")) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.activePage = link.dataset.helpPage;
          void this.render({ parts: ["main"] });
        });
      }
      this.element.querySelector('[data-help-action="settings"]')?.addEventListener("click", () => helpActions.openSettings?.());
      this.element.querySelector('[data-help-action="management"]')?.addEventListener("click", () => helpActions.openActiveRequests?.());
    });
  }
}

function groupKey(group) {
  return ["Requests", "Help", "Groups", group.key].join(".");
}

function helpKey(page, ...parts) {
  return ["Requests", "Help", "Pages", page.key, ...parts].join(".");
}

function prepareHelpPage(page) {
  return {
    title: localize(helpKey(page, "Title")),
    intro: localize(helpKey(page, "Intro")),
    sections: page.sections.map((section) => ({
      title: localize(helpKey(page, "Sections", section.key, "Title")),
      items: section.items.map((item) => ({
        label: localize(helpKey(page, "Sections", section.key, "Items", item, "Label")),
        description: localize(helpKey(page, "Sections", section.key, "Items", item, "Description"))
      }))
    }))
  };
}

export function registerRequestHelp(actions = {}) {
  helpActions = actions;
  game.settings.registerMenu(MODULE_ID, "requestsHelp", {
    name: i18nKey("Requests.Help.MenuName"),
    label: i18nKey("Requests.Help.MenuLabel"),
    hint: i18nKey("Requests.Help.MenuHint"),
    icon: "fa-solid fa-circle-question",
    type: RequestHelpApplication,
    restricted: true
  });
}

export function openRequestHelp() {
  if (!isModerator()) {
    ui.notifications.warn(localize("Requests.Chat.Forbidden"));
    return null;
  }
  helpWindow = openSingletonApplication(helpWindow, () => new RequestHelpApplication());
  return helpWindow;
}
