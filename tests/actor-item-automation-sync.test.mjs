import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");

test("actor-level synchronization covers every automation normally initialized by createItem", () => {
  const start = main.indexOf("async function syncActorItemAutomations");
  const end = main.indexOf("function _matchesCombatModifierEntry", start);
  const synchronizer = start >= 0 && end > start ? main.slice(start, end) : "";
  assert.match(synchronizer, /ensureEffectItemBridge\(item\)/);
  assert.match(synchronizer, /syncPassiveItemEffects\(item/);
  assert.match(synchronizer, /syncEquipmentModifierGrantedEffects\(item\)/);
  assert.match(synchronizer, /syncItemStateEffects\(item/);
  assert.match(synchronizer, /processConditions\(actor\)/);
  assert.match(synchronizer, /processStatusBindings\(actor\)/);
});

test("createItem and updateItem share the passive synchronization service", () => {
  const calls = main.match(/syncPassiveItemEffects\(item/g) || [];
  assert.ok(calls.length >= 3, "actor creation, Item creation, and Item updates must use the same service");
  assert.doesNotMatch(main, /const passiveEffectLinks = Object\.values\(item\.system\.passiveEffects/);
});

test("world startup repairs missing passive effects without using the initial-application mode", () => {
  const start = main.indexOf("async function reconcileAllPassiveItemEffects");
  const end = main.indexOf("function _matchesCombatModifierEntry", start);
  const reconciler = start >= 0 && end > start ? main.slice(start, end) : "";
  assert.match(reconciler, /isPrimaryActiveGM\(\)/);
  assert.match(reconciler, /mode: "reconcile"/);
  assert.match(main, /await reconcileAllPassiveItemEffects\(\)/);
});
