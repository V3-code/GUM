import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [systemTemplate, itemTemplate, itemSheet, rollPrompt, portuguese, english] = await Promise.all([
  readFile(new URL("../template.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../templates/items/item-sheet.hbs", import.meta.url), "utf8"),
  readFile(new URL("../module/item/gurps-item-sheet.js", import.meta.url), "utf8"),
  readFile(new URL("../module/apps/roll-prompt.js", import.meta.url), "utf8"),
  readFile(new URL("../lang/pt-BR.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../lang/en.json", import.meta.url), "utf8").then(JSON.parse)
]);

test("GM modifiers remain independent from HUD execution-option metadata", () => {
  assert.equal(systemTemplate.Item.gm_modifier.combat_option, undefined);
  assert.doesNotMatch(itemTemplate, /system\.combat_option/);
  assert.doesNotMatch(itemSheet, /system\.combat_option/);
});

test("roll prompt resolves generic preselected modifier items through its normal context filters", () => {
  assert.match(rollPrompt, /_loadPreselectedModifierItems\(\)/);
  assert.match(rollPrompt, /preselectedModifierItemIds/);
  assert.match(rollPrompt, /item\.type !== "gm_modifier"/);
  assert.match(rollPrompt, /_matchesEffectContext/);
  assert.match(rollPrompt, /matchesRollTags/);
  assert.match(rollPrompt, /isPreselectedItem: true/);
  assert.doesNotMatch(rollPrompt, /combat_option/);
});

test("GUM translations do not retain HUD-specific modifier fields", () => {
  assert.equal(Object.keys(portuguese).some(key => key.startsWith("GUM.GMModifier.CombatOption.")), false);
  assert.equal(Object.keys(english).some(key => key.startsWith("GUM.GMModifier.CombatOption.")), false);
});
