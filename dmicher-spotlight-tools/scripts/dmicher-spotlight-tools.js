import { MODULE_ID } from "./config.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  openRequestSettings,
  registerRequestSettings
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";
import { SpotlightControls } from "./tools/spotlight-controls.js";
import { StopwatchTool } from "./tools/stopwatch/stopwatch-tool.js";
import { TimerTool } from "./tools/timers/timer-tool.js";

const requestTool = new RequestTool();
const requestHotbar = new RequestHotbar(requestTool.submitRequest);
const stopwatchTool = new StopwatchTool();
const timerTool = new TimerTool();
const spotlightControls = new SpotlightControls({
  openTimers: () => timerTool.openManager(),
  openBreakTimer: () => timerTool.openBreakTimer(),
  openStopwatch: () => stopwatchTool.openWindow()
});

Hooks.once("init", () => {
  registerRequestSettings({
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart
  });
  timerTool.registerSettings();
  spotlightControls.registerControls();
  stopwatchTool.registerHooks();

  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
    openTimers: () => timerTool.openManager(),
    openTimer: (timerId) => timerTool.openTimerWindow(timerId, { force: true }),
    openStopwatch: () => stopwatchTool.openWindow(),
    recordStopwatchEvent: (eventType) => stopwatchTool.recordEvent(eventType),
    submitRequest: requestTool.submitRequest
  };

  Hooks.on("renderChatMessageHTML", requestTool.renderChatMessage);
  Hooks.on("renderChatMessageHTML", timerTool.renderChatMessage);
  Hooks.on("chatMessage", requestHotbar.handleChatMessage);
  Hooks.on("hotbarDrop", requestHotbar.handleHotbarDrop);
});

Hooks.once("ready", () => {
  requestTool.activate();
  timerTool.activate();
  stopwatchTool.activate();
  void requestHotbar.migrateMacros();
});
