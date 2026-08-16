import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};

const { ActiveRequestsController } = await import("../dmicher-spotlight-tools/scripts/tools/requests/active-requests-controller.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("active requests environment action uses the normal stop submission pipeline", async () => {
  const submitted = [];
  const controller = new ActiveRequestsController({
    resolveRequest() {},
    submitRequest: async (type) => {
      submitted.push(type);
      return "submitted";
    }
  });

  assert.equal(await controller.submitEnvironmentRequest(), "submitted");
  assert.deepEqual(submitted, ["stop"]);
});

test("active requests footer places reset before environment and clear", () => {
  const template = fs.readFileSync(
    path.join(ROOT, "dmicher-spotlight-tools", "templates", "requests", "active-requests.hbs"),
    "utf8"
  );
  const reset = template.indexOf('data-active-request-action="reset-timeouts"');
  const environment = template.indexOf('data-active-request-action="environment"');
  const clear = template.indexOf('data-active-request-action="clear"');
  assert.ok(reset >= 0);
  assert.ok(environment > reset);
  assert.ok(clear > environment);
});
