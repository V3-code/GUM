import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GUM_MATT_EFFECT_ACTION,
  GUM_REGION_EFFECT_BEHAVIOR,
  applySceneEffect,
  buildRegionEffectEventData,
  buildSceneEffectTargets,
  createGumEffectRegionBehaviorType,
  ensureDynamicRegionIndicator,
  removeRegionAppliedEffects,
  registerGumRegionEffectBehavior,
  registerMonksActiveTilesEffectAction
} from "../module/integrations/scene-effect-integration.mjs";

test("removes only the departing Region owner from overlapping dynamic grants", async () => {
  const previousFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object)
    }
  };
  const updates = [];
  const effect = {
    id: "grant",
    flags: { gum: {
      effectUuid: "Item.aura",
      dynamicRegionGrant: { sourceUuid: "Region.one", sourceUuids: ["Region.one", "Region.two"] },
      sceneTrigger: { sourceUuid: "Region.one" }
    } },
    update: async data => updates.push(data)
  };
  const deleted = [];
  const grantActor = {
    effects: [effect],
    deleteEmbeddedDocuments: async (_type, ids) => deleted.push(...ids)
  };
  try {
    await removeRegionAppliedEffects(grantActor, { regionUuid: "Region.one", effectUuid: "Item.aura" });
    assert.equal(deleted.length, 0);
    assert.deepEqual(updates[0]["flags.gum.dynamicRegionGrant.sourceUuids"], ["Region.two"]);
    assert.equal(updates[0]["flags.gum.sceneTrigger.sourceUuid"], "Region.two");

    effect.flags.gum.dynamicRegionGrant = { sourceUuid: "Region.two", sourceUuids: ["Region.two"] };
    effect.flags.gum.sceneTrigger.sourceUuid = "Region.two";
    await removeRegionAppliedEffects(grantActor, { regionUuid: "Region.two", effectUuid: "Item.aura" });
    assert.deepEqual(deleted, ["grant"]);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry;
    else globalThis.foundry = previousFoundry;
  }
});

const actor = { id: "actor-1", uuid: "Actor.actor-1", documentName: "Actor", name: "Alvo" };
const tokenDocument = {
  id: "token-1",
  uuid: "Scene.scene-1.Token.token-1",
  documentName: "Token",
  name: "Token Alvo",
  actor,
  parent: { uuid: "Scene.scene-1" }
};

test("adapts and deduplicates scene entities as GUM effect targets", () => {
  const targets = buildSceneEffectTargets([tokenDocument, tokenDocument, actor]);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].actor, actor);
  assert.equal(targets[0].document, tokenDocument);
  assert.equal(targets[1].document.uuid, actor.uuid);
});

test("applies only GUM Effect Items through the public API", async () => {
  const effect = { uuid: "Item.effect-1", name: "Fogo", type: "effect", documentName: "Item" };
  const calls = [];
  const api = {
    items: { resolve: async reference => (calls.push(["resolve", reference]), effect) },
    effects: { apply: async (...args) => (calls.push(["apply", ...args]), "applied") }
  };
  const context = { mode: "region" };
  const result = await applySceneEffect({ api, effectReference: effect.uuid, entities: [tokenDocument], context });
  assert.equal(result.result, "applied");
  assert.equal(calls[1][1], effect);
  assert.equal(calls[1][2][0].actor, actor);
  assert.equal(calls[1][3].mode, context.mode);
  assert.equal(calls[1][3].origin, effect);

  api.items.resolve = async () => ({ name: "Espada", type: "equipment", documentName: "Item" });
  await assert.rejects(
    () => applySceneEffect({ api, effectReference: "Item.wrong", entities: [tokenDocument] }),
    /não é um Item Efeito GUM/
  );
});

test("normalizes Region event context without retaining Foundry documents", () => {
  const region = { uuid: "Scene.scene-1.Region.region-1", parent: { uuid: "Scene.scene-1" } };
  const data = buildRegionEffectEventData({
    name: "tokenEnter",
    data: {
      token: tokenDocument,
      origin: { x: 1, y: 2, elevation: 0 },
      destination: { x: 3, y: 4, elevation: 1 },
      movement: { method: "dragging" }
    }
  }, { region });
  assert.deepEqual(data, {
    type: "tokenEnter",
    source: "region",
    regionUuid: region.uuid,
    sceneUuid: region.parent.uuid,
    tokenUuid: tokenDocument.uuid,
    actorUuid: actor.uuid,
    origin: { x: 1, y: 2, elevation: 0 },
    destination: { x: 3, y: 4, elevation: 1 },
    movementMethod: "dragging",
    forced: false,
    teleport: false
  });
});

