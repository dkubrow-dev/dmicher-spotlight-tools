export const MODULE_ID = "dmicher-spotlight-tools";
export const I18N_PREFIX = "DMICHERSPOTLIGHTTOOLS";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const CHAT_MACRO_COMMAND = "/dmicher-spotlight-tools-request";
export const STOPWATCH_CHAT_MACRO_COMMAND = "/dmicher-spotlight-tools-stopwatch";
export const SPEECH_GRANTED_SOUND = `modules/${MODULE_ID}/assets/requests/next-request.ogg`;
export const TIMER_SOUND_SOURCES = Object.freeze({
  signal1: `modules/${MODULE_ID}/assets/timers/ring1.ogg`,
  signal2: `modules/${MODULE_ID}/assets/timers/ring2.ogg`,
  signal3: `modules/${MODULE_ID}/assets/timers/ring3.ogg`
});
export const STOPWATCH_EVENTS = Object.freeze({
  sign1: Object.freeze({
    labelKey: "Timers.Stopwatch.Events.Sign1",
    image: `modules/${MODULE_ID}/assets/stopwatch/sign1.webp`
  }),
  sign2: Object.freeze({
    labelKey: "Timers.Stopwatch.Events.Sign2",
    image: `modules/${MODULE_ID}/assets/stopwatch/sign2.webp`
  }),
  sign3: Object.freeze({
    labelKey: "Timers.Stopwatch.Events.Sign3",
    image: `modules/${MODULE_ID}/assets/stopwatch/sign3.webp`
  }),
  sign4: Object.freeze({
    labelKey: "Timers.Stopwatch.Events.Sign4",
    image: `modules/${MODULE_ID}/assets/stopwatch/sign4.webp`
  })
});

export const SETTINGS = Object.freeze({
  timers: "timers",
  timerAlertedExpirations: "timerAlertedExpirations",
  focusAuditState: "focusAuditState",
  focusAuditThresholds: "focusAuditThresholds",
  readinessState: "readinessState"
});

export const FLAGS = Object.freeze({
  request: "request",
  resolution: "resolution",
  timer: "timer",
  stopwatchMacro: "stopwatchMacro",
  playerStatus: "playerStatus",
  readinessRequest: "readinessRequest",
  readinessResult: "readinessResult",
  macro: "requestMacro"
});

export const REQUEST_TYPES = Object.freeze({
  common: Object.freeze({
    labelKey: "Requests.Common.Label",
    typeLabelKey: "Requests.Common.Type",
    imageAltKey: "Requests.Common.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-common.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-common.ogg`,
    textSetting: "requestCommonText",
    styleSetting: "requestCommonStyle",
    defaultTextKey: "Requests.Common.DefaultText",
    defaultStyle: "text-align: center; font-size: 1.2em;"
  }),
  urgent: Object.freeze({
    labelKey: "Requests.Urgent.Label",
    typeLabelKey: "Requests.Urgent.Type",
    imageAltKey: "Requests.Urgent.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-urgent.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-urgent.ogg`,
    textSetting: "requestUrgentText",
    styleSetting: "requestUrgentStyle",
    defaultTextKey: "Requests.Urgent.DefaultText",
    defaultStyle: "text-align: center; color: #b4232d; font-size: 1.35em; font-weight: bold;"
  }),
  stop: Object.freeze({
    labelKey: "Requests.Stop.Label",
    typeLabelKey: "Requests.Stop.Type",
    imageAltKey: "Requests.Stop.ImageAlt",
    image: `modules/${MODULE_ID}/assets/requests/request-stop.webp`,
    sound: `modules/${MODULE_ID}/assets/requests/request-stop.ogg`,
    textSetting: "requestStopText",
    styleSetting: "requestStopStyle",
    defaultTextKey: "Requests.Stop.DefaultText",
    defaultStyle: "text-align: center; color: #5b3a12; font-size: 1.2em; font-weight: bold;",
    moderatorOnly: true
  })
});

export function normalizeRequestType(type) {
  return Object.hasOwn(REQUEST_TYPES, type) ? type : "common";
}
