export const MODULE_ID = "dmicher-tools";
export const I18N_PREFIX = "DMICHERTOOLS";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const CHAT_MACRO_COMMAND = "/dmicher-tools-request";
export const SPEECH_GRANTED_SOUND = `modules/${MODULE_ID}/assets/requests/next-request.ogg`;

export const FLAGS = Object.freeze({
  request: "request",
  resolution: "resolution",
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