test("registers the GUM Region behavior and its schema", () => {
  assert.equal(GUM_REGION_EFFECT_BEHAVIOR, "applyEffect");
  class RegionBehaviorType {
    static _createEventsField() { return { kind: "events" }; }
  }
  class DocumentUUIDField {
    constructor(options) { this.options = options; }
  }
  class Field {
    constructor(options) { this.options = options; }
  }
  class SetField extends Field {
    constructor(element, options) { super(options); this.element = element; }
  }
  const config = { RegionBehavior: { dataModels: {}, typeIcons: {} } };
  const foundryRef = {
    data: {
      regionBehaviors: { RegionBehaviorType },
      fields: { DocumentUUIDField, StringField: Field, BooleanField: Field, SetField }
    }
  };
  assert.equal(registerGumRegionEffectBehavior({ config, foundryRef }), true);
  const Behavior = config.RegionBehavior.dataModels[GUM_REGION_EFFECT_BEHAVIOR];
  assert.ok(Behavior);
  const schema = Behavior.defineSchema();
  assert.equal(schema.effectUuid.options.type, "Item");
  assert.ok(schema.actionIds instanceof SetField);
  assert.ok(schema.excludeSelf instanceof Field);
  assert.ok(schema.instantTrigger instanceof Field);
  assert.ok(schema.recipientIconMode instanceof Field);
  assert.ok(schema.recipientIcon instanceof Field);
  assert.ok(schema.removeOnExit instanceof Field);
  assert.match(config.RegionBehavior.typeIcons[GUM_REGION_EFFECT_BEHAVIOR], /wand/);
  assert.equal(registerGumRegionEffectBehavior({ config, foundryRef }), false);
});

test("keeps one recipient indicator while merging overlapping Emanation owners", async () => {
  const previousFoundry = globalThis.foundry;
  const getProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
  globalThis.foundry = { utils: { getProperty } };
  const updates = [];
  const actor = {
    effects: [],
    async createEmbeddedDocuments(_type, documents) {
      const created = documents.map((data, index) => ({
        id: `indicator-${index}`,
        ...data,
        async update(changes) { updates.push(changes); }
      }));
      this.effects.push(...created);
      return created;
    }
  };
  const effectItem = { id: "aura", uuid: "Item.aura", name: "Aura", img: "icons/aura.webp" };
  try {
    const first = await ensureDynamicRegionIndicator(actor, {
      effectItem,
      regionUuid: "Region.one",
      mode: "effect"
    });
    assert.equal(actor.effects.length, 1);
    assert.equal(first.img, effectItem.img);
    assert.equal(first.flags.gum.lifecycleCarrier, false);
    assert.equal(first.flags.gum.dynamicRegionIndicator, true);

    const second = await ensureDynamicRegionIndicator(actor, {
      effectItem,
      regionUuid: "Region.two",
      mode: "custom",
      customIcon: "icons/custom.webp"
    });
    assert.equal(second, first);
    assert.equal(actor.effects.length, 1);
    assert.equal(updates[0].img, "icons/custom.webp");
    assert.deepEqual(updates[0]["flags.gum.dynamicRegionGrant"].sourceUuids, ["Region.one", "Region.two"]);
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry;
    else globalThis.foundry = previousFoundry;
  }
});

