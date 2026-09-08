import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const characterTemplate = readFileSync(new URL("../templates/actors/characters.hbs", import.meta.url), "utf8");
const itemTemplate = readFileSync(new URL("../templates/items/item-sheet.hbs", import.meta.url), "utf8");
const itemSheet = readFileSync(new URL("../module/item/gurps-item-sheet.js", import.meta.url), "utf8");
const rollPrompt = readFileSync(new URL("../module/apps/roll-prompt.js", import.meta.url), "utf8");
const itemStyles = readFileSync(new URL("../styles/item-sheet.css", import.meta.url), "utf8");
const systemTemplate = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));

test("spell and power attack rolls expose the configured attack base to the prompt", () => {
  const attackLinks = characterTemplate.match(/<a class="rollable spell-meta-value"[^>]+data-type="attack"[^>]+>/g) || [];

  assert.equal(attackLinks.length, 3);
  for (const link of attackLinks) {
    assert.match(link, /data-attribute-key="\{\{this\.system\.attack_roll\.skill_name\}\}"/);
  }
});

test("spell and power sheets provide type-specific attack statistics", () => {
  assert.equal((itemTemplate.match(/data-attack-fields="melee"/g) || []).length, 2);
  assert.equal((itemTemplate.match(/data-attack-fields="ranged"/g) || []).length, 2);
  assert.equal((itemTemplate.match(/name="system\.attack_roll\.min_strength"/g) || []).length, 2,
    "each spell/power form must submit ST Mínima only once");

  for (const field of ["reach", "parry", "min_strength", "accuracy", "range", "rof", "shots", "bulk", "rcl"]) {
    assert.match(itemTemplate, new RegExp(`name="system\\.attack_roll\\.${field}"`));
    assert.ok(Object.hasOwn(systemTemplate.Item.spell.attack_roll, field));
    assert.ok(Object.hasOwn(systemTemplate.Item.power.attack_roll, field));
  }

  assert.match(itemSheet, /fields\.find\('input, select'\)\.prop\('disabled', !usesAttack \|\| !isActiveType\)/);
  assert.match(itemSheet, /String\(value \?\? ""\)\.split\(","\)/);
  assert.match(itemSheet, /formData\[attackMinStrengthPath\] = this\._normalizeAttackMinStrength/);
});

test("roll prompt treats a spell or power attack configuration as its attack context", () => {
  assert.equal((rollPrompt.match(/\["spell", "power"\]\.includes\(item\.type\) && item\.system\?\.uses_attack/g) || []).length, 2);
  assert.match(rollPrompt, /attack: item\.system\.attack_roll \|\| null/);
});

test("attack cards share one complete four-column grid", () => {
  assert.match(itemStyles, /spell-power-result-grid\.spell-power-attack-grid \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(itemStyles, /spell-power-attack-type-fields \{[\s\S]*display: contents/);
  assert.match(itemStyles, /@media \(max-width: 520px\)[\s\S]*spell-power-result-grid\.spell-power-attack-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});