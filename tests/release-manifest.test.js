import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateReleaseManifest } from "../scripts/release-manifest.mjs";

const sourceManifest = JSON.parse(fs.readFileSync(new URL("../dmicher-spotlight-tools/module.json", import.meta.url), "utf8"));

test("release validation accepts the source manifest and rejects unpinned or foreign release URLs", () => {
  validateReleaseManifest(sourceManifest);
  for (const [field, value] of [
    ["manifest", sourceManifest.manifest.replace("download/1.3.0", "latest/download")],
    ["manifest", sourceManifest.manifest.replace("/1.3.0/", "/1.2.0/")],
    ["manifest", sourceManifest.manifest.replace("dkubrow-dev", "another-owner")],
    ["download", sourceManifest.download.replace("/1.3.0/", "/1.2.0/")],
    ["download", "https://another.example/1.3.0/dmicher-spotlight-tools-1.3.0.zip"],
    ["changelog", sourceManifest.changelog.replace("/1.3.0", "/latest")]
  ]) {
    assert.throws(() => validateReleaseManifest({ ...sourceManifest, [field]: value }), /exact release/);
  }
});

test("release validation rejects missing, unpinned, and extra required modules", () => {
  for (const mutate of [
    manifest => { delete manifest.relationships; },
    manifest => { manifest.relationships.requires[0].manifest = manifest.relationships.requires[0].manifest.replace("download/1.0.0", "latest/download"); },
    manifest => { manifest.relationships.requires[0].manifest = manifest.relationships.requires[0].manifest.replace("/1.0.0/", "/1.3.0/"); },
    manifest => { manifest.relationships.requires.push({ id: "third-party-tool", type: "module" }); }
  ]) {
    const manifest = structuredClone(sourceManifest);
    mutate(manifest);
    assert.throws(() => validateReleaseManifest(manifest), /required Generics release/);
  }
});
