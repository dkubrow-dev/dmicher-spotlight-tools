import { MODULE_ID, SETTINGS, THEME } from "./config.js";
import { i18nKey } from "./utils.js";
import { generics } from "./generics.js";

export const SPOTLIGHT_WINDOW_CLASS = "dmicher-spotlight-window";
const windowTheme = generics.theme.createWindowThemeController({
  windowClass: SPOTLIGHT_WINDOW_CLASS,
  getTheme: getCurrentTheme
});

export function registerThemeSetting() {
  windowTheme.install();
  game.settings.register(MODULE_ID, SETTINGS.theme, {
    name: i18nKey("Settings.Theme.Name"),
    hint: i18nKey("Settings.Theme.Hint"),
    scope: "client",
    config: true,
    type: String,
    choices: {
      [THEME.dark]: i18nKey("Settings.Theme.Dark"),
      [THEME.light]: i18nKey("Settings.Theme.Light")
    },
    default: THEME.dark,
    requiresReload: false,
    onChange: (value) => applySpotlightTheme(value)
  });
  Hooks.on("renderSettingsConfig", moveThemeSettingFirst);
  Hooks.on("renderSettingsConfigHTML", moveThemeSettingFirst);
}

export function getThemedWindowClasses(...classes) {
  return windowTheme.classes(...classes);
}

export function getCurrentTheme() {
  try {
    return normalizeTheme(game.settings.get(MODULE_ID, SETTINGS.theme));
  } catch (_error) {
    return THEME.dark;
  }
}

export function applySpotlightTheme(value = getCurrentTheme()) {
  const theme = normalizeTheme(value);
  document.documentElement?.setAttribute("data-dmicher-spotlight-theme", theme);
  document.body?.setAttribute("data-dmicher-spotlight-theme", theme);
  windowTheme.apply(theme);
}

export function normalizeTheme(value) {
  return generics.theme.normalizeTheme(value);
}

export function moveThemeSettingFirst(application, html) {
  return generics.windows.moveSettingFirst(application, html, { moduleId: MODULE_ID, settingKey: SETTINGS.theme });
}
