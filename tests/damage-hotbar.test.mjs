import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actorSheet = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const main = readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/actors/characters.hbs", import.meta.url), "utf8");

test("damage controls emit a dedicated hotbar payload", () => {
  assert.match(actorSheet, /type: "GUM\.DamageRoll"/);
  assert.match(actorSheet, /\.rollable-damage, \.rollable-basic-damage/);
  assert.match(main, /data\?\.type === "GUM\.DamageRoll"/);
  assert.match(main, /createGumDamageMacro\(data, slot\)/);
});

test("basic damage shortcuts retain attribute references instead of formulas", () => {
  for (const key of ["thrust_damage", "swing_damage", "thrust_damage_alt", "swing_damage_alt"]) {
    assert.match(template, new RegExp(`data-basic-damage-key="${key}"`));
  }
  assert.match(main, /getBasicDamageFormula\(actor\.system\?\.attributes\?\.\[basicDamageKey\]/);
});

test("item damage shortcuts retain document references and resolve through the normal damage flow", () => {
  assert.match(actorSheet, /itemUuid: item\?\.uuid \|\| null/);
  assert.match(actorSheet, /attackId,/);
  assert.match(main, /return _rollDamageFromChatAction\(\{/);
  assert.match(main, /game\.gum\.damageFromHotbar/);
});
