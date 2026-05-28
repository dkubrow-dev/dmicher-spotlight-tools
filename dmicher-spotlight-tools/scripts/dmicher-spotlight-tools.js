import { MODULE_ID } from "./config.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  openRequestSettings,
  registerRequestSettings
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";
import { TimerTool } from "./tools/timers/timer-tool.js";

const requestTool = new RequestTool();
const requestHotbar = new RequestHotbar(requestTool.submitRequest);
const timerTool = new TimerTool();

Hooks.once("init", () => {
  registerRequestSettings({
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart
  });
  timerTool.registerSettings();
  timerTool.registerControls();

  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
    openTimers: () => timerTool.openManager(),
    openTimer: (timerId) => timerTool.openTimerWindow(timerId, { force: true }),
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
  void requestHotbar.migrateMacros();
});
