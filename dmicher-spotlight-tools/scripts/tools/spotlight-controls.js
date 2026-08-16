import { MODULE_ID } from "../config.js";
import { isModerator, localize } from "../utils.js";

const MENU_ROOT_TOOL = "spotlight-tools-root";
const LEGACY_CONTROL_LAYER = "dmicherSpotlightTools";
const LEGACY_CONTROL_LAYER_MARKER = Symbol.for(MODULE_ID + ".legacy-control-layer");

export function ensureLegacyControlLayer(target = globalThis.canvas) {
  if (!target) return LEGACY_CONTROL_LAYER;
  if (target[LEGACY_CONTROL_LAYER]?.[LEGACY_CONTROL_LAYER_MARKER]) return LEGACY_CONTROL_LAYER;
  const layer = {
    [LEGACY_CONTROL_LAYER_MARKER]: true,
    activate() {
      globalThis.ui?.controls?.initialize?.({ control: MODULE_ID });
    }
  };
  Object.defineProperty(target, LEGACY_CONTROL_LAYER, {
    configurable: true,
    value: layer,
    writable: true
  });
  return LEGACY_CONTROL_LAYER;
}
const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: MENU_ROOT_TOOL,
    titleKey: "Controls.Title",
    icon: "fa-solid fa-person-rays",
    order: -1,
    action: null
  }),
  Object.freeze({ name: "help", titleKey: "Controls.Help", icon: "fa-solid fa-circle-question", order: 0, action: "openHelp" }),
  Object.freeze({ name: "requests", titleKey: "Controls.Requests", icon: "fa-solid fa-hand", order: 10, action: "openRequests" }),
  Object.freeze({ name: "polls", titleKey: "Controls.Polls", icon: "fa-solid fa-square-poll-horizontal", order: 20, action: "openPolls" }),
  Object.freeze({ name: "break", titleKey: "Controls.Break", icon: "fa-solid fa-mug-saucer", order: 30, action: "openBreakTimer" }),
  Object.freeze({ name: "timers", titleKey: "Controls.Timers", icon: "fa-solid fa-hourglass-half", order: 40, action: "openTimers" }),
  Object.freeze({ name: "stopwatch", titleKey: "Controls.Stopwatch", icon: "fa-solid fa-stopwatch", order: 50, action: "openStopwatch" }),
  Object.freeze({ name: "focusAudit", titleKey: "Controls.FocusAudit", icon: "fa-solid fa-chart-simple", order: 60, action: "openFocusAudit" })
]);

export class SpotlightControls {
  constructor({ openHelp, openRequests, openTimers, openBreakTimer, openStopwatch, openFocusAudit, openPolls }) {
    this.openHelp = openHelp;
    this.openRequests = openRequests;
    this.openTimers = openTimers;
    this.openBreakTimer = openBreakTimer;
    this.openStopwatch = openStopwatch;
    this.openFocusAudit = openFocusAudit;
    this.openPolls = openPolls;
    this.renderSceneControls = this.renderSceneControls.bind(this);
  }

  registerControls() {
    Hooks.on("getSceneControlButtons", this.renderSceneControls);
  }

  renderSceneControls(controls) {
    const moderator = isModerator();
    const tools = Object.fromEntries(TOOL_DEFINITIONS.map((definition) => {
      const isRoot = definition.name === MENU_ROOT_TOOL;
      return [definition.name, {
        name: definition.name,
        title: localize(definition.titleKey),
        icon: definition.icon,
        order: definition.order,
        button: !isRoot,
        visible: isRoot ? false : moderator,
        onChange: definition.action ? this[definition.action] : () => {}
      }];
    }));

    const control = {
      name: MODULE_ID,
      title: localize("Controls.Title"),
      icon: "fa-solid fa-person-rays",
      order: 90,
      visible: moderator,
      activeTool: MENU_ROOT_TOOL,
      tools
    };

    if (!Array.isArray(controls)) {
      controls[MODULE_ID] = control;
      return;
    }

    controls.push({
      name: control.name,
      title: control.title,
      icon: control.icon,
      layer: ensureLegacyControlLayer(),
      visible: control.visible,
      activeTool: control.activeTool,
      tools: Object.values(control.tools).map((tool) => ({
        name: tool.name,
        title: tool.title,
        icon: tool.icon,
        visible: tool.visible,
        toggle: Boolean(tool.toggle),
        active: tool.name === control.activeTool,
        button: tool.button,
        onClick: tool.onChange
      }))
    });
  }
}
