import assert from "node:assert/strict";
import test from "node:test";

class MockElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.lastElementChild = null;
    this.afterNode = null;
    this.value = "";
    this.textContent = "";
    this.className = "";
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name)
    };
  }

  querySelector() {
    return null;
  }

  querySelectorAll() { return []; }

  append(...children) {
    this.children.push(...children);
    this.lastElementChild = children.at(-1) ?? this.lastElementChild;
  }

  after(node) {
    this.afterNode = node;
  }

  setAttribute(key, value) {
    this.attributes.set(key, value);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

class MockRangePicker extends MockElement {
  static create(config) {
    const picker = new MockRangePicker("range-picker");
    picker.value = Number(config.value);
    Object.assign(picker.dataset, config.dataset);
    picker.setAttribute("aria-label", config.aria.label);
    picker.setAttribute("aria-valuetext", config.aria.valuetext);
    picker.config = config;
    return picker;
  }
}

globalThis.HTMLElement = MockElement;
globalThis.document = { createElement: (tag) => new MockElement(tag) };
globalThis.foundry = {
  applications: {
    elements: { HTMLRangePickerElement: MockRangePicker }
  },
  audio: {
    AudioHelper: {
      volumeToInput: (value) => value,
      inputToVolume: (value) => Number(value),
      volumeToPercentage: (value) => `${Math.round(Number(value) * 100)}%`,
      play: async (data) => data
    }
  }
};

const { RequestVolumeController } = await import("../dmicher-spotlight-tools/scripts/tools/requests/request-volume.js");

for (const generation of [12, 13, 14]) {
  test(`v${generation} injects Requests and Timers volume sliders in playlist controls`, async () => {
    const saved = new Map();
    const interfaceRow = new MockElement("li");
    const list = new MockElement("ol");
    list.lastElementChild = interfaceRow;
    list.querySelector = () => null;
    const root = new MockElement();
    root.querySelector = (selector) => {
      if (selector === "[data-dmicher-request-volume]") return null;
      if (selector === "[data-dmicher-timer-volume]") return null;
      if (generation === 12 && selector === "#global-volume .playlist-sounds") return list;
      if (generation >= 13 && selector === ".global-volume .wrapper ol") return list;
      return null;
    };

    globalThis.game = {
      release: { generation },
      settings: {
        get: (_namespace, key) => key === "timerVolume" ? 0.35 : 0.6,
        set: async (_namespace, key, value) => {
          saved.set(key, value);
        }
      },
      i18n: { localize: (key) => key }
    };

    const controller = new RequestVolumeController();
    controller.renderPlaylistDirectory({}, root);
    const requestRow = interfaceRow.afterNode;
    const timerRow = requestRow?.afterNode;
    assert.ok(requestRow);
    assert.ok(timerRow);
    assert.equal(requestRow.dataset.dmicherRequestVolume, "");
    assert.equal(timerRow.dataset.dmicherTimerVolume, "");

    for (const [row, kind, expected, hint] of [
      [requestRow, "request", 0.6, "DMICHERSPOTLIGHTTOOLS.Requests.Volume.Hint"],
      [timerRow, "timer", 0.35, "DMICHERSPOTLIGHTTOOLS.Timers.Volume.Hint"]
    ]) {
      assert.equal(row.children.length, 3);
      assert.equal(row.className.includes("flexrow"), true);
      assert.equal(row.className.includes("sound"), generation === 12);
      const [label, icon, slider] = row.children;
      assert.equal(label.tagName, generation === 12 ? "H4" : "LABEL");
      assert.equal(icon.tagName, "I");
      assert.equal(icon.className.includes("volume-icon"), true);
      assert.equal(icon.dataset.tooltip, hint);
      assert.equal(slider.tagName, generation === 12 ? "INPUT" : "RANGE-PICKER");
      assert.equal(slider.classList.contains(`dmicher-${kind}-volume-slider`), true);
      if (generation === 12) assert.equal(slider.type, "range");
      assert.equal(Number(slider.value), expected);
      assert.equal(slider.dataset.tooltip, `${Math.round(expected * 100)}%`);
      slider.value = generation === 12 ? "0.25" : 0.25;
      slider.listeners.get("change")();
    }
    await Promise.resolve();
    assert.equal(saved.get("requestVolume"), 0.25);
    assert.equal(saved.get("timerVolume"), 0.25);
    assert.deepEqual(controller.getDebugCompatibility(), { generation, strategy: "dom-injection" });
  });
}

test("request and timer playback multiply their configured volume levels", async () => {
  let played = null;
  foundry.audio.AudioHelper.play = async (data) => {
    played = data;
    return data;
  };
  globalThis.game = {
    release: { generation: 14 },
    settings: {
      get: (_namespace, key) => key === "timerVolume" ? 0.25 : 0.4
    },
    i18n: { localize: (key) => key }
  };
  const controller = new RequestVolumeController();
  await controller.play("request.ogg", 0.5);
  assert.equal(played.volume, 0.2);
  await controller.playTimer("timer.ogg", 0.8, 0.5);
  assert.equal(played.volume, 0.1);
});
