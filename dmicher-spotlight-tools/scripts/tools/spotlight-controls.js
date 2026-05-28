import { MODULE_ID } from "../config.js";
import { isModerator, localize } from "../utils.js";

const MENU_ROOT_TOOL = "spotlight-tools-root";

export class SpotlightControls {
  constructor({ openRequests, openTimers, openBreakTimer, openStopwatch }) {
    this.openRequests = openRequests;
    this.openTimers = openTimers;
    this.openBreakTimer = openBreakTimer;
    this.openStopwatch = openStopwatch;
    this.renderSceneControls = this.renderSceneControls.bind(this);
  }

  registerControls() {
    Hooks.on("getSceneControlButtons", this.renderSceneControls);
  }

  renderSceneControls(controls) {
    controls[MODULE_ID] = {
      name: MODULE_ID,
      title: localize("Controls.Title"),
      icon: "fa-solid fa-bullseye",
      order: 90,
      visible: isModerator(),
      activeTool: MENU_ROOT_TOOL,
      tools: {
        [MENU_ROOT_TOOL]: {
          name: MENU_ROOT_TOOL,
          title: localize("Controls.Title"),
          icon: "fa-solid fa-bullseye",
          order: -1,
          button: false,
          visible: false,
          onChange: () => {}
        },
        requests: {
          name: "requests",
          title: localize("Controls.Requests"),
          icon: "fa-solid fa-hand",
          order: 5,
          button: true,
          visible: isModerator(),
          onChange: this.openRequests
        },
        timers: {
          name: "timers",
          title: localize("Controls.Timers"),
          icon: "fa-solid fa-hourglass-half",
          order: 10,
          button: true,
          visible: isModerator(),
          onChange: this.openTimers
        },
        break: {
          name: "break",
          title: localize("Controls.Break"),
          icon: "fa-solid fa-mug-saucer",
          order: 20,
          button: true,
          visible: isModerator(),
          onChange: this.openBreakTimer
        },
        stopwatch: {
          name: "stopwatch",
          title: localize("Controls.Stopwatch"),
          icon: "fa-solid fa-stopwatch",
          order: 30,
          button: true,
          visible: isModerator(),
          onChange: this.openStopwatch
        }
      }
    };
  }
}
