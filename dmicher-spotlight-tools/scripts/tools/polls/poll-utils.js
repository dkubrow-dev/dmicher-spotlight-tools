import { I18N_PREFIX } from "../../config.js";
import { parseDurationInput, TIMER_SOUND } from "../timers/timer-utils.js";

export const POLL_DEFAULTS_VERSION = 2;
export const POLL_MAX_BUTTON_OPTIONS = 4;
export const POLL_MAX_TABLE_OPTIONS = 12;
export const POLL_MAX_TEXT_LENGTH = 500;
export const POLL_DEFAULT_TIMER_TIME = "00:01:00";

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

function formatDurationSeconds(totalSeconds) {
  const seconds = Math.max(1, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const remainingSeconds = seconds % 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const lastSeconds = remainingSeconds % 60;
  return [hours, minutes, lastSeconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function timerMinutesToTime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return POLL_DEFAULT_TIMER_TIME;
  return formatDurationSeconds(value * 60);
}

function getPlayerUsers() {
  try {
    const assistantRole = Number(CONST?.USER_ROLES?.ASSISTANT ?? 3);
    const players = Array.from(game?.users ?? []).filter((user) => {
      return user?.id && user?.name && Number(user?.role ?? 0) < assistantRole;
    });
    if (players.length) return players;
    return Array.from(game?.users ?? []).filter((user) => user?.id && user?.name);
  } catch (_error) {
    return [];
  }
}

export function normalizePollTimerTime(value, fallbackValue = POLL_DEFAULT_TIMER_TIME) {
  const text = String(value ?? "").trim();
  if (parseDurationInput(text)) return text;

  const fallback = String(fallbackValue ?? "").trim();
  if (parseDurationInput(fallback)) return fallback;
  return POLL_DEFAULT_TIMER_TIME;
}

export function isPollTimerTimeValid(value) {
  return Boolean(parseDurationInput(String(value ?? "").trim()));
}

export function getPollTimerDurationMs(value) {
  return parseDurationInput(normalizePollTimerTime(value));
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

export function getDefaultPollParticipants() {
  const participants = {};
  for (const user of getPlayerUsers()) {
    participants[user.id] = true;
  }
  return participants;
}

export function normalizePollParticipants(rawParticipants, fallbackParticipants = null) {
  const source = rawParticipants && (typeof rawParticipants === "object")
    ? rawParticipants
    : fallbackParticipants && (typeof fallbackParticipants === "object")
      ? fallbackParticipants
      : getDefaultPollParticipants();

  const participants = {};
  for (const [userId, value] of Object.entries(source ?? {})) {
    const id = trimText(userId, 80);
    if (id && value !== false) participants[id] = true;
  }
  return participants;
}

function buildReadinessOptions(language) {
  const isRu = language === "ru";
  return [
    {
      id: "ready",
      label: isRu ? "Готов" : "Ready",
      icon: "fa-solid fa-check",
      enabled: true
    },
    {
      id: "notReady",
      label: isRu ? "Не готов" : "Not ready",
      icon: "fa-solid fa-xmark",
      enabled: true
    }
  ];
}

export function getBestPlayerOptions(fallbackLabel = "Player 1") {
  const options = getPlayerUsers()
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
      label: fallbackLabel,
      enabled: true
    }
  ];
}

function createStarterTemplate(config, index, now, { uniqueIds = false } = {}) {
  const timestamp = now + index;
  return {
    ...config,
    id: uniqueIds ? randomId("starter-poll") : config.id,
    options: foundry.utils.deepClone(config.options ?? []),
    participants: getDefaultPollParticipants(),
    timerEnabled: false,
    timerTime: POLL_DEFAULT_TIMER_TIME,
    timerSound: TIMER_SOUND.none,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createStarterPollTemplates(now = Date.now(), options = {}) {
  const configs = [
    {
      id: "readiness-ru",
      preset: POLL_PRESET.readiness,
      name: "Проверка готовности",
      question: "Вы готовы продолжить?",
      type: POLL_TYPE.buttons,
      options: buildReadinessOptions("ru")
    },
    {
      id: "best-player-ru",
      preset: POLL_PRESET.bestPlayer,
      name: "Лучший игрок",
      question: "Кто сегодня был лучшим игроком?",
      type: POLL_TYPE.radio,
      options: getBestPlayerOptions("Игрок 1")
    },
    {
      id: "readiness-en",
      preset: POLL_PRESET.readiness,
      name: "Readiness Check",
      question: "Are you ready to continue?",
      type: POLL_TYPE.buttons,
      options: buildReadinessOptions("en")
    },
    {
      id: "best-player-en",
      preset: POLL_PRESET.bestPlayer,
      name: "Best Player",
      question: "Who was the best player today?",
      type: POLL_TYPE.radio,
      options: getBestPlayerOptions("Player 1")
    }
  ];
  return configs.map((config, index) => createStarterTemplate(config, index, now, options));
}

export function createEmptyPollState() {
  return {
    defaultsVersion: 0,
    templates: {},
    activePoll: null,
    lastRuns: {}
  };
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
      enabled: option.enabled !== false
    });
    if (options.length >= maxOptions) break;
  }

  if (!options.length) {
    options.push({
      id: "option-1",
      label: safeFormat("Polls.DefaultOption", { number: 1 }, "Option 1"),
      icon: "",
      enabled: true
    });
  }

  return options;
}

