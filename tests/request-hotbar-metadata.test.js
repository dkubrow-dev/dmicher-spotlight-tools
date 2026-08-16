import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHotbarMacroCommand
} from "../dmicher-spotlight-tools/scripts/tools/hotbar-macro.js";
import { RequestHotbar } from "../dmicher-spotlight-tools/scripts/tools/requests/request-hotbar.js";

test("request chat macros execute with ownership comments attached", () => {
  const submitted = [];
  const hotbar = new RequestHotbar((type) => submitted.push(type));
  const command = buildHotbarMacroCommand("/dmicher-spotlight-tools-request urgent", {
    ownerId: "user-1",
    ownerName: "Alice",
    createdAt: "2026-08-16T12:00:00.000Z",
    ownerLabel: "Player",
    createdLabel: "Created"
  });

  assert.equal(hotbar.handleChatMessage(null, command), false);
  assert.deepEqual(submitted, ["urgent"]);
});
