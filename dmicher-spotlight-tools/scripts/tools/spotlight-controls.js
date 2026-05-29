import { MODULE_ID } from "../config.js";
import { isModerator, localize } from "../utils.js";

const MENU_ROOT_TOOL = "spotlight-tools-root";

export class SpotlightControls {
  constructor({ openRequests, openTimers, openBreakTimer, openStopwatch, openFocusAudit, openReadiness }) {
    this.openRequests = openRequests;
    this.openTimers = openTimers;
    this.openBreakTimer = openBreakTimer;
    this.openStopwatch = openStopwatch;
    this.openFocusAudit = openFocusAudit;
    this.openReadiness = openReadiness;
    this.renderSceneControls = this.renderSceneControls.bind(this);
  }

  registerControls() {
    Hooks.on("getSceneControlButtons", this.renderSceneControls);
  }

  renderSceneControls(controls) {
    controls[MODULE_ID] = {
      name: MODULE_ID,
      title: localize("Controls.Title"),
      icon: "fa-solid fa-person-rays",
      order: 90,
      visible: isModerator(),
      activeTool: MENU_ROOT_TOOL,
      tools: {
        [MENU_ROOT_TOOL]: {
          name: MENU_ROOT_TOOL,
          title: localize("Controls.Title"),
          icon: "fa-solid fa-person-rays",
          order: -1,
          button: false,
          visible: false,
          onChange: () => {}
        },
        requests: {
          name: "requests",
          title: localize("Controls.Requests"),
          icon: "fa-solid fa-hand",
          order: 10,
          button: true,
          visible: isModerator(),
          onChange: this.openRequests
        },
        readiness: {
          name: "readiness",
          title: localize("Controls.Readiness"),
          icon: "fa-solid fa-clipboard-check",
          order: 20,
          button: true,
          visible: isModerator(),
          onChange: this.openReadiness
        },
        break: {
          name: "break",
          title: localize("Controls.Break"),
          icon: "fa-solid fa-mug-saucer",
          order: 30,
          button: true,
          visible: isModerator(),
          onChange: this.openBreakTimer
        },
        timers: {
          name: "timers",
          title: localize("Controls.Timers"),
          icon: "fa-solid fa-hourglass-half",
          order: 40,
          button: true,
          visible: isModerator(),
          onChange: this.openTimers
        },
        stopwatch: {
          name: "stopwatch",
          title: localize("Controls.Stopwatch"),
          icon: "fa-solid fa-stopwatch",
          order: 50,
          button: true,
          visible: isModerator(),
          onChange: this.openStopwatch
        },
        focusAudit: {
          name: "focusAudit",
          title: localize("Controls.FocusAudit"),
          icon: "fa-solid fa-chart-simple",
          order: 60,
          button: true,
          visible: isModerator(),
          onChange: this.openFocusAudit
        }
      }
    };
  }
}
