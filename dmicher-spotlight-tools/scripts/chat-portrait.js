import { DEFAULT_USER_PORTRAIT, FLAGS, MODULE_ID } from "./config.js";
import { generics } from "./generics.js";

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

export function renderChatPortrait(message, html) {
  const portraitData = getChatPortraitData(message);
  if (!portraitData) return;
  const sources = Array.from(new Set([
    getChatDisplayPortrait(portraitData),
    getFallbackPortrait(portraitData),
    DEFAULT_USER_PORTRAIT
  ].filter(Boolean)));
  return generics.chat.renderChatPortrait(html, {
    moduleId: MODULE_ID,
    sources,
    alt: String(portraitData.characterName || portraitData.authorName || "")
  });
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}
