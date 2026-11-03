import assert from "node:assert/strict";
import test from "node:test";
import {
  ContentSourceService,
  deduplicateSourceDocuments,
  getConfiguredSourceIds,
  normalizeContentSourceSettings
} from "../module/services/content-source-service.mjs";

test("uses no bundled content sources by default and preserves empty selections", () => {
  assert.deepEqual(getConfiguredSourceIds({}, "effects"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "conditions"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "passiveConditions"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "statusBindings"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "modifiers"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "templates"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "equipmentModifiers"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "rollModifiers"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "skills"), []);
  assert.deepEqual(getConfiguredSourceIds({}, "triggers"), []);
  assert.deepEqual(getConfiguredSourceIds({ effects: [] }, "effects"), []);
});

test("loads only conditions from passive condition sources", async () => {
  const passive = { type: "condition", uuid: "Compendium.world.passive.Item.a" };
  const effect = { type: "effect", uuid: "Compendium.world.passive.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.passive", {
      documentName: "Item",
      getDocuments: async () => [passive, effect]
    }]]),
    settings: {
      get: () => ({ passiveConditions: ["world.passive"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("passiveConditions"), {
    documents: [passive],
    invalidSources: []
  });
});

test("builds a prioritized multi-source skill index with canonical UUIDs", async () => {
  const calls = [];
  const makePack = (id, entries) => ({
    documentName: "Item",
    getIndex: async options => {
      calls.push({ id, fields: options.fields });
      return entries;
    }
  });
  const service = new ContentSourceService({
    packs: new Map([
      ["world.skills", makePack("world.skills", [{ _id: "a", type: "skill", name: "Furtividade", system: {} }])],
      ["gum.skills", makePack("gum.skills", [{ _id: "b", type: "skill", name: "Percepção", system: {} }, { _id: "x", type: "spell", name: "Luz" }])]
    ]),
    settings: {
      get: () => ({ skills: ["world.skills", "gum.skills"] }),
      set: async () => undefined
    }
  });

  const result = await service.getIndex("skills", { fields: ["system.specialization"] });
  assert.deepEqual(result.entries.map(entry => ({ name: entry.name, uuid: entry.uuid })), [
    { name: "Furtividade", uuid: "Compendium.world.skills.Item.a" },
    { name: "Percepção", uuid: "Compendium.gum.skills.Item.b" }
  ]);
  assert.deepEqual(calls[0].fields, ["type", "system.specialization"]);
});

test("loads only roll modifiers from roll modifier sources", async () => {
  const rollModifier = { type: "gm_modifier", uuid: "Compendium.world.roll-modifiers.Item.a" };
  const traitModifier = { type: "modifier", uuid: "Compendium.world.roll-modifiers.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.roll-modifiers", {
      documentName: "Item",
      getDocuments: async () => [rollModifier, traitModifier]
    }]]),
    settings: {
      get: () => ({ rollModifiers: ["world.roll-modifiers"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("rollModifiers"), {
    documents: [rollModifier],
    invalidSources: []
  });
});

test("loads roll modifiers from every configured source in configured order", async () => {
  const first = { id: "first", type: "gm_modifier", uuid: "Compendium.world.first.Item.first" };
  const ignored = { id: "ignored", type: "modifier", uuid: "Compendium.world.first.Item.ignored" };
  const second = { id: "second", type: "gm_modifier", uuid: "Compendium.world.second.Item.second" };
  const service = new ContentSourceService({
    packs: new Map([
      ["world.first", { documentName: "Item", getDocuments: async () => [first, ignored] }],
      ["world.second", { documentName: "Item", getDocuments: async () => [second] }]
    ]),
    settings: {
      get: () => ({ rollModifiers: ["world.first", "world.second"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("rollModifiers"), {
    documents: [first, second],
    invalidSources: []
  });
});

test("loads only templates from template sources", async () => {
  const template = { type: "template", uuid: "Compendium.world.templates.Item.a" };
  const advantage = { type: "advantage", uuid: "Compendium.world.templates.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.templates", {
      documentName: "Item",
      getDocuments: async () => [template, advantage]
    }]]),
    settings: {
      get: () => ({ templates: ["world.templates"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("templates"), {
    documents: [template],
    invalidSources: []
  });
});

test("loads only equipment modifiers from equipment modifier sources", async () => {
  const equipmentModifier = { type: "eqp_modifier", uuid: "Compendium.world.eqp-modifiers.Item.a" };
  const traitModifier = { type: "modifier", uuid: "Compendium.world.eqp-modifiers.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.eqp-modifiers", {
      documentName: "Item",
      getDocuments: async () => [equipmentModifier, traitModifier]
    }]]),
    settings: {
      get: () => ({ equipmentModifiers: ["world.eqp-modifiers"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("equipmentModifiers"), {
    documents: [equipmentModifier],
    invalidSources: []
  });
});

test("loads only trait modifiers from modifier sources", async () => {
  const modifier = { type: "modifier", uuid: "Compendium.world.modifiers.Item.a" };
  const equipmentModifier = { type: "eqp_modifier", uuid: "Compendium.world.modifiers.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.modifiers", {
      documentName: "Item",
      getDocuments: async () => [modifier, equipmentModifier]
    }]]),
    settings: {
      get: () => ({ modifiers: ["world.modifiers"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("modifiers"), {
    documents: [modifier],
    invalidSources: []
  });
});

test("loads only triggers from trigger sources", async () => {
  const trigger = { type: "trigger", uuid: "Compendium.world.triggers.Item.a" };
  const condition = { type: "condition", uuid: "Compendium.world.triggers.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.triggers", {
      documentName: "Item",
      getDocuments: async () => [trigger, condition]
    }]]),
    settings: {
      get: () => ({ triggers: ["world.triggers"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("triggers"), {
    documents: [trigger],
    invalidSources: []
  });
});

test("loads only conditions from condition sources", async () => {
  const condition = { type: "condition", uuid: "Compendium.world.conditions.Item.a" };
  const effect = { type: "effect", uuid: "Compendium.world.conditions.Item.b" };
  const service = new ContentSourceService({
    packs: new Map([["world.conditions", {
      documentName: "Item",
      getDocuments: async () => [condition, effect]
    }]]),
    settings: {
      get: () => ({ conditions: ["world.conditions"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("conditions"), {
    documents: [condition],
    invalidSources: []
  });
});

test("normalizes source lists without changing their priority", () => {
  assert.deepEqual(normalizeContentSourceSettings({
    effects: [" world.effects ", "world.base-effects", "world.effects", ""]
  }), { effects: ["world.effects", "world.base-effects"] });
});

test("deduplicates copied documents by their original source UUID", () => {
  const documents = [
    { uuid: "Compendium.world.base-effects.Item.a", flags: { core: { sourceId: "shared" } } },
    { uuid: "Compendium.world.effects.Item.b", flags: { core: { sourceId: "shared" } } },
    { uuid: "Compendium.world.effects.Item.c" }
  ];
  assert.deepEqual(deduplicateSourceDocuments(documents), [documents[0], documents[2]]);
});

test("loads valid effect documents in configured priority and reports missing sources", async () => {
  const baseEffect = { type: "effect", uuid: "Compendium.world.base-effects.Item.a" };
  const campaignEffect = { type: "effect", uuid: "Compendium.world.effects.Item.b" };
  const wrongType = { type: "condition", uuid: "Compendium.world.effects.Item.c" };
  const packs = new Map([
    ["world.base-effects", { documentName: "Item", getDocuments: async () => [baseEffect] }],
    ["world.effects", { documentName: "Item", getDocuments: async () => [campaignEffect, wrongType] }]
  ]);
  const foundryGame = {
    packs,
    settings: {
      get: () => ({ effects: ["world.effects", "missing.effects", "world.base-effects"] }),
      set: async () => undefined
    }
  };

  const result = await new ContentSourceService(foundryGame).getDocuments("effects");
  assert.deepEqual(result.documents, [campaignEffect, baseEffect]);
  assert.deepEqual(result.invalidSources, [{ id: "missing.effects", status: "missing" }]);
});

test("loads status bindings from multiple sources in configured priority", async () => {
  const campaignRule = { type: "condition", uuid: "Compendium.world.bindings.Item.a" };
  const sharedRule = { type: "condition", uuid: "Compendium.world.shared-bindings.Item.b" };
  const unrelatedItem = { type: "effect", uuid: "Compendium.world.bindings.Item.c" };
  const service = new ContentSourceService({
    packs: new Map([
      ["world.bindings", { documentName: "Item", getDocuments: async () => [campaignRule, unrelatedItem] }],
      ["world.shared-bindings", { documentName: "Item", getDocuments: async () => [sharedRule] }]
    ]),
    settings: {
      get: () => ({ statusBindings: ["world.bindings", "world.shared-bindings"] }),
      set: async () => undefined
    }
  });

  assert.deepEqual(await service.getDocuments("statusBindings"), {
    documents: [campaignRule, sharedRule],
    invalidSources: []
  });
});

test("rejects packs with an incompatible document type", () => {
  const service = new ContentSourceService({
    packs: new Map([["world.macros", { documentName: "Macro" }]]),
    settings: { get: () => ({ effects: ["world.macros"] }) }
  });
  assert.deepEqual(service.resolveSources("effects").map(({ id, status }) => ({ id, status })), [
    { id: "world.macros", status: "incompatible" }
  ]);
});

test("resolves the Foundry game lazily when it becomes available after construction", async () => {
  const previousGame = globalThis.game;
  delete globalThis.game;
  const service = new ContentSourceService();
  const effect = { type: "effect", uuid: "Compendium.world.late-effects.Item.a" };
  const pack = { documentName: "Item", getDocuments: async () => [effect] };

  try {
    globalThis.game = {
      packs: new Map([["world.late-effects", pack]]),
      settings: {
        get: () => ({ effects: ["world.late-effects"] }),
        set: async () => undefined
      }
    };

    assert.deepEqual(service.getSettings(), { effects: ["world.late-effects"] });
    assert.deepEqual(service.resolveSources("effects"), [{
      id: "world.late-effects",
      pack,
      status: "available"
    }]);
    assert.deepEqual(await service.getDocuments("effects"), {
      documents: [effect],
      invalidSources: []
    });
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("reports an explicit error when Foundry is not initialized", () => {
  const previousGame = globalThis.game;
  delete globalThis.game;
  try {
    assert.throws(
      () => new ContentSourceService().getSettings(),
      /antes da inicialização do Foundry.*game indisponível/
    );
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});
