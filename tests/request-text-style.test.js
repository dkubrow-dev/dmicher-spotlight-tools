import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequestTextStyle,
  normalizeRequestAlignment,
  normalizeRequestColor,
  normalizeRequestFontSize,
  parseRequestTextStyle
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-text-style.js";

globalThis.CSS = {
  supports(property, value) {
    if (property !== "font-size") return false;
    return /^(?:\d+(?:\.\d+)?(?:px|em|rem|%)|clamp\(.+\))$/.test(value);
  }
};

test("legacy CSS is read into the limited request appearance controls", () => {
  assert.deepEqual(parseRequestTextStyle([
    "background-color: yellow",
    "color: rgb(180, 35, 45)",
    "font-size: 1.35em",
    "font-style: italic",
    "font-weight: 700",
    "text-decoration: underline",
    "text-align: right",
    "border: 2px solid red"
  ].join("; ")), {
    color: "#b4232d",
    fontSize: "1.35em",
    underline: true,
    italic: true,
    bold: true,
    alignment: "right"
  });
});

test("request appearance builds only the exposed CSS properties", () => {
  const style = buildRequestTextStyle({
    color: "#A1B2C3",
    fontSize: "clamp(1rem, 2vw, 1.5rem)",
    underline: true,
    italic: true,
    bold: true,
    alignment: "left"
  });

  assert.equal(style, "color: #a1b2c3; font-size: clamp(1rem, 2vw, 1.5rem); text-align: left; text-decoration: underline; font-style: italic; font-weight: bold;");
  assert.doesNotMatch(style, /background|border|font-family|padding/);
});

test("request appearance rejects invalid colors and injected font-size declarations", () => {
  assert.equal(normalizeRequestColor("#abc"), "#aabbcc");
  assert.equal(normalizeRequestColor("rgb(1, 2, 255)"), "#0102ff");
  assert.equal(normalizeRequestColor("red"), null);
  assert.equal(normalizeRequestFontSize("18px; color: red"), null);
  assert.equal(normalizeRequestFontSize("url(https://example.test/a)"), null);
  assert.equal(buildRequestTextStyle({ color: "red", fontSize: "18px" }), null);
  assert.equal(normalizeRequestAlignment("justify"), "center");
});
