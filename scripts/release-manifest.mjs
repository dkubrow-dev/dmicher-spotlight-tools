import assert from "node:assert/strict";

export function validateReleaseManifest(manifest) {
  const moduleId = "dmicher-spotlight-tools";
  const repository = "https://github.com/dkubrow-dev/" + moduleId;
  const version = manifest.version;
  assert.equal(manifest.id, moduleId);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "14");
  assert.equal(manifest.url, repository, "Release repository mismatch");
  assert.equal(manifest.manifest, repository + "/releases/download/" + version + "/module.json",
    "Manifest must point to this exact release");
  assert.equal(manifest.download, repository + "/releases/download/" + version + "/" + moduleId + "-" + version + ".zip",
    "Download must point to this exact release");
  assert.equal(manifest.changelog, repository + "/releases/tag/" + version,
    "Changelog must point to this exact release");

  assert.deepEqual(manifest.relationships?.requires, [{
    id: "dmicher-generics",
    type: "module",
    compatibility: { minimum: "1.0.0" },
    manifest: "https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json"
  }], "The required Generics release must be declared explicitly; third-party modules remain optional");
}
