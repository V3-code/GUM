import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actorSheetSource = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const damageRowSource = actorSheetSource.match(/const damageRow[\s\S]+?const content/)?.[0] ?? "";

test("basic damage temporary modifiers are read-only in the secondary editor", () => {
  assert.doesNotMatch(damageRowSource, /name="\$\{key\}\.temp"/);
  assert.match(damageRowSource, /Modificadores temporários são controlados por efeitos/);
});

test("basic damage points are editable, saved, and included in the points summary", () => {
  assert.match(damageRowSource, /name="\$\{key\}\.points"/);
  assert.match(actorSheetSource, /"thrust_damage\.points"/);
  assert.match(actorSheetSource, /"thrust_damage", "swing_damage", "thrust_damage_alt", "swing_damage_alt"/);
});