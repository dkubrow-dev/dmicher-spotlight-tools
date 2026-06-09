import { I18N_PREFIX } from "../../config.js";
import { TIMER_SOUND } from "../timers/timer-utils.js";

export const POLL_DEFAULTS_VERSION = 1;
export const POLL_MAX_BUTTON_OPTIONS = 4;
export const POLL_MAX_TABLE_OPTIONS = 12;
export const POLL_MAX_TEXT_LENGTH = 500;
export const POLL_DEFAULT_TIMER_MINUTES = 1;
export const POLL_MAX_TIMER_MINUTES = 180;

export const POLL_TYPE = Object.freeze({
  buttons: "buttons",
  radio: "radio",
  checkbox: "checkbox",
  text: "text"
});

export const POLL_PRESET = Object.freeze({
  custom: "custom",
  readiness: "readiness",
  bestPlayer: "bestPlayer"
});

export const POLL_RESPONSE_STATUS = Object.freeze({
  pending: "pending",
  answered: "answered",
  cancelled: "cancelled",
  noAnswer: "noAnswer"
});

export const POLL_TYPE_CONFIG = Object.freeze({
  [POLL_TYPE.buttons]: Object.freeze({
    labelKey: "Polls.Types.Buttons",
    usesOptions: true,
    maxOptions: POLL_MAX_BUTTON_OPTIONS
  }),
  [POLL_TYPE.radio]: Object.freeze({
    labelKey: "Polls.Types.Radio",
    usesOptions: true,
    maxOptions: POLL_MAX_TABLE_OPTIONS
  }),
  [POLL_TYPE.checkbox]: Object.freeze({
    labelKey: "Polls.Types.Checkbox",
    usesOptions: true,
    maxOptions: POLL_MAX_TABLE_OPTIONS
  }),
  [POLL_TYPE.text]: Object.freeze({
    labelKey: "Polls.Types.Text",
    usesOptions: false,
    maxOptions: 0
  })
});

export const POLL_RESPONSE_STATUS_CONFIG = Object.freeze({
  [POLL_RESPONSE_STATUS.pending]: Object.freeze({
    labelKey: "Polls.Status.Pending",
    indicator: "doubt"
  }),
  [POLL_RESPONSE_STATUS.answered]: Object.freeze({
    labelKey: "Polls.Status.Answered",
    indicator: "good"
  }),
  [POLL_RESPONSE_STATUS.cancelled]: Object.freeze({
    labelKey: "Polls.Status.Cancelled",
    indicator: "muted"
  }),
  [POLL_RESPONSE_STATUS.noAnswer]: Object.freeze({
    labelKey: "Polls.Status.NoAnswer",
    indicator: "muted"
  })
});

const MAX_TEMPLATE_NAME_LENGTH = 120;
const MAX_TEMPLATE_QUESTION_LENGTH = 240;
const MAX_OPTION_LABEL_LENGTH = 80;

function safeI18nKey(key) {
  return `${I18N_PREFIX}.${key}`;
}