export function normalizePollTemplate(rawTemplate, fallbackId = "", fallbackParticipants = null) {
  const template = rawTemplate && (typeof rawTemplate === "object") ? rawTemplate : {};
  const id = trimText(template.id || fallbackId || randomId("template"), 80);
  const type = normalizePollType(template.type);
  const name = trimText(template.name, MAX_TEMPLATE_NAME_LENGTH)
    || safeLocalize("Polls.Manager.Untitled", "Untitled poll");
  const question = trimText(template.question, MAX_TEMPLATE_QUESTION_LENGTH)
    || safeLocalize("Polls.Manager.DefaultQuestion", "Choose an answer.");
  const fallbackTimerTime = timerMinutesToTime(template.timerMinutes);

  return {
    id,
    preset: normalizePollPreset(template.preset),
    name,
    question,
    type,
    options: normalizePollOptions(template.options, type),
    participants: normalizePollParticipants(template.participants, fallbackParticipants),
    timerEnabled: Boolean(template.timerEnabled),
    timerTime: normalizePollTimerTime(template.timerTime, fallbackTimerTime),
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
        enabled: true
      }
    ],
    participants: getDefaultPollParticipants(),
    timerEnabled: false,
    timerTime: POLL_DEFAULT_TIMER_TIME,
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

  const id = trimText(run.id, 80);
  const templateId = trimText(run.templateId, 80);
  if (!id || !templateId) return null;

  const selected = {};
  for (const [userId, value] of Object.entries(run.selected ?? {})) {
    selected[userId] = Boolean(value);
  }

  const template = normalizePollTemplate({
    id: run.templateId || run.id,
    name: run.name,
    question: run.question,
    type: run.type,
    options: run.options,
    participants: selected,
    timerEnabled: run.timerEnabled,
    timerTime: run.timerTime,
    timerMinutes: run.timerMinutes,
    timerSound: run.timerSound,
    createdAt: run.requestedAt,
    updatedAt: run.requestedAt
  }, templateId, selected);

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
    timerTime: normalizePollTimerTime(run.timerTime, timerMinutesToTime(run.timerMinutes)),
    timerSound: normalizePollTimerSound(run.timerSound),
    timerId: trimText(run.timerId, 80),
    timerStartedAt: Number(run.timerStartedAt) || 0,
    timerEndsAt: Number(run.timerEndsAt) || 0,
    closed: Boolean(run.closed),
    temporary: Boolean(run.temporary)
  };
}

export function normalizePollState(rawState) {
  const source = rawState && (typeof rawState === "object") ? rawState : {};
  const legacySelected = {};
  const state = {
    defaultsVersion: Number(source.defaultsVersion) || 0,
    templates: {},
    activePoll: normalizePollRun(source.activePoll),
    lastRuns: {}
  };

  for (const [userId, value] of Object.entries(source.selected ?? {})) {
    legacySelected[userId] = Boolean(value);
  }

  for (const [templateId, rawTemplate] of Object.entries(source.templates ?? {})) {
    const hasTemplateParticipants = rawTemplate?.participants && (typeof rawTemplate.participants === "object");
    const hasSelectedFallback = Object.values(legacySelected).some(Boolean);
    const fallbackParticipants = hasTemplateParticipants || !hasSelectedFallback ? null : legacySelected;
    const template = normalizePollTemplate(rawTemplate, templateId, fallbackParticipants);
    state.templates[template.id] = template;
  }

  if (!Object.keys(state.templates).length && state.defaultsVersion < POLL_DEFAULTS_VERSION) {
    for (const template of createStarterPollTemplates()) {
      state.templates[template.id] = template;
    }
  }
  if (state.defaultsVersion < POLL_DEFAULTS_VERSION) state.defaultsVersion = POLL_DEFAULTS_VERSION;

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
  return Object.values(state?.templates ?? {}).sort((left, right) => {
    const leftCreated = Number(left.createdAt) || 0;
    const rightCreated = Number(right.createdAt) || 0;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;
    return left.name.localeCompare(right.name, game?.i18n?.lang);
  });
}

export function getPollOptionLabel(options, optionId) {
  return options.find((option) => option.id === optionId)?.label ?? "";
}

export function getPollOptionNumber(options, optionId) {
  const index = options.findIndex((option) => option.id === optionId);
  return index >= 0 ? index + 1 : 0;
}
