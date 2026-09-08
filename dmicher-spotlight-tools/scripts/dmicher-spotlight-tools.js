import { MODULE_ID } from "./config.js";
import { generics } from "./generics.js";
import { getPremiumStatus, subscribePremiumChanges, waitForPremiumReady } from "./premium-provider.js";
import { activateTechnicalChat, registerTechnicalChat, synchronizeTechnicalIdentity } from "./technical-chat.js";
import {
  installHotbarMacroCleanup,
  synchronizeCurrentUserHotbarMacroMetadata
} from "./tools/hotbar-macro.js";
import { FocusAuditTool } from "./tools/focus/focus-audit-tool.js";
import { openFocusAuditSettings } from "./tools/focus/focus-audit-settings.js";
import { PollTool } from "./tools/polls/poll-tool.js";
import { configureRequestFeed } from "./tools/requests/request-feed.js";
import { openRequestHelp, registerRequestHelp } from "./tools/requests/request-help.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  migrateLegacyClientRequestSettings,
  openRequestMasterSettings,
  openRequestSettings,
  openThankAuthor,
  registerRequestSettings,
  registerThankAuthorMenu
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";
import { RequestVolumeController } from "./tools/requests/request-volume.js";
import { SpotlightControls } from "./tools/spotlight-controls.js";
import { StopwatchTool } from "./tools/stopwatch/stopwatch-tool.js";
import { TimerTool } from "./tools/timers/timer-tool.js";
import { applySpotlightTheme, registerThemeSetting } from "./theme.js";

const focusAuditTool = new FocusAuditTool();
const requestVolumeController = new RequestVolumeController();
const requestTool = new RequestTool({
  focusAuditTool,
  volumeController: requestVolumeController
});
const requestHotbar = new RequestHotbar(requestTool.submitRequest);
const stopwatchTool = new StopwatchTool();
const timerTool = new TimerTool({ volumeController: requestVolumeController });
const pollTool = new PollTool({ timerTool });
const spotlightControls = new SpotlightControls({
  openHelp: () => openRequestHelp(),
  openRequests: () => requestTool.openActiveRequestsWindow(),
  openTimers: () => timerTool.openManager(),
  openBreakTimer: () => timerTool.openBreakTimer(),
  openStopwatch: () => stopwatchTool.openWindow(),
  openFocusAudit: () => focusAuditTool.openAuditWindow(),
  openPolls: () => pollTool.openManager()
});

Hooks.once("init", () => {
  registerTechnicalChat();
  registerThemeSetting();
  focusAuditTool.registerSettings();
  pollTool.registerSettings();
  requestVolumeController.registerSetting();
  requestTool.registerSettings();
  registerRequestSettings({
    synchronizeChatIdentity: synchronizeTechnicalIdentity,
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart,
    volumeController: requestVolumeController,
    subscribeConfiguration: (listener) => requestTool.subscribeConfiguration(listener),
    subscribeState: (listener) => requestTool.subscribeState(listener)
  });
  registerRequestHelp({
    openSettings: () => openRequestSettings(),
    openActiveRequests: () => requestTool.openActiveRequestsWindow()
  });
  registerThankAuthorMenu();
  configureRequestFeed({
    activeRequests: requestTool.activeRequests,
    actions: {
      submitRequest: requestTool.submitRequest,
      onRequestDragStart: requestHotbar.onRequestDragStart,
      openSettings: () => openRequestSettings(),
      openManagement: () => requestTool.openActiveRequestsWindow()
    }
  });
  timerTool.registerSettings();
  timerTool.registerHooks();
  requestTool.registerHooks();
  requestVolumeController.registerHooks();
  requestHotbar.registerHooks();
  focusAuditTool.registerHooks();
  pollTool.registerHooks();
  spotlightControls.registerControls();
  stopwatchTool.registerHooks();

  const unsubscribePremium = subscribePremiumChanges((status) => {
    Hooks.callAll("dmicherSpotlightPremiumChanged", status);
    if (!game.ready) return;
    requestTool.notifyConfigurationChanged();
    if (Number(game.user?.role) === 4) {
      void synchronizeTechnicalIdentity().catch((error) => console.warn(`${MODULE_ID} | Unable to synchronize Premium chat settings`, error));
    }
  });
  globalThis.addEventListener?.("pagehide", unsubscribePremium, { once: true });
  game.modules.get(MODULE_ID).api = {
    apiVersion: 1,
    getPremiumStatus,
    openRequestSettings,
    openRequestMasterSettings,
    openRequestHelp,
    openHelp: openRequestHelp,
    openThankAuthor,
    openActiveRequests: () => requestTool.openActiveRequestsWindow(),
    openFocusAudit: () => focusAuditTool.openAuditWindow(),
    openFocusAuditSettings,
    openTimers: () => timerTool.openManager(),
    openTimer: (timerId) => timerTool.openTimerWindow(timerId, { force: true }),
    openPolls: () => pollTool.openManager(),
    openPollLaunch: (templateId) => pollTool.openLaunchWindow(templateId),
    openReadiness: () => pollTool.openManager(),
    openStopwatch: () => stopwatchTool.openWindow(),
    recordStopwatchEvent: (eventType) => stopwatchTool.recordEvent(eventType),
    submitRequest: requestTool.submitRequest
  };
  generics.modules.register(MODULE_ID, {
    apiVersion: 1,
    api: game.modules.get(MODULE_ID).api,
    capabilities: ["openHelp", "openActiveRequests", "openFocusAudit", "openTimers", "openPolls", "openStopwatch"]
  });
  Hooks.callAll("dmicherSpotlightReady", game.modules.get(MODULE_ID).api);
});

Hooks.once("ready", async () => {
  applySpotlightTheme();
  await waitForPremiumReady();
  try {
    await activateTechnicalChat();
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to initialize the technical chat identity`, error);
    ui.notifications.error(error.message);
  }
  void migrateLegacyClientRequestSettings().catch((error) => {
    console.error(`${MODULE_ID} | Unable to migrate legacy request settings`, error);
  });
  focusAuditTool.activate();
  requestTool.activate();
  pollTool.activate();
  timerTool.activate();
  stopwatchTool.activate();
  installHotbarMacroCleanup();
  try {
    await requestHotbar.migrateMacros();
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to migrate request hotbar macros`, error);
  }
  try {
    await synchronizeCurrentUserHotbarMacroMetadata();
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to synchronize hotbar macro metadata`, error);
  }
});
