import { MODULE_ID, REQUEST_TYPES } from "../../config.js";
import {
  canUseRequest,
  formatDigitalDuration,
  getFoundryGeneration,
  getRenderedElement,
  i18nKey,
  isModerator,
  localize,
  runAfterApplicationLifecycle
} from "../../utils.js";
import {
  getActiveRequestState,
  getRequestConfiguration,
  getRequestImage,
  getRequestTimeoutStatus
} from "./request-config.js";
import { REQUEST_TIMEOUT_TICK_MS, updateRequestTimeoutCounters } from "./request-timeout-display.js";

const ModernSidebarBase = foundry.applications.sidebar?.AbstractSidebarTab;
const SidebarBase = ModernSidebarBase
  ? foundry.applications.api.HandlebarsApplicationMixin(ModernSidebarBase)
  : (globalThis.SidebarTab ?? foundry.applications.api.ApplicationV2);
const FEED_TICK_MS = 15000;
let feedActions = {};
let activeRequestsController = null;

export class RequestFeedSidebar extends SidebarBase {
  static tabName = "requests";

  static DEFAULT_OPTIONS = {
    id: "requests",
    classes: ["dmicher-request-feed"],
    window: { frame: false, positioned: false }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/requests/feed.hbs` }
  };

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "requests",
      template: `modules/${MODULE_ID}/templates/requests/feed.hbs`,
      classes: ["tab", "sidebar-tab", "dmicher-request-feed"],
      popOut: false
    });
  }

  constructor(...args) {
    super(...args);
    this.tickHandle = null;
    this.timeoutTickHandle = null;
    this.handleFeedClick = this.handleFeedClick.bind(this);
    this.handleFeedDragStart = this.handleFeedDragStart.bind(this);
    activeRequestsController?.attachFeed(this);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, ...this.getFeedContext() };
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    return { ...context, ...this.getFeedContext() };
  }

  getFeedContext() {
    const configuration = getRequestConfiguration();
    const activeState = getActiveRequestState();
    const moderator = isModerator();
    const now = Date.now();
    const rows = activeRequestsController?.getRows({ showTime: configuration.feed.showTime }) ?? [];
    const macros = Object.entries(REQUEST_TYPES)
      .filter(([, request]) => canUseRequest(request))
      .map(([type, request]) => {
        const timeout = getRequestTimeoutStatus(type, game.user.id, activeState, configuration, now);
        return {
          urgency: type,
          label: localize(request.labelKey),
          image: getRequestImage(type, configuration),
          timeoutActive: timeout.active,
          timeoutExpiresAt: timeout.expiresAt,
          timeoutRemainingText: formatDigitalDuration(timeout.remaining)
        };
      });
    return {
      requests: rows,
      hasRequests: rows.length > 0,
      showTime: configuration.feed.showTime,
      moderator,
      legacy: getFoundryGeneration() < 13,
      macros
    };
  }

  _onRender(context, options) {
    return runAfterApplicationLifecycle(super._onRender?.(context, options), () => {
      this.activateFeedListeners(this.element);
      this.startTicking();
    });
  }

  activateListeners(html) {
    super.activateListeners?.(html);
    this.activateFeedListeners(getRenderedElement(html));
    this.startTicking();
  }

  activateFeedListeners(root) {
    if (!root || root.dataset.dmicherFeedReady === "true") return;
    root.dataset.dmicherFeedReady = "true";
    root.addEventListener("click", this.handleFeedClick);
    root.addEventListener("dragstart", this.handleFeedDragStart);
  }

  handleFeedClick(event) {
    dispatchRequestFeedClick(event);
  }

  handleFeedDragStart(event) {
    dispatchRequestFeedDragStart(event);
  }

  startTicking() {
    this.stopTicking();
    this.tickHandle = window.setInterval(() => this.onActiveRequestsChanged(), FEED_TICK_MS);
    updateRequestTimeoutCounters(this.element);
    this.timeoutTickHandle = window.setInterval(
      () => updateRequestTimeoutCounters(this.element),
      REQUEST_TIMEOUT_TICK_MS
    );
  }

  stopTicking() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
    if (this.timeoutTickHandle) window.clearInterval(this.timeoutTickHandle);
    this.tickHandle = null;
    this.timeoutTickHandle = null;
  }

  onActiveRequestsChanged() {
    if (!this.rendered) return;
    if (getFoundryGeneration() >= 13) void this.render({ force: true });
    else this.render(true);
  }

  _onActivate() {
    const result = super._onActivate?.();
    if (!this.element?.querySelector(".dmicher-request-feed-shell")) {
      if (getFoundryGeneration() >= 13) void this.render({ force: true });
      else this.render(true);
    }
    return result;
  }

  _onClose(options) {
    this.stopTicking();
    return super._onClose?.(options);
  }

  close(options) {
    this.stopTicking();
    return super.close?.(options);
  }
}

export function dispatchRequestFeedClick(event, {
  controller = activeRequestsController,
  actions = feedActions
} = {}) {
  const requestButton = event.target?.closest?.("[data-feed-request-action][data-request-id]");
  if (requestButton) {
    event.preventDefault?.();
    event.stopPropagation?.();
    void controller?.resolve(requestButton.dataset.requestId, requestButton.dataset.feedRequestAction);
    return;
  }

  const macro = event.target?.closest?.("[data-feed-macro]");
  if (macro) {
    event.preventDefault?.();
    event.stopPropagation?.();
    void actions.submitRequest?.(macro.dataset.urgency);
    return;
  }

  const actionButton = event.target?.closest?.("[data-feed-action]");
  if (!actionButton) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  switch (actionButton.dataset.feedAction) {
    case "settings":
      actions.openSettings?.();
      break;
    case "help":
      actions.openHelp?.();
      break;
    case "management":
      actions.openManagement?.();
      break;
  }
}

export function dispatchRequestFeedDragStart(event, { actions = feedActions } = {}) {
  const macro = event.target?.closest?.("[data-feed-macro]");
  if (!macro) return;
  actions.onRequestDragStart?.({
    currentTarget: macro,
    dataTransfer: event.dataTransfer,
    preventDefault: () => event.preventDefault?.()
  });
}

export function configureRequestFeed({ activeRequests, actions }) {
  activeRequestsController = activeRequests;
  feedActions = actions;
  if (!getRequestConfiguration().feed.enabled) return false;

  CONFIG.ui ??= {};
  CONFIG.ui.requests = RequestFeedSidebar;
  if (getFoundryGeneration() >= 13) installModernSidebarDescriptor();
  else Hooks.on("renderSidebar", injectLegacySidebarTab);
  return true;
}

function installModernSidebarDescriptor() {
  const sidebarClass = CONFIG.ui.sidebar;
  const tabs = sidebarClass?.TABS;
  if (!tabs || tabs.requests) return;
  const descriptor = {
    tooltip: i18nKey("Requests.Feed.Tab"),
    icon: "fa-solid fa-hand"
  };
  const reordered = {};
  let inserted = false;
  for (const [key, value] of Object.entries(tabs)) {
    reordered[key] = value;
    if (key === "combat") {
      reordered.requests = descriptor;
      inserted = true;
    }
  }
  if (!inserted) reordered.requests = descriptor;
  for (const key of Object.keys(tabs)) delete tabs[key];
  Object.assign(tabs, reordered);
}

function injectLegacySidebarTab(application, html) {
  const root = getRenderedElement(html) ?? application?.element;
  if (!root || root.querySelector('[data-tab="requests"]')) return;
  const nav = root.querySelector("#sidebar-tabs");
  if (!nav) return;
  const anchor = document.createElement("a");
  anchor.className = "item";
  anchor.dataset.tab = "requests";
  anchor.setAttribute("aria-label", localize("Requests.Feed.Tab"));
  anchor.setAttribute("aria-controls", "requests");
  anchor.setAttribute("role", "tab");
  anchor.dataset.tooltip = localize("Requests.Feed.Tab");
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-hand";
  anchor.append(icon);
  const combat = nav.querySelector('[data-tab="combat"]');
  if (combat?.after) combat.after(anchor);
  else {
    const scenes = nav.querySelector('[data-tab="scenes"]');
    if (scenes) scenes.before(anchor);
    else nav.prepend(anchor);
  }
  const template = document.createElement("template");
  template.className = "tab";
  template.id = "requests";
  template.dataset.tab = "requests";
  template.setAttribute("role", "tabpanel");
  root.append(template);
  anchor.addEventListener("click", (event) => {
    event.preventDefault();
    ui.sidebar?.activateTab?.("requests");
    ui.requests?.activate?.();
  });
}
