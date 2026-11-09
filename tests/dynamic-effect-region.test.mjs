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
    range: "5",
    actionIds: ["action-1", "action-1", "action-2"],
    targetMode: "enemies",
    includeSelf: true,
    gridBased: true,
    showColor: true,
    color: "#abcdef"
  }), {
    enabled: true,
    range: 5,
    actionIds: ["action-1", "action-2"],
    targetMode: "enemies",
    includeSelf: true,
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
  assert.equal(isDynamicRegionTarget({ token: self, sourceToken, includeSelf: false }), false);
  assert.equal(isDynamicRegionTarget({ token: self, sourceToken, includeSelf: true }), true);
  assert.equal(isDynamicRegionTarget({ token: ally, sourceToken, targetMode: "allies" }), true);
  assert.equal(isDynamicRegionTarget({ token: enemy, sourceToken, targetMode: "allies" }), false);
  assert.equal(isDynamicRegionTarget({ token: enemy, sourceToken, targetMode: "enemies" }), true);
});

test("builds official attached-emantion Region data with a GUM behavior", () => {
  const data = buildDynamicRegionData({
    controllerEffect: { uuid: "Actor.a.ActiveEffect.controller", name: "Aura" },
    effectItem: { uuid: "Item.controller", name: "Escudo Arcano" },
    token: { uuid: "Scene.s.Token.t", name: "Mago" },
    config: { enabled: true, range: 4, actionIds: ["shield", "light"], targetMode: "allies" },
    constRef: { REGION_EVENTS: { TOKEN_ENTER: "tokenEnter", TOKEN_EXIT: "tokenExit" } }
  });
  assert.equal(data.behaviors[0].type, GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR);
  assert.deepEqual(data.behaviors[0].system.events, ["tokenEnter", "tokenExit"]);
  assert.equal(data.behaviors[0].system.effectUuid, "Item.controller");
  assert.deepEqual(data.behaviors[0].system.actionIds, ["shield", "light"]);
  assert.equal(data.flags.gum.dynamicEffectRegion.sourceTokenUuid, "Scene.s.Token.t");
});

test("reconciles an attached emanation through RegionDocument.createTokenEmanation", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const effectItem = {
    uuid: "Item.controller",
    name: "Aura",
    type: "effect",
    system: {
      dynamicRegion: {
        enabled: true,
        range: 3,
        actionIds: [],
        targetMode: "all"
      },
      actions: [{ id: "action-1", delivery: "dynamic_region" }]
    }
  };
  globalThis.fromUuid = async uuid => uuid === effectItem.uuid ? effectItem : null;
  try {
    const controller = {
      uuid: "Actor.a.ActiveEffect.controller",
      disabled: false,
      flags: { gum: { effectUuid: effectItem.uuid, lifecycleCarrier: true } }
    };
    const actor = { name: "Mago", effects: [controller] };
    const token = { uuid: "Scene.s.Token.t", name: "Mago", actor, persisted: true };
    const scene = { grid: { distance: 1 }, tokens: [token], regions: [] };
    const calls = [];
    const regionClass = {
      createTokenEmanation: async (...args) => (calls.push(args), { id: "region" })
    };
    const gm = { id: "gm", active: true, isGM: true };
    const results = await reconcileDynamicEffectRegions({
      gameRef: { user: gm, users: [gm], scenes: [scene] },
      scene,
      regionClass
    });
    assert.equal(results.length, 1);
    assert.equal(calls[0][0], token);
    assert.equal(calls[0][1], 3);
    assert.equal(calls[0][2].behaviors[0].system.effectUuid, effectItem.uuid);
    assert.deepEqual(calls[0][2].behaviors[0].system.actionIds, ["action-1"]);
    assert.equal(calls[0][3].gridBased, false);
  } finally {
    if (previousFromUuid === undefined) delete globalThis.fromUuid;
    else globalThis.fromUuid = previousFromUuid;
  }
});

test("declares and exposes the Dynamic Region Item Effect interface", async () => {
  const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  const template = await readFile(new URL("../templates/items/effect-sheet.hbs", import.meta.url), "utf8");
  const controller = await readFile(new URL("../scripts/apps/effect-sheet.js", import.meta.url), "utf8");
  const engine = await readFile(new URL("../scripts/effects-engine.js", import.meta.url), "utf8");
  assert.equal(GUM_DYNAMIC_EFFECT_REGION_BEHAVIOR, "applyEffect");
  assert.deepEqual(manifest.documentTypes?.RegionBehavior?.applyEffect, {});
  assert.match(template, /data-tab="regiao-dinamica"/);
  assert.match(template, /system\.dynamicRegion\.range/);
  assert.match(template, /system\.actions\.\{\{action\.index\}\}\.delivery/);
  assert.doesNotMatch(template, /select-dynamic-region-actions|payloadEffectUuid/);
  assert.match(engine, /hasDynamicRegionController/);
  assert.match(engine, /reservesActionsForDynamicRegion/);
  assert.match(engine, /actionType = dynamicAction\.type/);
});
