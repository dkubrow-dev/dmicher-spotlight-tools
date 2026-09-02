import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TIMER_TEMPLATES_ROOT = path.join(
  ROOT,
  "dmicher-spotlight-tools",
  "templates",
  "timers"
);

function readTimerTemplate(name) {
  return fs.readFileSync(path.join(TIMER_TEMPLATES_ROOT, name), "utf8");
}

function openingTags(source, tagName) {
  return Array.from(
    source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi")),
    (match) => match[0]
  );
}

function attributeValue(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? null;
}

function hasAttribute(tag, name, valuePattern = null) {
  const value = attributeValue(tag, name);
  if (value === null) return false;
  return valuePattern ? valuePattern.test(value) : true;
}

function hasBooleanAttribute(tag, name) {
  return new RegExp(`(?:\\s|\\}|\"|')${name}(?:\\s|=|\\{|\"|'|>)`, "i").test(tag);
}

function getClassTag(source, tagName, className) {
  return openingTags(source, tagName).find((tag) => {
    return hasAttribute(tag, "class", new RegExp(`(?:^|\\s)${className}(?:\\s|$)`));
  });
}

function getElementBlock(source, tagName, openingTag) {
  const start = source.indexOf(openingTag);
  assert.notEqual(start, -1, `Missing <${tagName}> opening tag`);
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 0;
  for (const match of source.matchAll(tags)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return source.slice(start, match.index + match[0].length);
    } else {
      depth += 1;
    }
  }
  assert.fail(`Missing </${tagName}> closing tag`);
}

function findActionTag(source, actionPattern) {
  return openingTags(source, "button").find((tag) => {
    const action = attributeValue(tag, "data-timer-action")
      ?? attributeValue(tag, "data-timer-template-action");
    return action !== null && actionPattern.test(action);
  });
}

