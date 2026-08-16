import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REQUEST_HELP_GROUPS,
  REQUEST_HELP_PAGES
} from "../dmicher-spotlight-tools/scripts/tools/requests/request-help-content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_ROOT = path.join(ROOT, "dmicher-spotlight-tools");

function readLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", locale + ".json"), "utf8"));
}

function assertText(value, key) {
  assert.equal(typeof value, "string", key);
  assert.ok(value.trim().length > 0, key);
}

test("module help describes every configured interface element in both locales", () => {
  let itemCount = 0;
  assert.deepEqual(
    REQUEST_HELP_GROUPS.flatMap((group) => group.pages),
    [...REQUEST_HELP_PAGES]
  );

  for (const locale of ["ru", "en"]) {
    const help = readLocale(locale).DMICHERSPOTLIGHTTOOLS.Requests.Help;
    assert.deepEqual(Object.keys(help.Groups), REQUEST_HELP_GROUPS.map((group) => group.key));
    for (const group of REQUEST_HELP_GROUPS) {
      assertText(help.Groups[group.key], locale + ".Groups." + group.key);
    }

    const pages = help.Pages;
    assert.deepEqual(Object.keys(pages), REQUEST_HELP_PAGES.map((page) => page.key));
    for (const definition of REQUEST_HELP_PAGES) {
      const page = pages[definition.key];
      assertText(page.Title, locale + "." + definition.key + ".Title");
      assert.doesNotMatch(page.Title, /:/, locale + "." + definition.key + ".Title");
      assertText(page.Intro, locale + "." + definition.key + ".Intro");
      assert.deepEqual(
        Object.keys(page.Sections),
        definition.sections.map((section) => section.key),
        locale + "." + definition.key + ".Sections"
      );
      for (const sectionDefinition of definition.sections) {
        const section = page.Sections[sectionDefinition.key];
        assertText(section.Title, locale + "." + definition.key + "." + sectionDefinition.key + ".Title");
        assert.deepEqual(
          Object.keys(section.Items),
          sectionDefinition.items,
          locale + "." + definition.key + "." + sectionDefinition.key + ".Items"
        );
        for (const itemKey of sectionDefinition.items) {
          const item = section.Items[itemKey];
          const key = locale + "." + definition.key + "." + sectionDefinition.key + "." + itemKey;
          assertText(item.Label, key + ".Label");
          assertText(item.Description, key + ".Description");
          itemCount += 1;
        }
      }
    }
  }
  assert.ok(itemCount >= 600);
});
