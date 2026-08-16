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
  assert.equal(manifest.version, "1.2.0");
  assert.equal(manifest.compatibility.minimum, "12");
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
  assert.deepEqual(system.compatibility, { minimum: "12", verified: "14" });
  assert.equal(world.system, system.id);
  assert.equal(world.coreVersion, "12.343");
  assert.deepEqual(world.compatibility, { minimum: "12", verified: "14" });
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
});
