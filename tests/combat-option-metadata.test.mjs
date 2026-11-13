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

test("GM modifiers expose optional, system-owned combat option metadata", () => {
  assert.deepEqual(systemTemplate.Item.gm_modifier.combat_option, {
    enabled: false,
    kind: "strike",
    maneuver_uuids: [],
    selection_group: "",
    selection_mode: "exclusive",
    reset: "after_roll"
  });
  assert.match(itemTemplate, /name="system\.combat_option\.enabled"/);
  assert.match(itemTemplate, /name="system\.combat_option\.maneuver_uuid_lines"/);
  assert.match(itemTemplate, /name="system\.combat_option\.selection_group"/);
  assert.match(itemTemplate, /name="system\.combat_option\.selection_mode"/);
  assert.match(itemTemplate, /name="system\.combat_option\.reset"/);
  assert.match(itemSheet, /system\.combat_option\.maneuver_uuids/);
});

test("roll prompt resolves preselected combat-option items through its normal context filters", () => {
  assert.match(rollPrompt, /_loadPreselectedModifierItems\(\)/);
  assert.match(rollPrompt, /preselectedModifierItemIds/);
  assert.match(rollPrompt, /item\.type !== "gm_modifier"/);
  assert.match(rollPrompt, /_matchesEffectContext/);
  assert.match(rollPrompt, /matchesRollTags/);
  assert.match(rollPrompt, /isCombatOption: true/);
});

test("combat option configuration is localized in Portuguese and English", () => {
  const keys = ["Enabled", "Hint", "Maneuvers", "ManeuversPlaceholder", "ManeuversHint", "SelectionGroup", "SelectionMode", "Exclusive", "Cumulative", "Reset", "AfterRoll", "Sticky"];
  for (const key of keys) {
    assert.equal(typeof portuguese[`GUM.GMModifier.CombatOption.${key}`], "string");
    assert.equal(typeof english[`GUM.GMModifier.CombatOption.${key}`], "string");
  }
});
