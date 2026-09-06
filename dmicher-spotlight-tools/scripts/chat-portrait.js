import { DEFAULT_USER_PORTRAIT, FLAGS, MODULE_ID } from "./config.js";
import { getRenderedElement } from "./utils.js";

const CHAT_PORTRAIT_SELECTOR = ".message-sender .avatar img, .message-sender .avatar video";
const VIDEO_PORTRAIT_PATTERN = /\.(?:m4v|mp4|ogg|ogv|webm)(?:[?#].*)?$/i;

function getChatPortraitData(message) {
  const technical = message.getFlag(MODULE_ID, FLAGS.technical);
  if (technical && typeof technical === "object") return technical;
  const requestData = message.getFlag(MODULE_ID, FLAGS.request);
  if (requestData && typeof requestData === "object") return requestData;
  const resolutionData = message.getFlag(MODULE_ID, FLAGS.resolution);
  return resolutionData?.requestData && typeof resolutionData.requestData === "object"
    ? resolutionData.requestData
    : null;
}

function getFallbackPortrait(portraitData) {
  const userPortrait = game.users?.get(String(portraitData?.authorId ?? ""))?.avatar;
  return firstNonEmptyString(userPortrait, DEFAULT_USER_PORTRAIT);
}

export function getChatDisplayPortrait(portraitData) {
  return firstNonEmptyString(portraitData?.portrait, getFallbackPortrait(portraitData));
}

export function applyChatPortrait(customData, message) {
  const portraitData = getChatPortraitData(message);
  if (!portraitData || !customData || typeof customData !== "object") return customData;
  customData.customIconPortraitImage = getChatDisplayPortrait(portraitData);
  return customData;
}

function applyPortraitSource(portrait, sources, alt, index = 0) {
  if (!portrait || index >= sources.length) return portrait;
  const source = sources[index];
  const tagName = VIDEO_PORTRAIT_PATTERN.test(source) ? "video" : "img";
  let media = portrait;
  if (String(portrait.tagName ?? "").toLowerCase() !== tagName && portrait.replaceWith) {
    media = document.createElement(tagName);
    portrait.replaceWith(media);
  }
  if (tagName === "video") {
    for (const attribute of ["autoplay", "muted", "disablepictureinpicture", "loop", "playsinline"]) {
      media.toggleAttribute?.(attribute, true);
    }
  }
  media.alt = alt;
  if (media.dataset) media.dataset.dmicherChatPortraitSources = JSON.stringify(sources);
  if (index + 1 < sources.length) {
    media.addEventListener?.("error", () => {
      applyPortraitSource(media, sources, alt, index + 1);
    }, { once: true });
  }
  media.src = source;
  return media;
}

export function renderChatPortrait(message, html) {
  const portraitData = getChatPortraitData(message);
  if (!portraitData) return;
  const root = getRenderedElement(html);
  const portrait = root?.querySelector?.(CHAT_PORTRAIT_SELECTOR);
  if (!portrait) return;
  const sources = Array.from(new Set([
    getChatDisplayPortrait(portraitData),
    getFallbackPortrait(portraitData),
    DEFAULT_USER_PORTRAIT
  ].filter(Boolean)));
  const sourceSignature = JSON.stringify(sources);
  if (portrait.dataset?.dmicherChatPortraitSources === sourceSignature) return;
  applyPortraitSource(
    portrait,
    sources,
    String(portraitData.characterName || portraitData.authorName || "")
  );
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}
