import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildSpotlightHelp, SETTING_HELP, getSettingHelpEntries } from "../dmicher-spotlight-tools/scripts/tools/requests/request-help-content.js";

for (const language of ["ru", "en"]) {
  const locale = JSON.parse(fs.readFileSync(new URL(`../dmicher-spotlight-tools/lang/${language}.json`, import.meta.url), "utf8")).DMICHERSPOTLIGHTTOOLS;
  const localize = (key) => key.split(".").reduce((value, part) => value?.[part], locale);
  test(`${language}: concise operational help includes common footer and every settings target`, () => {
    const content = buildSpotlightHelp({ language, localize });
    assert.deepEqual(content.footer, ["author", "thanks", "premium"]);
    const pages = new Map(content.pages.map((page) => [page.id, page]));
    assert.equal(pages.size, content.pages.length);
    for (const page of pages.values()) {
      assert.ok(page.title?.trim()); assert.ok(page.html?.trim());
      assert.doesNotMatch(page.html, /undefined|\[object Object\]|socket|schemaVersion|module\.api/);
      for (const match of page.html.matchAll(/data-help-page="([^"]+)"/g)) assert.ok(pages.has(match[1]), match[1]);
    }
    for (const entry of SETTING_HELP) {
      assert.ok(localize(entry.labelKey), entry.labelKey);
      assert.ok(entry.description[language]?.trim());
      assert.ok(pages.get(entry.pageId)?.html.includes(`id="${entry.id}"`), entry.id);
    }
    for (const entry of getSettingHelpEntries(language)) {
      assert.ok(pages.get(entry.pageId)?.html.includes(`id="${entry.anchor}"`));
      assert.ok(entry.hint.length > 10);
    }
  });
}

test("both locales keep the same page identities for contextual links", () => {
  assert.deepEqual(buildSpotlightHelp({ language: "ru" }).pages.map((page) => page.id), buildSpotlightHelp({ language: "en" }).pages.map((page) => page.id));
});
