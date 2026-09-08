import { I18N_PREFIX, MODULE_ID } from "./config.js";
import { generics } from "./generics.js";

export const { escapeHTML, createSerialTaskQueue } = generics.utilities;
export const { getRenderedElement, runAfterApplicationLifecycle } = generics.windows;
export const { getChatMessageClass, getChatMessageRenderHook, buildChatSpeaker, applyChatMessageMode,
  getMessageAuthorId, getMessageAuthorName } = generics.chat;
export const openSingletonApplication = (application, createApplication) =>
  generics.windows.openSingletonApplication(application, createApplication, { moduleId: MODULE_ID });


export function i18nKey(key) {
  return `${I18N_PREFIX}.${key}`;
}

export function localize(key) {
  return game.i18n.localize(i18nKey(key));
}

export function format(key, data) {
  return game.i18n.format(i18nKey(key), data);
}

export function isModerator(user = game.user) {
  return Number(user?.role ?? 0) >= Number(CONST.USER_ROLES.ASSISTANT);
}

export function canUseRequest(request, user = game.user) {
  return !request.moderatorOnly || isModerator(user);
}


export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) parts.push(format("Duration.Hours", { count: hours }));
  if (minutes || hours) parts.push(format("Duration.Minutes", { count: minutes }));
  parts.push(format("Duration.Seconds", { count: seconds }));
  return parts.join(" ");
}

export function formatDigitalDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatClockTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  try {
    return new Intl.DateTimeFormat(game.i18n.lang, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  } catch (_error) {
    return date.toLocaleTimeString();
  }
}

export function formatTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || game.time.serverTime);
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const options = { timeStyle: "medium" };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat(game.i18n.lang, options).format(date);
  } catch (_error) {
    return date.toLocaleTimeString();
  }
}

export function getFoundryGeneration() {
  return Number(game.release?.generation ?? String(game.version ?? "").split(".")[0]);
}

export function getUserSettingScope() {
  return getFoundryGeneration() >= 13 ? "user" : "client";
}

export function setGamePaused(paused, { broadcast = true } = {}) {
  return getFoundryGeneration() >= 13
    ? game.togglePause(paused, { broadcast })
    : game.togglePause(paused, broadcast);
}

export function getMacroClass() {
  return CONFIG.Macro.documentClass ?? foundry.documents.Macro;
}

export function getModeratorUserIds() {
  return game.users.filter((user) => isModerator(user)).map((user) => user.id);
}

export function getWhisperRecipientsWithModerators(userId) {
  const recipients = new Set(getModeratorUserIds());
  if (userId) recipients.add(userId);
  return Array.from(recipients);
}

export function isPrimaryModerator() {
  const moderators = game.users
    .filter((user) => user.active && isModerator(user))
    .sort((left, right) => left.id.localeCompare(right.id));
  return moderators[0]?.id === game.user.id;
}

export function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
    image.src = src;
  });
}

export function isFoundryAudioMuted() {
  return globalThis.game?.audio?.globalMute === true;
}

export function playAudio(src, { broadcast = false, volume = 1 } = {}) {
  if (isFoundryAudioMuted()) return null;
  return foundry.audio.AudioHelper.play({
    src,
    volume,
    autoplay: true,
    loop: false
  }, broadcast);
}

export async function confirmDialog({ title, content, yes, no, icon = "fa-solid fa-check" }) {
  const { DialogV2 } = foundry.applications.api;
  if (DialogV2?.confirm) {
    return DialogV2.confirm({
      window: { title },
      content,
      modal: true,
      rejectClose: false,
      yes: {
        label: yes,
        icon
      },
      no: {
        label: no
      }
    });
  }
  return window.confirm(`${title}\n\n${String(content).replace(/<[^>]+>/g, "")}`);
}
