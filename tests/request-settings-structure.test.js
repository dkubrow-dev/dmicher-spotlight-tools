import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_ROOT = path.join(ROOT, "dmicher-spotlight-tools");

function read(relativePath) {
  return fs.readFileSync(path.join(MODULE_ROOT, relativePath), "utf8");
}

test("personal and Game Master request settings use separate templates", () => {
  const personal = read("templates/request-settings.hbs");
  const master = read("templates/request-master-settings.hbs");

  assert.doesNotMatch(personal, /data-request-settings-tab|data-request-settings-panel/);
  assert.doesNotMatch(personal, /dmicher-antispam-settings|SoundsHeading|ImagesHeading/);
  assert.match(personal, /#each requests/);
  assert.doesNotMatch(personal, /CssStyle|StyleNote|name="\{\{urgency\}\}Style"/);
  assert.match(personal, /type="color"[^>]+data-request-color-picker/);
  assert.match(personal, /data-request-font-toggle="Underline"/);
  assert.match(personal, /data-request-font-toggle="Italic"/);
  assert.match(personal, /data-request-font-toggle="Bold"/);
  assert.match(personal, /name="\{\{urgency\}\}Alignment"/);

  assert.doesNotMatch(master, /data-request-settings-tab|data-request-settings-panel/);
  assert.match(master, /dmicher-antispam-settings/);
  assert.match(master, /Requests\.Feed\.SettingsHeading/);
  assert.match(master, /name="feedShowToPlayers"[^>]*feedShowToPlayers/);
  assert.match(master, /Requests\.Resources\.ImagesHeading/);
  assert.match(master, /Requests\.Resources\.SoundsHeading/);
  assert.match(master, /Requests\.Welcome\.Heading/);
  assert.match(master, /#each imageResources/);
  assert.match(master, /#each soundResources/);
  assert.doesNotMatch(master, /timerSoundTypes|data-custom-timer-sound|customSoundChecked|disabledText/);

  const feedAt = master.indexOf("Requests.Feed.SettingsHeading");
  const limitsAt = master.indexOf("dmicher-antispam-settings");
  const imagesAt = master.indexOf("Requests.Resources.ImagesHeading");
  const soundsAt = master.indexOf("Requests.Resources.SoundsHeading");
  assert.ok(feedAt < limitsAt && limitsAt < imagesAt && imagesAt < soundsAt);
});

test("sound resource sliders have a stable explicit width", () => {
  const css = read("styles/dmicher-spotlight-tools.css");
  assert.match(css, /--dmicher-sound-volume-width: 14rem;/);
  assert.match(css, /\.dmicher-sound-resource \.dmicher-volume-field input\[type="range"\][\s\S]*?width: var\(--dmicher-sound-volume-width\);/);
  assert.doesNotMatch(css, /\.dmicher-request-settings-tabs/);
  assert.match(css, /\.dmicher-spotlight-window h4,[\s\S]*?color: var\(--dmicher-heading\) !important;[\s\S]*?text-shadow: none !important;/);
  assert.match(css, /input::placeholder,[\s\S]*?color: var\(--dmicher-text-muted\) !important;/);
  assert.match(css, /-webkit-text-fill-color: var\(--dmicher-text-muted\);/);
  assert.match(css, /background: var\(--dmicher-surface-raised\) !important;[\s\S]*?opacity: 1 !important;/);
  assert.doesNotMatch(css, /dmicher-timer-table tbody tr\.is-expired \{[\s\S]*?color: #edf1ef;/);
  assert.doesNotMatch(css, /dmicher-timer-table tbody tr\.is-expired button \{[\s\S]*?color: #f6f8f7;/);
});
