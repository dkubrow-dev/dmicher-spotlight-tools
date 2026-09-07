import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODULE_ROOT = path.join(ROOT, "dmicher-spotlight-tools");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function flattenKeys(value, prefix = "", output = []) {
  for (const [key, child] of Object.entries(value)) {
    const childKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenKeys(child, childKey, output);
    } else {
      output.push(childKey);
    }
  }
  return output.sort();
}

test("manifest and localization files are internally consistent", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "module.json"), "utf8"));
  assert.equal(manifest.version, "1.3.0");
  assert.match(manifest.download, /\/1\.3\.0\/dmicher-spotlight-tools-1\.3\.0\.zip$/);
  assert.match(manifest.changelog, /\/tag\/1\.3\.0$/);
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "14");

  const declaredFiles = [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map((language) => language.path)
  ];
  for (const relativePath of declaredFiles) {
    assert.ok(fs.existsSync(path.join(MODULE_ROOT, relativePath)), relativePath);
  }

  const en = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "en.json"), "utf8"));
  const ru = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "ru.json"), "utf8"));
  assert.deepEqual(flattenKeys(en), flattenKeys(ru));
  const enWelcome = en.DMICHERSPOTLIGHTTOOLS.Requests.Welcome.MainBefore;
  const ruWelcome = ru.DMICHERSPOTLIGHTTOOLS.Requests.Welcome.MainBefore;
  assert.match(enWelcome, /"\{module\}" \(\{version\}\)/);
  assert.ok(ruWelcome.includes("\u00ab{module}\u00bb ({version})"));
  assert.doesNotMatch(enWelcome + ruWelcome, /DMICHERSPOTLIGHTTOOLS\.Title/);
});

test("installed Foundry smoke fixtures target the supported version range", () => {
  const system = JSON.parse(fs.readFileSync(
    path.join(ROOT, "tests", "fixtures", "foundry-smoke-system", "system.json"),
    "utf8"
  ));
  const world = JSON.parse(fs.readFileSync(
    path.join(ROOT, "tests", "fixtures", "foundry-smoke-world", "world.json"),
    "utf8"
  ));

  assert.equal(system.id, "dmicher-smoke-system");
  assert.deepEqual(system.compatibility, { minimum: "13", verified: "14" });
  assert.equal(world.system, system.id);
  assert.equal(world.coreVersion, "13.351");
  assert.deepEqual(world.compatibility, { minimum: "13", verified: "14" });
  assert.deepEqual(world.relationships.requires, [{
    id: "dmicher-spotlight-tools",
    type: "module",
    compatibility: { minimum: "1.1.3" }
  }]);
});

