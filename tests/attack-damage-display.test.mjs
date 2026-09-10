import test from "node:test";
import assert from "node:assert/strict";

import { resolveAttackDamageDisplay } from "../module/utils/attack-damage-display.mjs";
import { addBasicDamageModifier, prepareBasicDamageAttributes } from "../module/utils/basic-damage.mjs";

const attributes = {
  thrust_damage: "1d6-2",
  swing_damage: "1d6",
  thrust_damage_alt: "2d6-1",
  swing_damage_alt: "2d6"
};

test("resolves basic damage aliases and combines their modifiers for display", () => {
  assert.equal(resolveAttackDamageDisplay("GdP+2", attributes), "1d6");
  assert.equal(resolveAttackDamageDisplay("GeB-1", attributes), "1d6-1");
  assert.equal(resolveAttackDamageDisplay("GdPa+1", attributes), "2d6");
  assert.equal(resolveAttackDamageDisplay("GeBa+2", attributes), "2d6+2");
  assert.equal(resolveAttackDamageDisplay("GdBa-1", attributes), "2d6-1");
});

test("supports imported English aliases and the GdB spelling", () => {
  assert.equal(resolveAttackDamageDisplay("thr+1", attributes), "1d6-1");
  assert.equal(resolveAttackDamageDisplay("swing+2", attributes), "1d6+2");
  assert.equal(resolveAttackDamageDisplay("GdB-2", attributes), "1d6-2");
});

test("leaves formulas without a basic damage alias unchanged", () => {
  assert.equal(resolveAttackDamageDisplay("3d6+1", attributes), "3d6+1");
  assert.equal(resolveAttackDamageDisplay("2d6*2", attributes), "2d6*2");
});

test("uses prepared final damage values instead of their bases", () => {
  const layered = {
    thrust_damage: { value: "1d6-2", mod: 1, passive: 2, temp: -1 },
    swing_damage: { value: "1d6", override: "3d6" },
    thrust_damage_alt: { value: "", passive: 1 },
    swing_damage_alt: { value: "" }
  };
  prepareBasicDamageAttributes(layered);
  assert.equal(layered.thrust_damage.final, "1d6");
  assert.equal(layered.swing_damage.final, "3d6");
  assert.equal(layered.thrust_damage_alt.final, "1d6+1");
  assert.equal(layered.swing_damage_alt.final, "3d6");
  assert.equal(resolveAttackDamageDisplay("GdPa+1", layered), "1d6+2");
});

test("normalizes legacy strings and appends modifiers safely to custom formulas", () => {
  const legacy = { thrust_damage: "1d6-2", swing_damage: "1d6", thrust_damage_alt: "", swing_damage_alt: "" };
  prepareBasicDamageAttributes(legacy);
  assert.equal(legacy.thrust_damage.value, "1d6-2");
  assert.equal(legacy.thrust_damage.final, "1d6-2");
  assert.equal(addBasicDamageModifier("2d6+1", -2), "2d6-1");
  assert.equal(addBasicDamageModifier("1d8", 2), "1d8+2");
});