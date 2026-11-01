import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { composeRollModifiers } from "../module/utils/roll-modifier-composition.mjs";

test("ungrouped and additive roll modifiers preserve legacy stacking", () => {
  const result = composeRollModifiers([
    { id: "a", value: -8 },
    { id: "b", value: -8, compositionGroup: "smoke", compositionMode: "sum" }
  ]);
  assert.deepEqual(result.map(entry => entry.id), ["a", "b"]);
});

test("worst composition prevents self and target smoke penalties from duplicating", () => {
  const result = composeRollModifiers([
    { id: "self", value: -8, compositionGroup: "visibility.smoke", compositionMode: "worst" },
    { id: "target", value: -8, compositionGroup: "visibility.smoke", compositionMode: "worst" }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, -8);
  assert.equal(result[0].compositionSourceCount, 2);
  assert.equal(result[0].compositionSuppressedCount, 1);
});

test("one explicit group policy also covers participants left at the additive default", () => {
  const result = composeRollModifiers([
    { id: "self", value: -8, compositionGroup: "visibility.smoke", compositionMode: "worst" },
    { id: "target", value: -8, compositionGroup: "visibility.smoke", compositionMode: "sum" }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, -8);
});

test("composition supports best, priority and once-per-origin policies", () => {
  assert.equal(composeRollModifiers([
    { id: "a", value: 1, compositionGroup: "aid", compositionMode: "best" },
    { id: "b", value: 3, compositionGroup: "aid", compositionMode: "best" }
  ])[0].value, 3);
  assert.equal(composeRollModifiers([
    { id: "a", value: -8, compositionGroup: "fog", compositionMode: "priority", compositionPriority: 1 },
    { id: "b", value: -3, compositionGroup: "fog", compositionMode: "priority", compositionPriority: 2 }
  ])[0].id, "b");
  assert.deepEqual(composeRollModifiers([
    { id: "a", value: -8, compositionGroup: "fog", compositionMode: "once_per_origin", compositionOrigin: "region-1" },
    { id: "b", value: -4, compositionGroup: "fog", compositionMode: "once_per_origin", compositionOrigin: "region-1" },
    { id: "c", value: -2, compositionGroup: "fog", compositionMode: "once_per_origin", compositionOrigin: "region-2" }
  ]).map(entry => entry.id), ["a", "c"]);
});

test("Effect Item editing and both roll paths carry composition metadata", () => {
  const sheet = fs.readFileSync(new URL("../scripts/apps/effect-sheet.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/items/effect-sheet.hbs", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("../scripts/effects-engine.js", import.meta.url), "utf8");
  const prompt = fs.readFileSync(new URL("../module/apps/roll-prompt.js", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
  for (const field of ["composition_group", "composition_mode", "composition_priority"]) {
    assert.match(sheet, new RegExp(field));
    assert.match(template, new RegExp(field));
    assert.match(engine, new RegExp(field));
  }
  assert.match(prompt, /composeRollModifiers\(this\.selectedModifiers\)/);
  assert.match(main, /composeRollModifiers\(\[\.\.\.effectMods, \.\.\.counterEffectMods\]/);
});
