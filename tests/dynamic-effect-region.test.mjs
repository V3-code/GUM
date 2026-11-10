import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR,
  buildDynamicRegionData,
  isDynamicRegionTarget,
  normalizeDynamicEffectRegion,
  reconcileDynamicEffectRegions
} from "../module/services/dynamic-effect-region-service.mjs";

test("normalizes Dynamic Region settings in Scene distance units", () => {
  assert.deepEqual(normalizeDynamicEffectRegion({
    enabled: true,
    shape: "circle",
    range: "5",
    targetMode: "enemies",
    excludeSelf: true,
    instantTrigger: "turn_start",
    gridBased: true,
    showColor: true,
    color: "#abcdef"
  }), {
    enabled: true,
    shape: "circle",
    range: 5,
    targetMode: "enemies",
    excludeSelf: true,
    instantTrigger: "turn_start",
    gridBased: true,
    showColor: true,
    color: "#abcdef"
  });
  assert.equal(normalizeDynamicEffectRegion({ range: 0 }, { defaultRange: 3 }).range, 3);
});

test("filters self, allies, and enemies by Token disposition", () => {
  const actor = { id: "source" };
  const sourceToken = { uuid: "Scene.s.Token.source", actor, disposition: 1 };
  const self = { uuid: sourceToken.uuid, actor, disposition: 1 };
  const ally = { uuid: "Scene.s.Token.ally", actor: { id: "ally" }, disposition: 1 };
  const enemy = { uuid: "Scene.s.Token.enemy", actor: { id: "enemy" }, disposition: -1 };
  assert.equal(isDynamicRegionTarget({ token: self, sourceToken }), true);
  assert.equal(isDynamicRegionTarget({ token: self, sourceToken, excludeSelf: true }), false);
  assert.equal(isDynamicRegionTarget({ token: ally, sourceToken, targetMode: "allies" }), true);
  assert.equal(isDynamicRegionTarget({ token: enemy, sourceToken, targetMode: "allies" }), false);
  assert.equal(isDynamicRegionTarget({ token: enemy, sourceToken, targetMode: "enemies" }), true);
});

test("builds official attached-emantion Region data with a GUM behavior", () => {
  const data = buildDynamicRegionData({
    controllerEffect: { uuid: "Actor.a.ActiveEffect.controller", name: "Aura" },
    effectItem: { uuid: "Item.controller", name: "Escudo Arcano" },
    token: { uuid: "Scene.s.Token.t", name: "Mago" },
    config: { enabled: true, range: 4, targetMode: "allies", instantTrigger: "turn_start" },
    constRef: { REGION_EVENTS: { TOKEN_ENTER: "tokenEnter", TOKEN_EXIT: "tokenExit", TOKEN_TURN_START: "tokenTurnStart" } }
  });
  assert.equal(data.behaviors[0].type, GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR);
  assert.deepEqual(data.behaviors[0].system.events, ["tokenEnter", "tokenExit", "tokenTurnStart"]);
  assert.equal(data.behaviors[0].system.effectUuid, "Item.controller");
  assert.deepEqual(data.behaviors[0].system.actionIds, []);
  assert.equal(data.behaviors[0].system.excludeSelf, false);
  assert.equal(data.behaviors[0].system.instantTrigger, "turn_start");
  assert.equal(data.flags.gum.dynamicEffectRegion.sourceTokenUuid, "Scene.s.Token.t");
});

test("reconciles an attached circle with radius measured from the token center", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const effectItem = {
    uuid: "Item.controller",
    name: "Aura",
    type: "effect",
    system: {
      dynamicRegion: {
        enabled: true,
        shape: "circle",
        range: 3,
        targetMode: "all"
      },
      actions: [{ id: "action-1" }]
    }
  };
  globalThis.fromUuid = async uuid => uuid === effectItem.uuid ? effectItem : null;
  try {
    const controller = {
      uuid: "Actor.a.ActiveEffect.controller",
      disabled: false,
      flags: { gum: { effectUuid: effectItem.uuid, lifecycleCarrier: true, dynamicRegionController: true } }
    };
    const actor = { name: "Mago", effects: [controller] };
    const scene = { grid: { distance: 1, size: 100 }, dimensions: { distancePixels: 100 }, tokens: [], regions: [] };
    const token = { id: "t", uuid: "Scene.s.Token.t", name: "Mago", actor, persisted: true, parent: scene, _source: { x: 100, y: 200, width: 1, height: 1, depth: 1, elevation: 0, level: "ground" }, getCenterPoint: () => ({ x: 150, y: 250 }) };
    const grantedEffect = {
      uuid: "Actor.b.ActiveEffect.grant",
      disabled: false,
      flags: { gum: { effectUuid: effectItem.uuid, lifecycleCarrier: true, dynamicRegionController: false, dynamicRegionGrant: { sourceUuid: "Scene.s.Region.r" } } }
    };
    const recipient = { id: "recipient", uuid: "Scene.s.Token.recipient", actor: { effects: [grantedEffect] }, parent: scene };
    scene.tokens.push(token, recipient);
    const calls = [];
    const regionClass = {
      create: async (...args) => (calls.push(args), { id: "region" })
    };
    const gm = { id: "gm", active: true, isGM: true };
    const results = await reconcileDynamicEffectRegions({
      gameRef: { user: gm, users: [gm], scenes: [scene] },
      scene,
      regionClass
    });
    assert.equal(results.length, 1);
    assert.equal(calls.length, 1, "a granted Active Effect must never emit another Region");
    assert.equal(calls[0][0].shapes[0].type, "circle");
    assert.equal(calls[0][0].shapes[0].x, 150);
    assert.equal(calls[0][0].shapes[0].y, 250);
    assert.equal(calls[0][0].shapes[0].radius, 300);
    assert.equal(calls[0][0].attachment.token, token.id);
    assert.equal(calls[0][0].behaviors[0].system.effectUuid, effectItem.uuid);
    assert.deepEqual(calls[0][0].behaviors[0].system.actionIds, []);
  } finally {
    if (previousFromUuid === undefined) delete globalThis.fromUuid;
    else globalThis.fromUuid = previousFromUuid;
  }
});

test("declares and exposes the Emanation Item Effect interface", async () => {
  const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  const template = await readFile(new URL("../templates/items/effect-sheet.hbs", import.meta.url), "utf8");
  const controller = await readFile(new URL("../scripts/apps/effect-sheet.js", import.meta.url), "utf8");
  const engine = await readFile(new URL("../scripts/effects-engine.js", import.meta.url), "utf8");
  assert.equal(GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR, "applyEffect");
  assert.deepEqual(manifest.documentTypes?.RegionBehavior?.applyEffect, {});
  assert.match(template, /data-tab="emanacao"/);
  assert.match(template, /system\.dynamicRegion\.range/);
  assert.match(template, /system\.dynamicRegion\.excludeSelf/);
  assert.match(template, /system\.dynamicRegion\.instantTrigger/);
  assert.doesNotMatch(template, /system\.dynamicRegion\.actionIds/);
  assert.doesNotMatch(template, /select-dynamic-region-actions/);
  assert.doesNotMatch(template, /system\.actions\.\{\{action\.index\}\}\.delivery/);
  assert.match(engine, /hasDynamicRegionController/);
  assert.doesNotMatch(engine, /reservesActionsForDynamicRegion/);
  assert.match(engine, /dynamicRegionGrant/);
  assert.match(engine, /dynamicAction = \{ id: "dynamic-region", type: "dynamic_region" \}/);
});
