const ALLOWED_STYLE_PROPERTIES = Object.freeze([
  "color",
  "font-size",
  "font-style",
  "font-weight",
  "text-align",
  "text-decoration"
]);
const DEFAULT_COLOR = "#000000";
const DEFAULT_FONT_SIZE = "1.2em";
const ALIGNMENTS = new Set(["center", "left", "right"]);

export function parseRequestTextStyle(rawStyle) {
  const declarations = parseDeclarations(rawStyle);
  const decoration = declarations.get("text-decoration") ?? "";
  const fontWeight = declarations.get("font-weight") ?? "";
  return {
    color: normalizeRequestColor(declarations.get("color")) ?? DEFAULT_COLOR,
    fontSize: declarations.get("font-size")?.trim() || DEFAULT_FONT_SIZE,
    underline: /(^|\s)underline($|\s)/i.test(decoration),
    italic: /^(italic|oblique)/i.test(declarations.get("font-style") ?? ""),
    bold: /^(bold|bolder|[6-9]00)$/i.test(fontWeight.trim()),
    alignment: normalizeRequestAlignment(declarations.get("text-align"))
  };
}

export function sanitizeRequestTextStyle(rawStyle) {
  const probe = document.createElement("span");
  probe.style.cssText = String(rawStyle ?? "").slice(0, 1000);
  const safeDeclarations = [];
  for (const property of ALLOWED_STYLE_PROPERTIES) {
    const value = probe.style.getPropertyValue(property).trim();
    if (!value || /(url\s*\(|expression\s*\(|javascript\s*:)/i.test(value)) continue;
    const priority = probe.style.getPropertyPriority(property);
    safeDeclarations.push(`${property}: ${value}${priority ? " !important" : ""}`);
  }
  return safeDeclarations.length ? `${safeDeclarations.join("; ")};` : "";
}

export function normalizeRequestColor(value) {
  const color = String(value ?? "").trim().toLowerCase();
  const short = color.match(/^#([0-9a-f]{3})$/i)?.[1];
  if (short) return `#${Array.from(short, (digit) => digit + digit).join("")}`;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1(?:\.0+)?|0?\.\d+))?\s*\)$/i);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeRequestFontSize(value) {
  const fontSize = String(value ?? "").trim().slice(0, 100);
  if (!fontSize || /[;{}]|url\s*\(|expression\s*\(|javascript\s*:/i.test(fontSize)) return null;
  if (globalThis.CSS?.supports?.("font-size", fontSize)) return fontSize;
  const probe = globalThis.document?.createElement?.("span");
  if (!probe?.style) return null;
  probe.style.fontSize = "";
  probe.style.fontSize = fontSize;
  return probe.style.fontSize ? fontSize : null;
}

export function normalizeRequestAlignment(value) {
  const alignment = String(value ?? "").trim().toLowerCase();
  return ALIGNMENTS.has(alignment) ? alignment : "center";
}

export function buildRequestTextStyle({
  color,
  fontSize,
  underline = false,
  italic = false,
  bold = false,
  alignment = "center"
}) {
  const normalizedColor = normalizeRequestColor(color);
  const normalizedFontSize = normalizeRequestFontSize(fontSize);
  if (!normalizedColor || !normalizedFontSize) return null;
  const declarations = [
    `color: ${normalizedColor}`,
    `font-size: ${normalizedFontSize}`,
    `text-align: ${normalizeRequestAlignment(alignment)}`
  ];
  if (underline) declarations.push("text-decoration: underline");
  if (italic) declarations.push("font-style: italic");
  if (bold) declarations.push("font-weight: bold");
  return `${declarations.join("; ")};`;
}

function parseDeclarations(rawStyle) {
  const declarations = new Map();
  for (const rawDeclaration of String(rawStyle ?? "").slice(0, 1000).split(";")) {
    const separator = rawDeclaration.indexOf(":");
    if (separator < 1) continue;
    const property = rawDeclaration.slice(0, separator).trim().toLowerCase();
    const value = rawDeclaration.slice(separator + 1).trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}
