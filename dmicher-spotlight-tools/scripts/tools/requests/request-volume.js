import { MODULE_ID, SETTINGS } from "../../config.js";
import {
  getFoundryGeneration,
  getRenderedElement,
  getUserSettingScope,
  i18nKey,
  localize,
  playAudio,
  runAfterApplicationLifecycle
} from "../../utils.js";
import { clampVolume } from "./request-config.js";

const VOLUME_ROWS = Object.freeze([
  Object.freeze({
    kind: "request",
    setting: SETTINGS.requestVolume,
    labelKey: "Requests.Volume.Label",
    hintKey: "Requests.Volume.Hint"
  }),
  Object.freeze({
    kind: "timer",
    setting: SETTINGS.timerVolume,
    labelKey: "Timers.Volume.Label",
    hintKey: "Timers.Volume.Hint"
  })
]);

export class RequestVolumeController {
  constructor() {
    this.renderPlaylistDirectory = this.renderPlaylistDirectory.bind(this);
  }

  registerSetting() {
    for (const definition of VOLUME_ROWS) {
      game.settings.register(MODULE_ID, definition.setting, {
        name: i18nKey(definition.labelKey),
        hint: i18nKey(definition.hintKey),
        scope: getUserSettingScope(),
        config: false,
        type: Number,
        default: 1
      });
    }
  }

  registerHooks() {
    Hooks.on("renderPlaylistDirectory", this.renderPlaylistDirectory);
    Hooks.on("renderPlaylistDirectoryHTML", this.renderPlaylistDirectory);
  }

  renderPlaylistDirectory(application, html) {
    const result = undefined;
    return runAfterApplicationLifecycle(result, () => {
      const root = getRenderedElement(html) ?? application?.element;
      if (!root) return;
      const list = root.querySelector("#global-volume .playlist-sounds")
        ?? root.querySelector(".global-volume .wrapper ol")
        ?? root.querySelector(".global-volume ol");
      if (!list) return;

      const interfaceRow = list.querySelector('[data-tooltip-direction="LEFT"]')?.closest("li")
        ?? list.lastElementChild;
      let previousRow = interfaceRow;
      for (const definition of VOLUME_ROWS) {
        const selector = `[data-dmicher-${definition.kind}-volume]`;
        let row = root.querySelector(selector);
        if (!row) {
          row = this.createVolumeRow(definition);
          if (previousRow?.after) previousRow.after(row);
          else list.append(row);
        }
        previousRow = row;
      }
    });
  }

  createVolumeRow(definition) {
    const generation = getFoundryGeneration();
    const labelText = localize(definition.labelKey);
    const hintText = localize(definition.hintKey);
    const inputValue = this.volumeToInput(this.getSettingVolume(definition.setting));
    const row = document.createElement("li");
    row.className = generation >= 13
      ? "flexrow dmicher-request-volume dmicher-module-volume"
      : "sound flexrow dmicher-request-volume dmicher-module-volume";
    row.dataset[`dmicher${capitalize(definition.kind)}Volume`] = "";
    row.dataset.tooltip = i18nKey(definition.hintKey);

    const label = document.createElement(generation >= 13 ? "label" : "h4");
    const sliderId = `dmicher-${definition.kind}-volume-slider`;
    label.setAttribute("for", sliderId);
    label.textContent = labelText;

    const icon = document.createElement("i");
    icon.className = generation >= 13
      ? "volume-icon fa-fw fa-solid fa-volume-low"
      : "volume-icon fas fa-volume-down";
    icon.dataset.tooltip = i18nKey(definition.hintKey);
    icon.setAttribute("aria-label", hintText);

    const RangePicker = foundry.applications?.elements?.HTMLRangePickerElement;
    const slider = generation >= 13 && typeof RangePicker?.create === "function"
      ? RangePicker.create({
        name: `${MODULE_ID}.${definition.setting}`,
        value: inputValue,
        min: 0,
        max: 1,
        step: 0.05,
        dataset: { tooltip: this.volumeToPercentage(inputValue) },
        aria: { label: labelText, valuetext: this.volumeToPercentage(inputValue) }
      })
      : document.createElement("input");
    slider.id = sliderId;
    slider.classList.add(`dmicher-${definition.kind}-volume-slider`);
    if (slider.tagName?.toLowerCase() === "input") {
      slider.type = "range";
      slider.min = "0";
      slider.max = "1";
      slider.step = "0.05";
      slider.value = String(inputValue);
    }
    slider.setAttribute("aria-label", labelText);

    const updateTooltip = () => {
      const tooltip = this.volumeToPercentage(slider.value);
      slider.dataset.tooltip = tooltip;
      slider.dataset.tooltipText = tooltip;
      slider.setAttribute("aria-valuetext", tooltip);
    };
    updateTooltip();
    slider.addEventListener("input", updateTooltip);
    slider.addEventListener("change", () => {
      updateTooltip();
      void game.settings.set(MODULE_ID, definition.setting, this.inputToVolume(slider.value));
    });
    row.append(label, icon, slider);
    return row;
  }

  getSettingVolume(setting) {
    return clampVolume(game.settings.get(MODULE_ID, setting));
  }

  getVolume() {
    return this.getSettingVolume(SETTINGS.requestVolume);
  }

  getTimerVolume() {
    return this.getSettingVolume(SETTINGS.timerVolume);
  }

  async play(src, baseVolume = 1) {
    return this.playWithVolume(src, clampVolume(baseVolume) * this.getVolume());
  }

  async playTimer(src, baseVolume = 1, launchVolume = 1) {
    return this.playWithVolume(
      src,
      clampVolume(baseVolume) * clampVolume(launchVolume) * this.getTimerVolume()
    );
  }

  async playWithVolume(src, volume) {
    if (!src || volume <= 0) return null;
    return playAudio(src, { broadcast: false, volume });
  }

  volumeToInput(volume) {
    const helper = foundry.audio?.AudioHelper;
    if (typeof helper?.volumeToInput === "function") return helper.volumeToInput(clampVolume(volume));
    return clampVolume(volume);
  }

  inputToVolume(input) {
    const helper = foundry.audio?.AudioHelper;
    if (typeof helper?.inputToVolume === "function") return clampVolume(helper.inputToVolume(Number(input)));
    return clampVolume(input);
  }

  volumeToPercentage(input) {
    const helper = foundry.audio?.AudioHelper;
    if (typeof helper?.volumeToPercentage === "function") return helper.volumeToPercentage(Number(input));
    return `${Math.round(this.inputToVolume(input) * 100)}%`;
  }

  getDebugCompatibility() {
    return {
      generation: getFoundryGeneration(),
      strategy: "dom-injection"
    };
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
