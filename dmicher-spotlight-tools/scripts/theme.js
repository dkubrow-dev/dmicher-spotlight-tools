import { MODULE_ID, SETTINGS, THEME } from "./config.js";
import { i18nKey } from "./utils.js";

export const SPOTLIGHT_WINDOW_CLASS = "dmicher-spotlight-window";

export function registerThemeSetting() {
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
}

export function getThemedWindowClasses(...classes) {
  return [SPOTLIGHT_WINDOW_CLASS, ...classes];
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
}

export function normalizeTheme(value) {
  return Object.values(THEME).includes(value) ? value : THEME.dark;
}
