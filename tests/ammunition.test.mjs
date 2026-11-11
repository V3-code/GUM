import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ammunitionAvailableUses, ammunitionLinkCandidates, ammunitionUseState, availableAmmunition, applyAmmunition, ammunitionRollModifier, buildAmmunitionConsumptionUpdate, calculateRapidFireHits, normalizeAmmunitionLoadout, numericRateOfFire, reconcileAmmunitionModifier, resolveRapidFireMaximum, validateAmmunitionLoadout } from "../module/utils/ammunition.mjs";

const main = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
const preparation = fs.readFileSync(new URL("../module/apps/ammunition-preparation.mjs", import.meta.url), "utf8");
const actorSheet = fs.readFileSync(new URL("../templates/actors/characters.hbs", import.meta.url), "utf8");
const actorController = fs.readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const rollPrompt = fs.readFileSync(new URL("../module/apps/roll-prompt.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");

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

test("ammunition consumes Equipment charges when charge mode is active", () => {
    const charged = {
        _source: { system: { quantity: 4, uses_mode: "charges", max_uses: 8, current_uses: 3, ammunition: { enabled: true } } },
        system: { quantity: 99, uses_mode: "quantity", ammunition: { enabled: true } }
    };
    assert.deepEqual(ammunitionUseState(charged), {
        mode: "charges",
        available: 5,
        uses: {
            mode: "charges", baseMax: 8, max: 8, spent: 3, remaining: 5,
            consumeQuantityWhenEmpty: false, reserveType: "", reserveName: "", reserveScope: "any", modeFromModifier: false
        }
    });
    assert.deepEqual(buildAmmunitionConsumptionUpdate(charged, 2).updates, { "system.current_uses": 5 });
    assert.equal(Object.hasOwn(buildAmmunitionConsumptionUpdate(charged, 2).updates, "system.quantity"), false);
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
    assert.match(preparation, /name="ignoreCadence"/);
    assert.match(main, /!choice\.ignoreCadence && amount > numericCadence/);
    assert.match(preparation, /ammunitionAvailable: available/);
});

test("normalizes and validates a saved ammunition loadout", () => {
    const ammo = { id: "arrow", system: { quantity: 3, ammunition: { enabled: true } } };
    const actor = { items: new Map([[ammo.id, ammo]]) };
    const attack = { rof: "2", ammunition_ids: [ammo.id] };
    assert.deepEqual(normalizeAmmunitionLoadout({ ammunitionId: ammo.id, shots: "2", locked: true }), {
        ammunitionId: ammo.id, shots: 2, ignoreCadence: false, locked: true
    });
    assert.equal(validateAmmunitionLoadout(actor, attack, { ammunitionId: ammo.id, shots: 2 }).valid, true);
    assert.equal(validateAmmunitionLoadout(actor, attack, { ammunitionId: ammo.id, shots: 3 }).reason, "cadence");
    assert.equal(validateAmmunitionLoadout(actor, attack, { ammunitionId: ammo.id, shots: 4, ignoreCadence: true }).reason, "insufficient");
});

test("prepares ammunition before the roll prompt and exposes a compact locked loadout card", () => {
    assert.match(preparation, /ammunitionPrepared: true/);
    assert.match(preparation, /ammunition_loadout/);
    assert.match(preparation, /gum-ammo-choice-card/);
    assert.match(actorSheet, /configure-attack-ammunition/);
    assert.match(actorSheet, /toggle-attack-ammunition-lock/);
    assert.match(actorSheet, /attack-ammunition-inline/);
    assert.match(actorSheet, /PreparedShots/);
    assert.match(actorSheet, /AvailableReserve/);
    assert.match(actorSheet, /fa-crosshairs/);
    assert.match(actorSheet, /fa-layer-group/);
    assert.match(actorSheet, /fa-bolt/);
    assert.match(actorController, /applyAmmunition/);
    assert.match(actorController, /ammunitionDamageText/);
    assert.match(styles, /toggle-attack-ammunition-lock[\s\S]*?border-left:/);
    assert.doesNotMatch(actorSheet, /attack-ammunition-(?:pill|bar)/);
    assert.match(actorController, /await prepareAmmunitionRollData\(this\.actor, this\._getRollDataFromElement\(element\)\)/);
    assert.match(rollPrompt, /showAmmunitionSelection = this\.ammunitionOptions\.length > 0 && this\.rollData\.ammunitionPrepared !== true/);
    assert.doesNotMatch(main, /gum-ammo-confirm-choice/);
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
