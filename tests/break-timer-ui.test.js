import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

class MockApplicationV2 {
  constructor(options = {}) {
    this.options = options;
    this.element = null;
    this.closed = false;
  }

  async _prepareContext() {
    return {};
  }

  _onRender() {}

  _onClose() {}

  async close() {
    this.closed = true;
  }
}

globalThis.HTMLElement = class {};
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, data) => data?.time ? `${key}:${data.time}` : key
  }
};
globalThis.window = {
  setInterval: () => 1,
  clearInterval() {}
};
globalThis.ui = {
  notifications: {
    error() {}
  }
};

const {
  TIMER_MODE,
  calculateRoundedDeadline,
  formatHourMinuteInput,
  parseHourMinuteDeadline
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/timer-utils.js");
const {
  BreakTimerApplication
} = await import("../dmicher-spotlight-tools/scripts/tools/timers/break-timer.js");

function createApplication(timerTool = {}) {
  return new BreakTimerApplication({
    forgetBreakWindow() {},
    ...timerTool
  });
}

function createControl(properties = {}) {
  const listeners = new Map();
  return {
    checked: false,
    dataset: {},
    disabled: false,
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    ...properties
  };
}

function createElement({ radios = [], inputs = [], announceButton = null, output = null } = {}) {
  return {
    querySelectorAll(selector) {
      if (selector === "input[name='breakChoice']") return radios;
      if (selector === "[data-break-time-input]") return inputs;
      return [];
    },
    querySelector(selector) {
      if (selector === "input[name='breakChoice']:checked") return radios.find((radio) => radio.checked) ?? null;
      if (selector === "[data-break-action='announce']") return announceButton;
      if (selector === "[data-break-deadline]") return output;
      return null;
    }
  };
}

test("break window defaults to the 15-minute preset and keeps both custom defaults", async () => {
  const originalNow = Date.now;
  const now = new Date(2026, 7, 11, 10, 15, 23, 456).getTime();
  Date.now = () => now;

  try {
    const app = createApplication();
    const context = await app._prepareContext({});
    assert.equal(app.selectedChoice, "15");
    assert.deepEqual(context.options.map((option) => option.minutes), [5, 10, 15, 20, 30]);
    assert.deepEqual(context.options.map((option) => option.checked), [false, false, true, false, false]);
    assert.equal(
      app.deadlineInputValue,
      formatHourMinuteInput(calculateRoundedDeadline(15, now))
    );
    assert.equal(app.durationInputValue, "00:15");
    assert.deepEqual(app.getLaunchDescriptor(now), {
      mode: TIMER_MODE.deadline,
      roundedDurationMinutes: 15
    });
  } finally {
    Date.now = originalNow;
  }
});

test("break window builds strict deadline and duration descriptors", () => {
  const now = new Date(2026, 7, 11, 10, 15, 23, 456).getTime();
  const deadlineDate = new Date(now);
  deadlineDate.setHours(11, 45, 0, 0);
  const deadlineInput = formatHourMinuteInput(deadlineDate.getTime());
  const app = createApplication();

  app.selectedChoice = "deadline";
  app.deadlineInputValue = deadlineInput;
  assert.deepEqual(app.getLaunchDescriptor(now), {
    mode: TIMER_MODE.deadline,
    deadlineTimestamp: parseHourMinuteDeadline(deadlineInput, now)
  });

  app.selectedChoice = "duration";
  app.durationInputValue = "01:05";
  assert.deepEqual(app.getLaunchDescriptor(now), {
    mode: TIMER_MODE.duration,
    durationMilliseconds: 65 * 60 * 1000
  });

  app.deadlineInputValue = "24:00";
  app.selectedChoice = "deadline";
  assert.throws(() => app.getLaunchDescriptor(now), /Timers\.Break\.BadDeadline/);

  app.durationInputValue = "00:00";
  app.selectedChoice = "duration";
  assert.throws(() => app.getLaunchDescriptor(now), /Timers\.Break\.BadDuration/);
});

test("custom values survive preview refreshes", () => {
  const now = new Date(2026, 7, 11, 10, 15, 23, 456).getTime();
  const output = { textContent: "" };
  const app = createApplication();
  app.element = createElement({ output });
  app.selectedChoice = "duration";
  app.deadlineInputValue = "21:34";
  app.durationInputValue = "00:42";

  app.refreshDeadline(now);

  assert.equal(app.deadlineInputValue, "21:34");
  assert.equal(app.durationInputValue, "00:42");
  assert.equal(app.deadlineTimestamp, now + (42 * 60 * 1000));
  assert.match(output.textContent, /DMICHERSPOTLIGHTTOOLS\.Timers\.Break\.Until/);
});

test("only the selected custom input is enabled", () => {
  const presetRadio = createControl({ checked: true, value: "15" });
  const deadlineRadio = createControl({ value: "deadline" });
  const durationRadio = createControl({ value: "duration" });
  const deadlineInput = createControl({
    dataset: { breakTimeInput: "deadline" },
    value: "12:30"
  });
  const durationInput = createControl({
    dataset: { breakTimeInput: "duration" },
    value: "00:15"
  });
  const app = createApplication();
  app.element = createElement({
    radios: [presetRadio, deadlineRadio, durationRadio],
    inputs: [deadlineInput, durationInput],
    output: { textContent: "" }
  });
  app.activateListeners();

  assert.equal(deadlineInput.disabled, true);
  assert.equal(durationInput.disabled, true);

  presetRadio.checked = false;
  deadlineRadio.checked = true;
  deadlineRadio.dispatch("change");
  assert.equal(deadlineInput.disabled, false);
  assert.equal(durationInput.disabled, true);

  deadlineInput.value = "13:45";
  deadlineInput.dispatch("input");
  assert.equal(app.deadlineInputValue, "13:45");

  deadlineRadio.checked = false;
  durationRadio.checked = true;
  durationRadio.dispatch("change");
  assert.equal(deadlineInput.disabled, true);
  assert.equal(durationInput.disabled, false);
});

test("announce passes a descriptor and calculated-deadline callback to TimerTool", async () => {
  let received = null;
  const announceButton = createControl();
  const durationRadio = createControl({ checked: true, value: "duration" });
  const deadlineInput = createControl({
    dataset: { breakTimeInput: "deadline" },
    value: "12:30"
  });
  const durationInput = createControl({
    dataset: { breakTimeInput: "duration" },
    value: "00:25"
  });
  const output = { textContent: "" };
  const app = createApplication({
    async startBreakTimer(descriptor, options) {
      received = { descriptor, options };
      options.onDeadlineCalculated(123456789);
    }
  });
  app.element = createElement({
    radios: [durationRadio],
    inputs: [deadlineInput, durationInput],
    announceButton,
    output
  });

  await app.announceBreak();

  assert.deepEqual(received.descriptor, {
    mode: TIMER_MODE.duration,
    durationMilliseconds: 25 * 60 * 1000
  });
  assert.equal(typeof received.options.onDeadlineCalculated, "function");
  assert.equal(app.deadlineTimestamp, 123456789);
  assert.equal(app.closed, true);
});

test("invalid custom input is rejected before TimerTool is called", async () => {
  let starts = 0;
  let notification = "";
  const originalConsoleError = console.error;
  const originalNotify = ui.notifications.error;
  console.error = () => undefined;
  ui.notifications.error = (message) => {
    notification = message;
  };

  const announceButton = createControl();
  const durationRadio = createControl({ checked: true, value: "duration" });
  const durationInput = createControl({
    dataset: { breakTimeInput: "duration" },
    value: "00:00"
  });
  const app = createApplication({
    async startBreakTimer() {
      starts += 1;
    }
  });
  app.element = createElement({
    radios: [durationRadio],
    inputs: [durationInput],
    announceButton,
    output: { textContent: "" }
  });

  try {
    await app.announceBreak();
  } finally {
    console.error = originalConsoleError;
    ui.notifications.error = originalNotify;
  }

  assert.equal(starts, 0);
  assert.match(notification, /Timers\.Break\.BadDuration/);
  assert.equal(announceButton.disabled, false);
  assert.equal(app.closed, false);
});

test("break template keeps presets and exposes two compact HH:MM inputs", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const template = fs.readFileSync(path.join(
    root,
    "dmicher-spotlight-tools",
    "templates",
    "timers",
    "break-timer.hbs"
  ), "utf8");

  assert.match(template, /name="breakChoice" value="\{\{minutes\}\}"/);
  assert.match(template, /class="dmicher-break-custom-row"/);
  assert.match(template, /name="breakChoice" value="deadline"/);
  assert.match(template, /name="breakChoice" value="duration"/);
  assert.equal((template.match(/class="dmicher-break-time-input"/g) ?? []).length, 2);
  assert.equal((template.match(/maxlength="5"/g) ?? []).length, 2);
  assert.equal((template.match(/inputmode="numeric"/g) ?? []).length, 2);
  assert.equal((template.match(/data-break-time-input=/g) ?? []).length, 2);
  assert.equal((template.match(/disabled\{\{\/unless\}\}/g) ?? []).length, 2);
});