test("all relative module imports, templates, and assets resolve", () => {
  const scriptsRoot = path.join(MODULE_ROOT, "scripts");
  const scripts = walk(scriptsRoot).filter((file) => file.endsWith(".js"));

  for (const script of scripts) {
    const source = fs.readFileSync(script, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+\.js)"/g)) {
      const target = path.resolve(path.dirname(script), match[1]);
      assert.ok(fs.existsSync(target), `${path.relative(ROOT, script)} -> ${match[1]}`);
    }
    for (const match of source.matchAll(/modules\/\$\{MODULE_ID\}\/(templates\/[^`"]+\.hbs)/g)) {
      assert.ok(fs.existsSync(path.join(MODULE_ROOT, match[1])), match[1]);
    }
    for (const match of source.matchAll(/modules\/\$\{MODULE_ID\}\/(assets\/[^`"]+)/g)) {
      assert.ok(fs.existsSync(path.join(MODULE_ROOT, match[1])), match[1]);
    }
  }
});

test("module chat messages never derive a speaker from the current selection", () => {
  const scripts = walk(path.join(MODULE_ROOT, "scripts")).filter((file) => file.endsWith(".js"));
  for (const script of scripts) {
    const source = fs.readFileSync(script, "utf8");
    assert.doesNotMatch(source, /\.getSpeaker\s*\(\s*\)/, path.relative(ROOT, script));
  }
});

test("removed readiness window code is absent while historical compatibility remains", () => {
  for (const relativePath of [
    "scripts/tools/readiness/readiness-tool.js",
    "scripts/tools/readiness/readiness-utils.js",
    "scripts/tools/readiness/readiness-window.js",
    "templates/readiness/readiness.hbs"
  ]) {
    assert.equal(fs.existsSync(path.join(MODULE_ROOT, relativePath)), false, relativePath);
  }

  const config = fs.readFileSync(path.join(MODULE_ROOT, "scripts", "config.js"), "utf8");
  const entry = fs.readFileSync(path.join(MODULE_ROOT, "scripts", "dmicher-spotlight-tools.js"), "utf8");
  assert.match(config, /readinessRequest/);
  assert.match(config, /readinessResult/);
  assert.match(entry, /openReadiness:\s*\(\)\s*=>\s*pollTool\.openManager\(\)/);
  assert.doesNotMatch(config, /readinessState/);
});

test("stylesheets have balanced block delimiters", () => {
  for (const stylesheet of walk(path.join(MODULE_ROOT, "styles")).filter((file) => file.endsWith(".css"))) {
    const source = fs.readFileSync(stylesheet, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const character of source) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      assert.ok(depth >= 0, path.relative(ROOT, stylesheet));
    }
    assert.equal(depth, 0, path.relative(ROOT, stylesheet));
  }
});

test("Handlebars block structure is balanced in every template", () => {
  const templates = walk(path.join(MODULE_ROOT, "templates")).filter((file) => file.endsWith(".hbs"));
  assert.ok(templates.length > 0);

  for (const template of templates) {
    const source = fs.readFileSync(template, "utf8");
    const stack = [];
    for (const match of source.matchAll(/{{\s*([#/])\s*([\w-]+)[^}]*}}/g)) {
      const [, marker, block] = match;
      if (marker === "#") {
        stack.push(block);
        continue;
      }
      assert.equal(stack.pop(), block, path.relative(ROOT, template));
    }
    assert.deepEqual(stack, [], path.relative(ROOT, template));
  }
});


test("interactive help navigation never exposes browser URLs", () => {
  const helpTemplate = fs.readFileSync(
    path.join(MODULE_ROOT, "templates", "requests", "help.hbs"),
    "utf8"
  );
  assert.doesNotMatch(helpTemplate, /<a\b|href\s*=/i);
  assert.match(helpTemplate, /<button type="button"[^>]+data-help-page=/);
});

test("literal module localization references exist", () => {
  const en = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "en.json"), "utf8"));
  const files = [
    ...walk(path.join(MODULE_ROOT, "scripts")).filter((file) => file.endsWith(".js")),
    ...walk(path.join(MODULE_ROOT, "templates")).filter((file) => file.endsWith(".hbs"))
  ];
  const hasKey = (key) => key.split(".").every((part, index, parts) => {
    const parent = parts.slice(0, index).reduce((value, segment) => value?.[segment], en);
    return parent && Object.hasOwn(parent, part);
  });

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:localize|format|i18nKey)\(\s*["']([^"']+)["']/g)) {
      const key = match[1].startsWith("DMICHERSPOTLIGHTTOOLS.")
        ? match[1]
        : `DMICHERSPOTLIGHTTOOLS.${match[1]}`;
      assert.ok(hasKey(key), `${path.relative(ROOT, file)} -> ${key}`);
    }
  }
});