function safeLocalize(key, fallback) {
  const fullKey = safeI18nKey(key);
  try {
    const value = game?.i18n?.localize(fullKey);
    return value && value !== fullKey ? value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function safeFormat(key, data, fallback) {
  const fullKey = safeI18nKey(key);
  try {
    const value = game?.i18n?.format(fullKey, data);
    return value && value !== fullKey ? value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function randomId(prefix = "poll") {
  try {
    return foundry.utils.randomID();
  } catch (_error) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function trimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizePollTimerMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return POLL_DEFAULT_TIMER_MINUTES;
  return Math.max(1, Math.min(POLL_MAX_TIMER_MINUTES, Math.round(value)));
}

export function normalizePollTimerSound(sound) {
  return Object.values(TIMER_SOUND).includes(sound) ? sound : TIMER_SOUND.none;
}

export function normalizePollType(type) {
  return Object.hasOwn(POLL_TYPE_CONFIG, type) ? type : POLL_TYPE.buttons;
}

export function normalizePollPreset(preset) {
  return Object.values(POLL_PRESET).includes(preset) ? preset : POLL_PRESET.custom;
}

export function normalizePollResponseStatus(status) {
  return Object.hasOwn(POLL_RESPONSE_STATUS_CONFIG, status) ? status : POLL_RESPONSE_STATUS.pending;
}

export function pollTypeUsesOptions(type) {
  return Boolean(POLL_TYPE_CONFIG[normalizePollType(type)].usesOptions);
}

export function getPollTypeMaxOptions(type) {
  return POLL_TYPE_CONFIG[normalizePollType(type)].maxOptions;
}

export function createDefaultReadinessTemplate(now = Date.now()) {
  return {
    id: "readiness",
    preset: POLL_PRESET.readiness,
    name: safeLocalize("Polls.Presets.Readiness.Name", "Readiness Check"),
    question: safeLocalize("Polls.Presets.Readiness.Question", "Are you ready to continue?"),
    type: POLL_TYPE.buttons,
    options: [
      {
        id: "ready",
        label: safeLocalize("Polls.Presets.Readiness.Options.Ready", "Ready"),
        icon: "fa-solid fa-check",
        tone: "good",
        enabled: true
      },
      {
        id: "notReady",
        label: safeLocalize("Polls.Presets.Readiness.Options.NotReady", "Not ready"),
        icon: "fa-solid fa-xmark",
        tone: "bad",
        enabled: true
      }
    ],
    timerEnabled: false,
    timerMinutes: POLL_DEFAULT_TIMER_MINUTES,
    timerSound: TIMER_SOUND.none,
    createdAt: now,
    updatedAt: now
  };
}

export function getBestPlayerOptions() {
  let users = [];
  try {
    users = Array.from(game.users ?? []).filter((user) => {
      return Number(user?.role ?? 0) < Number(CONST.USER_ROLES.ASSISTANT);
    });
    if (!users.length) users = Array.from(game.users ?? []);
  } catch (_error) {
    users = [];
  }

  const options = users
    .filter((user) => user?.id && user?.name)
    .slice(0, POLL_MAX_TABLE_OPTIONS)
    .map((user) => ({
      id: String(user.id),
      label: String(user.name),
      enabled: true
    }));

  if (options.length) return options;
  return [
    {
      id: "player-1",
      label: safeFormat("Polls.DefaultOption", { number: 1 }, "Option 1"),
      enabled: true
    }
  ];
}

export function createDefaultBestPlayerTemplate(now = Date.now()) {
  return {
    id: "best-player",
    preset: POLL_PRESET.bestPlayer,
    name: safeLocalize("Polls.Presets.BestPlayer.Name", "Best Player"),
    question: safeLocalize("Polls.Presets.BestPlayer.Question", "Who was the best player today?"),
    type: POLL_TYPE.radio,
    options: getBestPlayerOptions(),
    timerEnabled: false,
    timerMinutes: POLL_DEFAULT_TIMER_MINUTES,
    timerSound: TIMER_SOUND.none,
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultPollTemplates(now = Date.now()) {
  return [
    createDefaultReadinessTemplate(now),
    createDefaultBestPlayerTemplate(now)
  ];
}

export function createEmptyPollState() {
  const state = {
    defaultsVersion: POLL_DEFAULTS_VERSION,
    selected: {},
    templates: {},
    activePoll: null,
    lastRuns: {}
  };

  for (const template of createDefaultPollTemplates()) {
    state.templates[template.id] = template;
  }

  return state;
}

export function normalizePollOptions(rawOptions, type) {
  type = normalizePollType(type);
  if (!pollTypeUsesOptions(type)) return [];

  const maxOptions = getPollTypeMaxOptions(type);
  const options = [];
  for (const rawOption of Array.isArray(rawOptions) ? rawOptions : []) {
    const option = rawOption && (typeof rawOption === "object") ? rawOption : {};
    const label = trimText(option.label, MAX_OPTION_LABEL_LENGTH);
    if (!label) continue;
    options.push({
      id: trimText(option.id, 80) || randomId("option"),
      label,
      icon: trimText(option.icon, 80),
      tone: trimText(option.tone, 20),
      enabled: option.enabled !== false
    });
    if (options.length >= maxOptions) break;
  }

  if (!options.length) {
    options.push({
      id: "option-1",
      label: safeFormat("Polls.DefaultOption", { number: 1 }, "Option 1"),
      icon: "",
      tone: "",
      enabled: true
    });
  }

  return options;
}

export function normalizePollTemplate(rawTemplate, fallbackId = "") {
  const template = rawTemplate && (typeof rawTemplate === "object") ? rawTemplate : {};
  const id = trimText(template.id || fallbackId || randomId("template"), 80);
  const type = normalizePollType(template.type);
  const name = trimText(template.name, MAX_TEMPLATE_NAME_LENGTH)
    || safeLocalize("Polls.Manager.Untitled", "Untitled poll");
  const question = trimText(template.question, MAX_TEMPLATE_QUESTION_LENGTH)
    || safeLocalize("Polls.Manager.DefaultQuestion", "Choose an answer.");

  return {
    id,
    preset: normalizePollPreset(template.preset),
    name,
    question,
    type,
    options: normalizePollOptions(template.options, type),
    timerEnabled: Boolean(template.timerEnabled),
    timerMinutes: normalizePollTimerMinutes(template.timerMinutes),
    timerSound: normalizePollTimerSound(template.timerSound),
    createdAt: Number(template.createdAt) || Date.now(),
    updatedAt: Number(template.updatedAt) || Date.now()
  };
}

export function createBlankPollTemplateDraft() {
  return {
    id: "",
    preset: POLL_PRESET.custom,
    name: "",
    question: "",
    type: POLL_TYPE.buttons,
    options: [
      {
      id: "option-1",
      label: safeFormat("Polls.DefaultOption", { number: 1 }, "Option 1"),
      icon: "",
      tone: "",
      enabled: true
      }
    ],
    timerEnabled: false,
    timerMinutes: POLL_DEFAULT_TIMER_MINUTES,
    timerSound: TIMER_SOUND.none,
    createdAt: 0,
    updatedAt: 0
  };
}

export function normalizePollResponseValue(type, value, options = []) {
  type = normalizePollType(type);
  const optionIds = new Set(options.map((option) => option.id));

  if (type === POLL_TYPE.text) {
    return trimText(value, POLL_MAX_TEXT_LENGTH);
  }

  if (type === POLL_TYPE.checkbox) {
    const values = Array.isArray(value) ? value : [];
    return Array.from(new Set(values.map((entry) => trimText(entry, 80))))
      .filter((entry) => optionIds.has(entry));
  }

  const optionId = trimText(value, 80);
  return optionIds.has(optionId) ? optionId : "";
}

export function normalizePollResponse(rawResponse, type, options = []) {
  const response = rawResponse && (typeof rawResponse === "object") ? rawResponse : {};
  const status = normalizePollResponseStatus(response.status);
  return {
    status,
    value: status === POLL_RESPONSE_STATUS.answered
      ? normalizePollResponseValue(type, response.value, options)
      : null,
    answeredAt: Number(response.answeredAt) || 0,
    messageId: trimText(response.messageId, 80),
    userName: trimText(response.userName, MAX_TEMPLATE_NAME_LENGTH)
  };
}

export function normalizePollRun(rawRun) {
  const run = rawRun && (typeof rawRun === "object") ? rawRun : null;
  if (!run) return null;

  const template = normalizePollTemplate({
    id: run.templateId || run.id,
    name: run.name,
    question: run.question,
    type: run.type,
    options: run.options
  });
  const id = trimText(run.id, 80);
  const templateId = trimText(run.templateId, 80);
  if (!id || !templateId) return null;

  const selected = {};
  for (const [userId, value] of Object.entries(run.selected ?? {})) {
    selected[userId] = Boolean(value);
  }

  const responses = {};
  for (const [userId, response] of Object.entries(run.responses ?? {})) {
    responses[userId] = normalizePollResponse(response, template.type, template.options);
  }

  for (const userId of Object.keys(selected)) {
    if (!selected[userId] || responses[userId]) continue;
    responses[userId] = normalizePollResponse(null, template.type, template.options);
  }

  return {
    id,
    templateId,
    name: template.name,
    question: template.question,
    type: template.type,
    options: template.options,
    selected,
    responses,
    requestedAt: Number(run.requestedAt) || Date.now(),
    requestedBy: trimText(run.requestedBy, 80),
    requestedByName: trimText(run.requestedByName, MAX_TEMPLATE_NAME_LENGTH),
    timerEnabled: Boolean(run.timerEnabled),
    timerMinutes: normalizePollTimerMinutes(run.timerMinutes),
    timerSound: normalizePollTimerSound(run.timerSound),
    timerId: trimText(run.timerId, 80),
    timerStartedAt: Number(run.timerStartedAt) || 0,
    timerEndsAt: Number(run.timerEndsAt) || 0,
    closed: Boolean(run.closed)
  };
}

export function normalizePollState(rawState) {
  const source = rawState && (typeof rawState === "object") ? rawState : {};
  const state = {
    defaultsVersion: Number(source.defaultsVersion) || 0,
    selected: {},
    templates: {},
    activePoll: normalizePollRun(source.activePoll),
    lastRuns: {}
  };

  for (const [userId, value] of Object.entries(source.selected ?? {})) {
    state.selected[userId] = Boolean(value);
  }

  for (const [templateId, rawTemplate] of Object.entries(source.templates ?? {})) {
    const template = normalizePollTemplate(rawTemplate, templateId);
    state.templates[template.id] = template;
  }

  if (state.defaultsVersion < POLL_DEFAULTS_VERSION) {
    for (const template of createDefaultPollTemplates()) {
      if (!state.templates[template.id]) state.templates[template.id] = template;
    }
    state.defaultsVersion = POLL_DEFAULTS_VERSION;
  }

  for (const [templateId, rawRun] of Object.entries(source.lastRuns ?? {})) {
    const run = normalizePollRun(rawRun);
    if (run) state.lastRuns[templateId] = run;
  }

  if (state.activePoll) state.lastRuns[state.activePoll.templateId] = foundry.utils.deepClone(state.activePoll);
  return state;
}

export function clonePollState(state) {
  return foundry.utils.deepClone(normalizePollState(state));
}

export function listPollTemplates(state) {
  return Object.values(normalizePollState(state).templates).sort((left, right) => {
    const leftUpdated = Number(left.updatedAt) || 0;
    const rightUpdated = Number(right.updatedAt) || 0;
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
    return left.name.localeCompare(right.name, game.i18n.lang);
  });
}

export function getPollOptionLabel(options, optionId) {
  return options.find((option) => option.id === optionId)?.label ?? "";
}

export function getPollOptionNumber(options, optionId) {
  const index = options.findIndex((option) => option.id === optionId);
  return index >= 0 ? index + 1 : 0;
}
