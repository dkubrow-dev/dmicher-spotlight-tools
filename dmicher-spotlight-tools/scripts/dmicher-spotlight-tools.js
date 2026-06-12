import { MODULE_ID } from "./config.js";
import { FocusAuditTool } from "./tools/focus/focus-audit-tool.js";
import { openFocusAuditSettings } from "./tools/focus/focus-audit-settings.js";
import { PollTool } from "./tools/polls/poll-tool.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  openRequestSettings,
  registerRequestSettings
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";
import { SpotlightControls } from "./tools/spotlight-controls.js";
import { StopwatchTool } from "./tools/stopwatch/stopwatch-tool.js";
import { TimerTool } from "./tools/timers/timer-tool.js";
import { applySpotlightTheme, registerThemeSetting } from "./theme.js";

const focusAuditTool = new FocusAuditTool();
const requestTool = new RequestTool({ focusAuditTool });
const requestHotbar = new RequestHotbar(requestTool.submitRequest);
const stopwatchTool = new StopwatchTool();
const timerTool = new TimerTool();
const pollTool = new PollTool({ timerTool });
const spotlightControls = new SpotlightControls({
  openRequests: () => requestTool.openActiveRequestsWindow(),
  openTimers: () => timerTool.openManager(),
  openBreakTimer: () => timerTool.openBreakTimer(),
  openStopwatch: () => stopwatchTool.openWindow(),
  openFocusAudit: () => focusAuditTool.openAuditWindow(),
  openPolls: () => pollTool.openManager()
});

Hooks.once("init", () => {
  registerThemeSetting();
  focusAuditTool.registerSettings();
  pollTool.registerSettings();
  registerRequestSettings({
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart
  });
  timerTool.registerSettings();
  requestTool.registerHooks();
  focusAuditTool.registerHooks();
  pollTool.registerHooks();
  spotlightControls.registerControls();
  stopwatchTool.registerHooks();

  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
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

  Hooks.on("renderChatMessageHTML", timerTool.renderChatMessage);
  Hooks.on("chatMessage", requestHotbar.handleChatMessage);
  Hooks.on("hotbarDrop", requestHotbar.handleHotbarDrop);
});

Hooks.once("ready", () => {
  applySpotlightTheme();
  focusAuditTool.activate();
  requestTool.activate();
  pollTool.activate();
  timerTool.activate();
  stopwatchTool.activate();
  void requestHotbar.migrateMacros();
});
