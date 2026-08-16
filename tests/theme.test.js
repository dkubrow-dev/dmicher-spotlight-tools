import assert from "node:assert/strict";
import test from "node:test";

class MockHTMLElement {}
globalThis.HTMLElement = MockHTMLElement;

const { moveThemeSettingFirst } = await import("../dmicher-spotlight-tools/scripts/theme.js");

test("module theme setting is moved before submenu entries", () => {
  const firstMenu = { matches: (selector) => selector === ".form-group" };
  const themeRow = {
    matches: (selector) => selector === ".form-group",
    closest: () => category
  };
  const category = {
    children: [firstMenu, themeRow],
    insertBefore(row, before) {
      this.inserted = [row, before];
    }
  };
  const root = new MockHTMLElement();
  root.querySelector = (selector) => selector.startsWith("[data-setting-id=") ? themeRow : null;

  moveThemeSettingFirst(null, root);

  assert.deepEqual(category.inserted, [themeRow, firstMenu]);
});

test("module theme setting already first is left in place", () => {
  const themeRow = {
    matches: (selector) => selector === ".form-group",
    closest: () => category
  };
  const category = {
    children: [themeRow],
    insertBefore() {
      throw new Error("must not reorder");
    }
  };
  const root = new MockHTMLElement();
  root.querySelector = (selector) => selector.startsWith("[data-setting-id=") ? themeRow : null;

  moveThemeSettingFirst(null, root);
});
