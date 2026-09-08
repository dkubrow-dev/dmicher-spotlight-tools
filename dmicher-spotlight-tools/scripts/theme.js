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
    config: false,
    type: String,
    choices: {
      [THEME.dark]: i18nKey("Settings.Theme.Dark"),
      [THEME.light]: i18nKey("Settings.Theme.Light")
    },
    default: THEME.dark,
    requiresReload: false,
    onChange: () => applySpotlightTheme()
  });
  try {
    const saved = game.settings.storage.get("client").getItem(`${MODULE_ID}.${SETTINGS.theme}`);
    if (saved !== null && saved !== undefined) generics.appearance.adoptLegacyTheme(JSON.parse(saved), 30);
  } catch (_error) { /* Unavailable or invalid legacy storage leaves the common default intact. */ }
}

export function getThemedWindowClasses(...classes) {
  return windowTheme.classes(...classes);
}

export function getCurrentTheme() {
  try {
    return generics.appearance.getTheme();
  } catch (_error) {
    return THEME.dark;
  }
}

export function applySpotlightTheme() {
  windowTheme.apply(getCurrentTheme());
}

export function normalizeTheme(value) {
  return generics.theme.normalizeTheme(value);
}

export function moveThemeSettingFirst(application, html) {
  return generics.windows.moveSettingFirst(application, html, { moduleId: MODULE_ID, settingKey: SETTINGS.theme });
}