function activeHandlebarsConditions(source, position) {
  const stack = [];
  const tokens = source.matchAll(/\{\{\s*(#|\/)(if|unless)\b([^}]*)\}\}/gi);
  for (const token of tokens) {
    if (token.index >= position) break;
    if (token[1] === "#") {
      stack.push({ block: token[2].toLowerCase(), expression: token[3].trim() });
    } else {
      stack.pop();
    }
  }
  return stack;
}

test("timer templates appear before current timers without their own heading", () => {
  const manager = readTimerTemplate("timer-manager.hbs");
  const formEnd = manager.indexOf("</form>");
  const currentHeading = Array.from(
    manager.matchAll(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi)
  ).find((match) => /keys\.(?:currentTableTitle|tableTitle)/i.test(match[0]))?.index ?? -1;
  const templateTableTag = getClassTag(manager, "table", "dmicher-timer-template-table");

  assert.notEqual(formEnd, -1, "new timer form is missing");
  assert.notEqual(currentHeading, -1, "current timers heading is missing");
  assert.ok(templateTableTag, "timer template table is missing");

  const templateTableStart = manager.indexOf(templateTableTag);
  assert.ok(formEnd < templateTableStart, "template table must follow the new timer form");
  assert.ok(templateTableStart < currentHeading, "template table must precede current timers");

  const betweenFormAndCurrentTimers = manager.slice(formEnd + "</form>".length, currentHeading);
  assert.match(betweenFormAndCurrentTimers, /<hr\b/i);
  assert.doesNotMatch(betweenFormAndCurrentTimers, /<h[1-6]\b/i);
});

test("new timer actions place save-template between sound preview and start", () => {
  const manager = readTimerTemplate("timer-manager.hbs");
  const preview = findActionTag(manager, /^preview-sound$/);
  const save = findActionTag(manager, /^save-template$/);
  const submit = openingTags(manager, "button").find((tag) => hasAttribute(tag, "type", /^submit$/i));

  assert.ok(preview, "sound preview action is missing");
  assert.ok(save, "save-template action is missing");
  assert.ok(submit, "timer start submit button is missing");
  assert.match(getElementBlock(manager, "button", save), /fa-floppy-disk/i);
  assert.ok(manager.indexOf(preview) < manager.indexOf(save));
  assert.ok(manager.indexOf(save) < manager.indexOf(submit));
});

test("current timers use a disabled star checkbox before the name column", () => {
  const manager = readTimerTemplate("timer-manager.hbs");
  const tableTag = getClassTag(manager, "table", "dmicher-timer-table");
  assert.ok(tableTag, "current timers table is missing");
  const table = getElementBlock(manager, "table", tableTag);

  const headings = Array.from(
    table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi),
    (match) => match[1]
  );
  assert.ok(headings.length >= 2, "current timer headings are missing");
  assert.match(headings[0], /#|column(?:Template|Source|Preset)/i);
  assert.match(headings[1], /columnName/i);

  const firstRow = table.match(
    /<tr\b(?=[^>]*data-timer-row)[^>]*>([\s\S]*?)<\/tr>/i
  )?.[1] ?? "";
  const firstCell = firstRow.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "";
  const checkbox = openingTags(firstCell, "input").find((tag) => {
    return hasAttribute(tag, "type", /^checkbox$/i);
  });

  assert.ok(checkbox, "template-instance checkbox must be in the first timer cell");
  assert.ok(hasBooleanAttribute(checkbox, "disabled"), "template-instance checkbox must be disabled");
  assert.match(checkbox, /checked/i);
  assert.match(firstCell, /fa-star|class\s*=\s*["'][^"']*(?:star|template)[^"']*["']/i);
});

test("saving a current timer is conditional", () => {
  const manager = readTimerTemplate("timer-manager.hbs");
  const tableTag = getClassTag(manager, "table", "dmicher-timer-table");
  assert.ok(tableTag, "current timers table is missing");
  const table = getElementBlock(manager, "table", tableTag);
  const firstRow = table.match(
    /<tr\b(?=[^>]*data-timer-row)[^>]*>([\s\S]*?)<\/tr>/i
  )?.[1] ?? "";
  const save = findActionTag(
    firstRow,
    /^(?:save-current-template|save-timer-template|save-as-template)$/
  );

  assert.ok(save, "current timer save-as-template action is missing");
  const saveIndex = firstRow.indexOf(save);
  assert.ok(
    activeHandlebarsConditions(firstRow, saveIndex).some(({ expression }) => {
      return /template|save/i.test(expression);
    }),
    "current timer save action must be guarded by its template-instance state"
  );
});

test("template rows expose start, edit, and a built-in-aware delete action", () => {
  const manager = readTimerTemplate("timer-manager.hbs");
  const row = manager.match(
    /<tr\b(?=[^>]*data-(?:timer-)?template-row)[^>]*>([\s\S]*?)<\/tr>/i
  )?.[1] ?? "";
  const start = findActionTag(row, /^(?:start|start-template|template-start)$/);
  const edit = findActionTag(row, /^(?:edit|edit-template|template-edit)$/);
  const remove = findActionTag(row, /^(?:delete|delete-template|template-delete)$/);

  assert.ok(start, "template start action is missing");
  assert.ok(edit, "template edit action is missing");
  assert.ok(remove, "template delete action is missing");

  const deleteIndex = row.indexOf(remove);
  assert.ok(
    activeHandlebarsConditions(row, deleteIndex).some(({ expression }) => {
      return /built|delete|remove/i.test(expression);
    }),
    "template delete action must be conditional for the built-in break template"
  );
});

test("expired timer windows expose the repeat action", () => {
  const timerWindow = readTimerTemplate("timer-window.hbs");
  const repeat = findActionTag(timerWindow, /^repeat$/);
  assert.ok(repeat, "timer repeat action is missing");
  assert.match(getElementBlock(timerWindow, "button", repeat), /fa-rotate-right/i);
  const repeatIndex = timerWindow.indexOf(repeat);
  assert.ok(
    activeHandlebarsConditions(timerWindow, repeatIndex).some(({ expression }) => {
      return /^expired$/i.test(expression);
    }),
    "timer-window repeat action must be limited to expired timers"
  );
});

test("break custom choices share one row and pair radios with disabled HH:MM inputs", () => {
  const breakTemplate = readTimerTemplate("break-timer.hbs");
  const rowTag = openingTags(breakTemplate, "div").find((tag) => {
    return hasAttribute(tag, "class", /(?:^|\s)dmicher-break-custom-(?:options|row)(?:\s|$)/);
  });
  assert.ok(rowTag, "break custom time row is missing");
  const row = getElementBlock(breakTemplate, "div", rowTag);
  const inputs = openingTags(row, "input");
  const radios = inputs.filter((tag) => hasAttribute(tag, "type", /^radio$/i));
  const textInputs = inputs.filter((tag) => hasAttribute(tag, "type", /^(?:text|time)$/i));

  assert.equal(radios.length, 2);
  assert.equal(textInputs.length, 2);

  const radioValues = radios.map((tag) => attributeValue(tag, "value") ?? "");
  assert.ok(radioValues.some((value) => /deadline|until/i.test(value)));
  assert.ok(radioValues.some((value) => /duration|for/i.test(value)));

  for (const input of textInputs) {
    assert.ok(hasBooleanAttribute(input, "disabled"), `${input} must have a disabled state`);
    const type = attributeValue(input, "type");
    const declaresClockFormat = type === "time"
      || hasAttribute(input, "maxlength", /^5$/)
      || hasAttribute(input, "pattern")
      || hasAttribute(input, "placeholder", /HH:MM|time|clock/i);
    assert.ok(declaresClockFormat, `${input} must declare an HH:MM input contract`);
  }
});
