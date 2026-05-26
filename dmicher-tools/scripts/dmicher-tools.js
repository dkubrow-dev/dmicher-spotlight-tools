import { MODULE_ID } from "./config.js";
import { RequestHotbar } from "./tools/requests/request-hotbar.js";
import {
  openRequestSettings,
  registerRequestSettings
} from "./tools/requests/request-settings.js";
import { RequestTool } from "./tools/requests/request-tool.js";

const requestTool = new RequestTool();
const requestHotbar = new RequestHotbar(requestTool.submitRequest);

Hooks.once("init", () => {
  registerRequestSettings({
    submitRequest: requestTool.submitRequest,
    onRequestDragStart: requestHotbar.onRequestDragStart
  });

  game.modules.get(MODULE_ID).api = {
    openRequestSettings,
    submitRequest: requestTool.submitRequest
  };

  Hooks.on("renderChatMessageHTML", requestTool.renderChatMessage);
  Hooks.on("chatMessage", requestHotbar.handleChatMessage);
  Hooks.on("hotbarDrop", requestHotbar.handleHotbarDrop);
});

Hooks.once("ready", () => {
  requestTool.activate();
  void requestHotbar.migrateMacros();
});
