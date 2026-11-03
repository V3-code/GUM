import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ammunitionAvailableUses, ammunitionLinkCandidates, availableAmmunition, applyAmmunition, ammunitionRollModifier, calculateRapidFireHits, numericRateOfFire, reconcileAmmunitionModifier, resolveRapidFireMaximum } from "../module/utils/ammunition.mjs";

const main = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");

test("an equipment item can link itself as ammunition for its own ranged attack", () => {
    const hybrid = { id: "thrown-weapon", system: { quantity: 3, ammunition: { enabled: true } } };
    const ordinary = { id: "ordinary", system: { quantity: 1, ammunition: { enabled: false } } };
    const actor = { items: new Map([[hybrid.id, hybrid], [ordinary.id, ordinary]]) };

    assert.deepEqual(ammunitionLinkCandidates(actor).map(item => item.id), [hybrid.id]);
    assert.deepEqual(availableAmmunition(actor, { ammunition_ids: [hybrid.id] }).map(item => item.id), [hybrid.id]);
});

test("self-linked ammunition resolves the persisted charge mode instead of stale prepared data", () => {
    const hybrid = {
        id: "rechargeable-weapon",
        _source: { system: { quantity: 1, uses_mode: "charges", max_uses: 8, current_uses: 3, ammunition: { enabled: true } } },
        system: {
            ammunition: { enabled: true },
            equipmentResolution: { uses: { mode: "quantity", max: 1, remaining: 1 } }
        }
    };

    assert.equal(ammunitionAvailableUses(hybrid), 5);
});

test("rapid-fire hits use full recoil multiples and never exceed shots fired", () => {
    assert.deepEqual(calculateRapidFireHits({ isSuccess: true, margin: 5, recoil: 2, shotsFired: 4 }), {
        shotsFired: 4, recoil: 2, hits: 3, isCriticalSuccess: false
    });
    assert.equal(calculateRapidFireHits({ isSuccess: true, margin: 20, recoil: 2, shotsFired: 4 }).hits, 4);
    assert.equal(calculateRapidFireHits({ isSuccess: false, margin: 8, recoil: 2, shotsFired: 4 }).hits, 0);
    assert.equal(calculateRapidFireHits({ isSuccess: true, margin: 8, recoil: 2, shotsFired: 1 }), null);
});

test("critical rapid fire hits with every shot and rate of fire accepts only simple positive integers", () => {
    assert.equal(calculateRapidFireHits({ isSuccess: true, isCriticalSuccess: true, margin: 0, recoil: 3, shotsFired: 6 }).hits, 6);
    assert.equal(numericRateOfFire("6"), 6);
    assert.equal(numericRateOfFire("3x9"), null);
    assert.equal(numericRateOfFire("0"), null);
});

test("ignoring weapon rate of fire keeps the ammunition limit", () => {
    assert.equal(resolveRapidFireMaximum({ cadence: 3, ammunitionAvailable: 8 }), 3);
    assert.equal(resolveRapidFireMaximum({ cadence: 3, ammunitionAvailable: 8, ignoreCadence: true }), 8);
    assert.equal(resolveRapidFireMaximum({ cadence: 3, ignoreCadence: true }), null);
});

test("ranged confirmation offers a per-attack rate-of-fire override", () => {
    assert.match(main, /name="ignoreCadence"/);
    assert.match(main, /!choice\.ignoreCadence && amount > numericCadence/);
    assert.match(main, /ammunitionAvailable: selected \? ammunitionAvailableUses\(selected\) : null/);
});

test("only linked, available ammunition can be selected", () => {
    const items = new Map([
        ["ready", { id: "ready", system: { quantity: 3, location: "carried", ammunition: { enabled: true } } }],
        ["stored", { id: "stored", system: { quantity: 5, stored: true, ammunition: { enabled: true } } }],
        ["empty", { id: "empty", system: { quantity: 0, ammunition: { enabled: true } } }],
        ["ordinary", { id: "ordinary", system: { quantity: 2, ammunition: { enabled: false } } }]
    ]);
    assert.deepEqual(availableAmmunition({ items }, { ammunition_ids: [...items.keys()] }).map(item => item.id), ["ready"]);
});

test("ammunition changes a copy of the attack damage profile", () => {
    const base = { main: { formula: "2d6", type: "perf", armor_divisor: 1 }, follow_up: { formula: "" }, fragmentation: { formula: "" } };
    const ammo = { system: { ammunition: {
        attack_modifier: -2,
        main: { formula: "1d6", operation: "add", type: "cort", armor_divisor: 2, divisor_operation: "multiply" },
        follow_up: { formula: "1d6", operation: "replace" }
    } } };
    const result = applyAmmunition(base, ammo);
    assert.deepEqual(result.main, { formula: "(2d6)+(1d6)", type: "cort", armor_divisor: 2 });
    assert.equal(result.follow_up.formula, "1d6");
    assert.equal(base.main.type, "perf");
    assert.equal(ammunitionRollModifier(ammo), -2);
});

test("changing or removing ammunition in confirmation applies the chosen modifier once", () => {
    assert.equal(reconcileAmmunitionModifier(4, -1, 2, true), 1);
    assert.equal(reconcileAmmunitionModifier(4, 0, 2, true), 2);
    assert.equal(reconcileAmmunitionModifier(2, -1, 0, false), 1);
});