test("stopwatch minimum height yields to ApplicationV2 minimization states", function (){
  const stylesheet = fs.readFileSync(path.join(MODULE_ROOT, "styles", "dmicher-spotlight-tools.css"), "utf8");
  assert.match(stylesheet, /\.dmicher-stopwatch\.minimizing,[\s\S]*\.dmicher-stopwatch\.minimized,[\s\S]*\.dmicher-stopwatch\.maximizing\s*\{\s*min-height:\s*0;/);
});

test("help content uses module theme colors", function (){
  const stylesheet = fs.readFileSync(path.join(MODULE_ROOT, "styles", "dmicher-spotlight-tools.css"), "utf8");
  assert.match(stylesheet, /\.dmicher-spotlight-window\.dmicher-request-help\s+\.dmicher-request-help-item\s+dt\s*\{[\s\S]*?color:\s*var\(--dmicher-text-muted[\s\S]*?text-shadow:\s*none;/s);
  assert.match(stylesheet, /\.dmicher-spotlight-window\.dmicher-request-help\s+\.dmicher-request-help-item\s+dd\s*\{[\s\S]*?color:\s*var\(--dmicher-text/s);
  assert.match(stylesheet, /\.dmicher-spotlight-window\.dmicher-request-help\s+\.dmicher-request-help-page\s+h2[\s\S]*color:\s*var\(--dmicher-heading/);
  assert.match(stylesheet, /\.dmicher-spotlight-window\.dmicher-request-help \.dmicher-request-help-toc \.dmicher-help-page-link\s*\{[\s\S]*?background:\s*transparent !important;[\s\S]*?color:\s*var\(--dmicher-text\) !important;/);
  assert.match(stylesheet, /\.dmicher-help-page-link\.active\s*\{[\s\S]*?background:\s*var\(--dmicher-surface-raised\) !important;[\s\S]*?border-left-color:\s*var\(--dmicher-accent\) !important;/);
});

test("poll template macro thumbnails keep a usable size across Foundry versions", function () {
  const stylesheet = fs.readFileSync(path.join(MODULE_ROOT, "styles", "dmicher-spotlight-tools.css"), "utf8");
  const template = fs.readFileSync(path.join(MODULE_ROOT, "templates", "polls", "poll-manager.hbs"), "utf8");
  const en = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "en.json"), "utf8"));
  const ru = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "ru.json"), "utf8"));

  assert.match(stylesheet, /\.dmicher-poll-template-macro-heading,[\s\S]*?min-width:\s*3\.4rem;[\s\S]*?width:\s*3\.4rem;/);
  assert.match(stylesheet, /\.dmicher-poll-template-macro-cell img\s*\{[\s\S]*?max-width:\s*36px;[\s\S]*?min-width:\s*36px;[\s\S]*?width:\s*36px;/);
  assert.match(template, /<img[^>]+alt="\{\{macroTitle\}\}"[^>]+data-poll-template-drag/);
  assert.equal(en.DMICHERSPOTLIGHTTOOLS.Polls.Manager.Columns.Macro, "Macro");
  assert.equal(ru.DMICHERSPOTLIGHTTOOLS.Polls.Manager.Columns.Macro, "\u041c\u0430\u043a\u0440\u043e\u0441");
});

test("welcome support is visually separated and uses internal master settings action", () => {
  const stylesheet = fs.readFileSync(path.join(MODULE_ROOT, "styles", "dmicher-spotlight-tools.css"), "utf8");
  const requestTool = fs.readFileSync(path.join(MODULE_ROOT, "scripts", "tools", "requests", "request-tool.js"), "utf8");
  const ru = JSON.parse(fs.readFileSync(path.join(MODULE_ROOT, "lang", "ru.json"), "utf8")).DMICHERSPOTLIGHTTOOLS;
  assert.match(stylesheet, /\.dmicher-request-welcome-divider\s*\{[\s\S]*?border-top:[\s\S]*?\}/);
  assert.match(stylesheet, /\.dmicher-request-welcome-support\s*\{[\s\S]*?font-size:\s*var\(--font-size-12\)/);
  assert.match(stylesheet, /\.dmicher-request-welcome \.dmicher-inline-link-tail\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(requestTool, /openMasterSettings:[\s\S]*?openRequestMasterSettings/);
  assert.doesNotMatch(requestTool, /fetch\(|XMLHttpRequest/);
  assert.equal(`${ru.Requests.Welcome.DisableBefore} ${ru.Requests.Welcome.MasterSettingsLink}${ru.Requests.Welcome.DisableAfter}`, "Общие и премиальные параметры модуля доступны в настройках мастера.");
});

test("window tables keep one continuous row divider", () => {
  const stylesheet = fs.readFileSync(path.join(MODULE_ROOT, "styles", "dmicher-spotlight-tools.css"), "utf8");
  const tableRule = stylesheet.match(/\.dmicher-tool-table\s*\{([^}]*)\}/)?.[1] ?? "";
  const rowRule = stylesheet.match(/\.dmicher-tool-table tr\s*\{([^}]*)\}/)?.[1] ?? "";
  const cellRule = stylesheet.match(/\.dmicher-tool-table th,\s*\.dmicher-tool-table td\s*\{([^}]*)\}/)?.[1] ?? "";
  const nameCellRule = stylesheet.match(/\.dmicher-poll-template-name-cell\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(tableRule, /border-collapse:\s*collapse/);
  assert.match(tableRule, /border-spacing:\s*0/);
  assert.match(rowRule, /border-bottom:\s*1px solid/);
  assert.match(cellRule, /border-bottom:\s*0/);
  assert.doesNotMatch(nameCellRule, /display:\s*(?:flex|grid)/);
  assert.match(stylesheet, /\.dmicher-spotlight-window \.dmicher-poll-template-name-button\s*\{[^}]*display:\s*block/);

  const tableTemplates = walk(path.join(MODULE_ROOT, "templates"))
    .filter((templatePath) => templatePath.endsWith(".hbs"))
    .filter((templatePath) => fs.readFileSync(templatePath, "utf8").includes("<table"));
  for (const templatePath of tableTemplates) {
    const template = fs.readFileSync(templatePath, "utf8");
    for (const match of template.matchAll(/<table\b[^>]*>/g)) {
      assert.match(match[0], /\bclass="[^"]*\bdmicher-tool-table\b[^"]*"/, path.relative(ROOT, templatePath));
    }
  }
});

test("timer manager routes repeat controls through the shared confirmation flow", () => {
  const template = fs.readFileSync(path.join(MODULE_ROOT, "templates", "timers", "timer-manager.hbs"), "utf8");
  const manager = fs.readFileSync(path.join(MODULE_ROOT, "scripts", "tools", "timers", "timer-manager.js"), "utf8");
  assert.match(template, /data-timer-action="repeat"[\s\S]*?fa-rotate-right/);
  assert.match(manager, /confirmRepeatTimer\(button\.dataset\.timerId\)/);
});
