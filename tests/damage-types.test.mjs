import assert from "node:assert/strict";
import test from "node:test";

import {
  areDamageTypesEquivalent,
  cleanDamageTypeLabel,
  expandDamageTypeKeys,
  formatDamageResistanceKey,
  getDamageResistanceContextModifier,
  getDamageResistanceValue,
  getDamageResistanceTypeModifier,
  normalizeDamageResistanceObject,
  normalizeDamageTypeKey,
  parseDamageResistanceString
} from "../module/utils/damage-types.mjs";

test("normalizes Portuguese, English, abbreviated and legacy damage types", () => {
  const groups = {
    cont: ["cont", "Contusão", "cr", "crush", "crushing", "crusing", "cr ex", "cr dkb"],
    cort: ["cort", "corte", "cut", "cutting"],
    perf: ["perf", "perfuração", "imp", "impaling", "imp inc"],
    pi: ["pi", "pa", "piercing", "perfurante"],
    "pi-": ["pi-", "pa-", "small piercing", "pouco perfurante"],
    "pi+": ["pi+", "pa+", "large piercing", "muito perfurante"],
    "pi++": ["pi++", "pa++", "huge piercing", "extremamente perfurante"],
    qmd: ["qmd", "queimadura", "burn", "burning", "bur", "brn", "cold", "freezing", "fire", "burn ex", "burn, sur"],
    cor: ["cor", "corr", "corrosão", "corrosion"],
    tox: ["tox", "toxina", "toxic"],
    fat: ["fat", "fad", "fadiga", "fatigue"]
  };

  for (const [expected, aliases] of Object.entries(groups)) {
    for (const alias of aliases) assert.equal(normalizeDamageTypeKey(alias), expected, alias);
  }
});

test("preserves source labels while cleaning spaced piercing suffixes", () => {
  assert.equal(cleanDamageTypeLabel("  cr ex "), "cr ex");
  assert.equal(cleanDamageTypeLabel("pi ++"), "pi++");
  assert.equal(cleanDamageTypeLabel("PA +"), "PA+");
  assert.equal(areDamageTypesEquivalent("crushing", "cont"), true);
});

test("equipment DR editing preserves aliases and replaces effective values", () => {
  assert.deepEqual(parseDamageResistanceString("5, 3 cr"), { base: 5, cr: -2 });
  assert.deepEqual(parseDamageResistanceString("5, 3 crushing"), { base: 5, crushing: -2 });
  assert.deepEqual(parseDamageResistanceString("5, 7 small piercing"), { base: 5, "small piercing": 2 });
  assert.deepEqual(parseDamageResistanceString("5, 3 pi ++"), { base: 5, "pi++": -2 });
});

test("resolves RD modifiers stored under any equivalent alias", () => {
  const dr = { base: 6, crushing: -2, cr: 1, cont: 1, cutting: 2, "pa++": -1 };
  assert.equal(getDamageResistanceTypeModifier(dr, "cr"), 1);
  assert.equal(getDamageResistanceTypeModifier(dr, "contusão"), 1);
  assert.equal(getDamageResistanceTypeModifier(dr, "cut"), 2);
  assert.equal(getDamageResistanceTypeModifier(dr, "pi++"), -1);
});

test("does not apply stale synonymous DR keys twice", () => {
  const duplicated = { base: 5, crushing: -2, cont: -2 };
  assert.equal(getDamageResistanceValue(duplicated, "cr"), 3);
});

test("collapses legacy RD aliases into canonical mechanical keys", () => {
  assert.deepEqual(
    normalizeDamageResistanceObject({ base: 6, crushing: -2, cr: 1, "pa+": 2, "pi+": -1, electrical: 3 }),
    { base: 6, cont: -1, "pi+": 1, "nature:electricity": 3 }
  );
});

test("expands compound and exclusion-based GCS DR specializations", () => {
  assert.deepEqual(expandDamageTypeKeys("burning or corrosion"), ["qmd", "cor"]);
  assert.deepEqual(expandDamageTypeKeys("piercing and cutting"), ["cort", "pi-", "pi", "pi+", "pi++"]);
  assert.equal(expandDamageTypeKeys("non-crushing damage type").includes("cont"), false);
  assert.equal(expandDamageTypeKeys("non-crushing damage type").includes("cort"), true);
  assert.equal(normalizeDamageTypeKey("non-burning damage type"), "non-burning damage type");
});

test("applies elemental and custom RD specializations through damage nature", () => {
  const dr = { base: 5, fire: 2, electrical: 3, metal: 4, crushing: -1 };
  assert.deepEqual(expandDamageTypeKeys("nature:fire"), ["nature:fire"]);
  assert.equal(formatDamageResistanceKey("nature:fire"), "fire");
  assert.equal(formatDamageResistanceKey("nature:custom:metal"), "metal");
  assert.equal(getDamageResistanceContextModifier(dr, "burn", { id: "fire" }), 2);
  assert.equal(getDamageResistanceContextModifier(dr, "burn", { id: "electricity" }), 3);
  assert.equal(getDamageResistanceContextModifier(dr, "cr", { id: "custom:metal" }), 3);
  assert.equal(getDamageResistanceContextModifier(dr, "cut", null), 0);
});

test("resolves the displayed DR for every supported imported damage specialization", () => {
  const cases = [
    ["crushing", "cr", 3],
    ["cutting", "cut", 6],
    ["impaling", "imp", 7],
    ["piercing", "pi", 8],
    ["small piercing", "pi-", 9],
    ["large piercing", "pi+", 10],
    ["huge piercing", "pi++", 11],
    ["burning", "burn", 12],
    ["corrosion", "cor", 13],
    ["toxic", "tox", 14],
    ["fatigue", "fat", 15]
  ];

  for (const [storedKey, selectedType, expected] of cases) {
    assert.equal(getDamageResistanceValue({ base: 5, [storedKey]: expected - 5 }, selectedType), expected, storedKey);
  }
  assert.equal(getDamageResistanceValue({ base: 5, fire: 4 }, "burn", { id: "fire" }), 9);
});
