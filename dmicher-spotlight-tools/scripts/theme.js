import { MODULE_ID, SETTINGS, THEME } from "./config.js";
import { getRenderedElement, i18nKey } from "./utils.js";

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
  Hooks.on("renderSettingsConfig", moveThemeSettingFirst);
  Hooks.on("renderSettingsConfigHTML", moveThemeSettingFirst);
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

export function moveThemeSettingFirst(application, html) {
  const root = getRenderedElement(html) ?? application?.element;
  if (!root?.querySelector) return;
  const settingId = `${MODULE_ID}.${SETTINGS.theme}`;
  const input = root.querySelector(`[name="${settingId}"]`);
  const row = root.querySelector(`[data-setting-id="${settingId}"]`) ?? input?.closest?.(".form-group");
  const category = row?.closest?.(`[data-category="${MODULE_ID}"]`) ?? row?.parentElement;
  if (!category) return;
  const firstEntry = Array.from(category.children).find((child) => child.matches?.(".form-group"));
  if (firstEntry && firstEntry !== row) category.insertBefore(row, firstEntry);
}
