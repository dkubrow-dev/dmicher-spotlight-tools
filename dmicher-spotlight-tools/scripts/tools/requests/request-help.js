import { MODULE_ID } from "../../config.js";
import { generics } from "../../generics.js";
import { getThemedWindowClasses } from "../../theme.js";
import { buildSpotlightHelp, getSettingHelpEntries } from "./request-help-content.js";
import { i18nKey, localize } from "../../utils.js";

let helpWindow;

export const RequestHelpApplication = generics.help.createHelpApplication({
  id: "dmicher-spotlight-tools-request-help",
  title: () => localize("Requests.Help.WindowTitle"),
  classes: getThemedWindowClasses(),
  initialPageId: "overview",
  getContent: () => buildSpotlightHelp({ language: game.i18n.lang, localize })
});

export function registerRequestHelp() {
  game.settings.registerMenu(MODULE_ID, "requestsHelp", {
    name: i18nKey("Requests.Help.MenuName"), label: i18nKey("Requests.Help.MenuLabel"),
    hint: i18nKey("Requests.Help.MenuHint"), icon: "fa-solid fa-circle-question",
    type: RequestHelpApplication, restricted: false
  });
}

export function openRequestHelp(pageId = "overview", anchor) {
  helpWindow ??= new RequestHelpApplication();
  void helpWindow.navigate(typeof pageId === "string" ? pageId : "overview", anchor);
  return helpWindow;
}

export function bindSpotlightSettingHelp(root) {
  return generics.help.bindSettingHelp(root, { open: openRequestHelp, entries: getSettingHelpEntries(game.i18n.lang) });
}
