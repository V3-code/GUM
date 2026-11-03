import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRollPrivacy,
  getCurrentRollPrivacyMode,
  normalizeRollPrivacyMode,
  rollPrivacyOptions
} from "../module/utils/roll-privacy.mjs";

test("roll privacy normalizes Foundry 13 and 14 mode names", () => {
  assert.equal(normalizeRollPrivacyMode("public"), "publicroll");
  assert.equal(normalizeRollPrivacyMode("gm"), "gmroll");
  assert.equal(normalizeRollPrivacyMode("blind"), "blindroll");
  assert.equal(normalizeRollPrivacyMode("self"), "selfroll");
  assert.equal(normalizeRollPrivacyMode("gmroll"), "gmroll");
  assert.equal(normalizeRollPrivacyMode("unknown"), "publicroll");
});

test("current privacy reads messageMode when available and legacy rollMode otherwise", () => {
  const modern = { settings: { settings: new Set(["core.messageMode"]), get: () => "blind" } };
  const legacy = { settings: { settings: new Set(), get: () => "selfroll" } };
  assert.equal(getCurrentRollPrivacyMode({ gameRef: modern }), "blindroll");
  assert.equal(getCurrentRollPrivacyMode({ gameRef: legacy }), "selfroll");
});

test("explicit privacy uses the modern ChatMessage API without changing settings", () => {
  const calls = [];
  const chatMessageClass = { applyMode: (data, mode) => { calls.push(mode); return { ...data, applied: mode }; } };
  const source = { content: "roll" };
  const result = applyRollPrivacy(source, "gmroll", { chatMessageClass });
  assert.equal(result.applied, "gm");
  assert.deepEqual(calls, ["gm"]);
  assert.deepEqual(source, { content: "roll" }, "privacy application must not mutate the source chat data");
});

test("privacy fallback produces the expected blind and self recipients", () => {
  const chatMessageClass = { getWhisperRecipients: () => ["gm-user"] };
  const gameRef = { user: { id: "self-user" } };
  assert.deepEqual(
    applyRollPrivacy({ content: "blind" }, "blindroll", { chatMessageClass, gameRef }),
    { content: "blind", whisper: ["gm-user"], blind: true }
  );
  assert.deepEqual(
    applyRollPrivacy({ content: "self" }, "selfroll", { chatMessageClass, gameRef }),
    { content: "self", whisper: ["self-user"] }
  );
});

test("privacy selector exposes one selected accessible option", () => {
  const options = rollPrivacyOptions("blindroll", key => `label:${key}`);
  assert.equal(options.length, 4);
  assert.equal(options.filter(option => option.selected).length, 1);
  assert.equal(options.find(option => option.selected).mode, "blindroll");
  assert.equal(options.find(option => option.mode === "gmroll").icon, "fa-user-secret");
});
