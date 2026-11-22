import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  canUserApplyDamage,
  resolveDamagePoolUpdate
} from "../module/utils/damage-application-guard.mjs";

test("only Foundry GM roles may apply damage", () => {
  assert.equal(canUserApplyDamage({ isGM: true }), true);
  assert.equal(canUserApplyDamage({ isGM: false }), false);
  assert.equal(canUserApplyDamage(null), false);
});

test("ordinary damage and healing retain their exact pool values", () => {
  assert.deepEqual(resolveDamagePoolUpdate({ current: 10, amount: 4, kind: "hp", maximum: 10 }), {
    valid: true, before: 10, amount: 4, after: 6, rawAfter: 6, minimum: -50, clamped: false
  });
  assert.equal(resolveDamagePoolUpdate({ current: -5, amount: 3, heal: true, kind: "hp", maximum: 10 }).after, -2);
});

test("extreme HP damage stops at the automatic-death floor", () => {
  const result = resolveDamagePoolUpdate({ current: 10, amount: 200, kind: "hp", maximum: 10 });
  assert.deepEqual(result, {
    valid: true, before: 10, amount: 200, after: -50, rawAfter: -190, minimum: -50, clamped: true
  });
});

test("other pools remain unrestricted and invalid numeric state is rejected", () => {
  assert.equal(resolveDamagePoolUpdate({ current: 10, amount: 200, kind: "combat-meter", maximum: 10 }).after, -190);
  assert.equal(resolveDamagePoolUpdate({ current: undefined, amount: 2, kind: "hp", maximum: 10 }).valid, false);
  assert.equal(resolveDamagePoolUpdate({ current: null, amount: 2, kind: "hp", maximum: 10 }).valid, false);
  assert.equal(resolveDamagePoolUpdate({ current: 10, amount: Infinity, kind: "hp", maximum: 10 }).valid, false);
  assert.equal(resolveDamagePoolUpdate({ current: 10, amount: -1, kind: "hp", maximum: 10 }).valid, false);
});

test("both damage entry points enforce the same authorization guard", () => {
  const main = readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
  const application = readFileSync(new URL("../scripts/apps/damage-application.js", import.meta.url), "utf8");
  assert.match(main, /if \(!canUserApplyDamage\(game\.user\)\)/);
  assert.match(application, /if \(!canUserApplyDamage\(game\.user\)\)/);
  assert.match(main, /querySelectorAll\?\.\("\.apply-damage-button"\)/);
});
