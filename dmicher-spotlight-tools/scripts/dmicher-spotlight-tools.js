import { MODULE_ID } from "./config.js";
import { FocusAuditTool } from "./tools/focus/focus-audit-tool.js";
import { openFocusAuditSettings } from "./tools/focus/focus-audit-settings.js";
import { ReadinessTool } from "./tools/readiness/readiness-tool.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  openRequestSettings,
  registerRequestSettings
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";
import { SpotlightControls } from "./tools/spotlight-controls.js";
import { StopwatchTool } from "./tools/stopwatch/stopwatch-tool.js";
import { TimerTool } from "./tools/timers/timer-tool.js";

const focusAuditTool = new FocusAuditTool();
const requestTool = new RequestTool({ focusAuditTool });
const requestHotbar = new RequestHotbar(requestTool.submitRequest);
const stopwatchTool = new StopwatchTool();
const timerTool = new TimerTool();
const readinessTool = new ReadinessTool();
const spotlightControls = new SpotlightControls({
  openRequests: () => requestTool.openActiveRequestsWindow(),
  openTimers: () => timerTool.openManager(),
  openBreakTimer: () => timerTool.openBreakTimer(),
  openStopwatch: () => stopwatchTool.openWindow(),
  openFocusAudit: () => focusAuditTool.openAuditWindow(),
  openReadiness: () => readinessTool.openWindow()
});

Hooks.once("init", () => {
  focusAuditTool.registerSettings();
  readinessTool.registerSettings();
  registerRequestSettings({
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart
  });
  timerTool.registerSettings();
  requestTool.registerHooks();
  focusAuditTool.registerHooks();
  readinessTool.registerHooks();
  spotlightControls.registerControls();
  stopwatchTool.registerHooks();

  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
    openActiveRequests: () => requestTool.openActiveRequestsWindow(),
    openFocusAudit: () => focusAuditTool.openAuditWindow(),
    openFocusAuditSettings,
    openTimers: () => timerTool.openManager(),
    openTimer: (timerId) => timerTool.openTimerWindow(timerId, { force: true }),
    openReadiness: () => readinessTool.openWindow(),
    openStopwatch: () => stopwatchTool.openWindow(),
    recordStopwatchEvent: (eventType) => stopwatchTool.recordEvent(eventType),
    submitRequest: requestTool.submitRequest
  };

  Hooks.on("renderChatMessageHTML", timerTool.renderChatMessage);
  Hooks.on("chatMessage", requestHotbar.handleChatMessage);
  Hooks.on("hotbarDrop", requestHotbar.handleHotbarDrop);
});

Hooks.once("ready", () => {
  focusAuditTool.activate();
  requestTool.activate();
  readinessTool.activate();
  timerTool.activate();
  stopwatchTool.activate();
  void requestHotbar.migrateMacros();
});