test("Emanation separates persistent entry from its shared instant trigger and preserves the source", async () => {
  const previous = {
    foundry: globalThis.foundry,
    game: globalThis.game,
    fromUuid: globalThis.fromUuid,
    ui: globalThis.ui
  };
  class RegionBehaviorType {
    static _createEventsField() { return {}; }
  }
  class Field { constructor(options) { this.options = options; } }
  class SetField extends Field { constructor(element, options) { super(options); this.element = element; } }
  const foundryRef = {
    data: {
      regionBehaviors: { RegionBehaviorType },
      fields: { DocumentUUIDField: Field, StringField: Field, BooleanField: Field, SetField }
    },
    utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) }
  };
  const constRef = { REGION_EVENTS: {
    TOKEN_ENTER: "tokenEnter",
    TOKEN_EXIT: "tokenExit",
    TOKEN_TURN_START: "tokenTurnStart",
    TOKEN_TURN_END: "tokenTurnEnd"
  } };
  const sourceActor = { uuid: "Actor.source", documentName: "Actor" };
  const sourceItem = { uuid: "Actor.source.Item.spell", documentName: "Item", type: "spell" };
  const sourceToken = { uuid: "Scene.s.Token.source", actor: sourceActor, disposition: 1 };
  const targetActor = { uuid: "Actor.target", documentName: "Actor", effects: [] };
  const targetToken = { uuid: "Scene.s.Token.target", actor: targetActor, disposition: -1 };
  const effectItem = { uuid: "Item.aura", name: "Aura", type: "effect", documentName: "Item" };
  const applications = [];
  globalThis.foundry = foundryRef;
  globalThis.ui = { notifications: { error() {} } };
  globalThis.game = {
    gum: { api: {
      items: { resolve: async () => effectItem },
      effects: { apply: async (...args) => applications.push(args) }
    } }
  };
  globalThis.fromUuid = async uuid => ({
    [sourceToken.uuid]: sourceToken,
    [sourceActor.uuid]: sourceActor,
    [sourceItem.uuid]: sourceItem
  })[uuid] ?? null;
  try {
    const Behavior = createGumEffectRegionBehaviorType({ foundryRef, constRef });
    const behavior = new Behavior();
    Object.assign(behavior, {
      effectUuid: effectItem.uuid,
      actionIds: new Set(),
      sourceTokenUuid: sourceToken.uuid,
      sourceActorUuid: sourceActor.uuid,
      sourceItemUuid: sourceItem.uuid,
      targetMode: "all",
      excludeSelf: false,
      instantTrigger: "turn_start",
      recipientIconMode: "none",
      recipientIcon: "",
      removeOnExit: true,
      region: { uuid: "Scene.s.Region.aura", flags: { gum: { dynamicEffectRegion: {} } }, parent: { uuid: "Scene.s" } }
    });

    await behavior._handleRegionEvent({ name: "tokenEnter", data: { token: targetToken } });
    assert.equal(applications.length, 1);
    assert.equal(applications[0][2].actor, sourceActor);
    assert.equal(applications[0][2].origin, sourceItem);
    assert.equal(applications[0][2].skipPersistentEffects, false);
    assert.equal(applications[0][2].skipInstantEffects, true);

    await behavior._handleRegionEvent({ name: "tokenTurnStart", data: { token: targetToken } });
    assert.equal(applications.length, 2);
    assert.equal(applications[1][2].skipPersistentEffects, true);
    assert.equal(applications[1][2].skipInstantEffects, false);

    await behavior._handleRegionEvent({ name: "tokenTurnEnd", data: { token: targetToken } });
    assert.equal(applications.length, 2, "a non-selected instant trigger must not execute");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("declares the custom Region behavior in the system manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.documentTypes?.RegionBehavior?.applyEffect, {});
  assert.equal(manifest.documentTypes?.RegionBehavior?.dynamicEffectAura, undefined);
});

test("registers a native MATT action that routes selected effects to GUM", async () => {
  let setupCallback;
  const hooks = { on: (name, callback) => { if (name === "setupTileActions") setupCallback = callback; } };
  const effect = { uuid: "Item.effect-1", name: "Fogo", type: "effect", documentName: "Item" };
  const calls = [];
  const gameRef = {
    gum: {
      api: {
        items: { resolve: async () => effect },
        effects: { apply: async (...args) => calls.push(args) }
      }
    },
    MonksActiveTiles: {
      getEntities: async (_args, collection) => collection === "items" ? [effect] : [tokenDocument],
      entityName: async () => "Seleção"
    }
  };
  const registrations = [];
  const app = {
    triggerGroups: {},
    registerTileGroup: (id, name) => { app.triggerGroups[id] = { name }; },
    registerTileAction: (namespace, id, action) => registrations.push({ namespace, id, action })
  };

  assert.equal(registerMonksActiveTilesEffectAction({ hooks, getGame: () => gameRef }), true);
  setupCallback(app);
  assert.equal(registrations[0].namespace, "monks-active-tiles");
  assert.equal(registrations[0].id, GUM_MATT_EFFECT_ACTION);
  await registrations[0].action.fn({ action: { data: { effect: { id: effect.uuid } } }, method: "enter" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], effect);
  assert.equal(calls[0][1][0].actor, actor);
  assert.equal(calls[0][2].mode, "monks-active-tiles");
  assert.equal(calls[0][2].origin, effect);
  assert.equal(calls[0][2].source, "monks-active-tiles");
});
