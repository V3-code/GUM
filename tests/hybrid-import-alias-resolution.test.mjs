import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = { utils: {
  deepClone: structuredClone,
  mergeObject(original, other) {
    const result = structuredClone(original ?? {});
    const merge = (target, source) => {
      for (const [key, value] of Object.entries(source ?? {})) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          target[key] = merge(target[key] && typeof target[key] === "object" ? target[key] : {}, value);
        } else target[key] = structuredClone(value);
      }
      return target;
    };
    return merge(result, other);
  }
} };
globalThis.Hooks = { on() {} };

const packs = [];
packs.get = id => packs.find(pack => pack.collection === id) || null;
let contentSources = {};
let hybridScope = "configured-world";

globalThis.game = {
  items: {
    contents: [],
    get(id) { return this.contents.find(item => item.id === id) || null; }
  },
  packs,
  settings: {
    get(_namespace, key) {
      if (key === "contentSources") return contentSources;
      if (key === "hybridItemMatchScope") return hybridScope;
      if (key === "hybridImportSearchAllCompendia") return false;
      return null;
    }
  }
};

const { invalidateHybridItemIndex, prepareGumCharacterImportData, resolveHybridSourceItem } = await import("../module/apps/importers.js");

function worldItem(id, name, { type = "skill", specialization = "", aliases = [], ref = "" } = {}) {
  return { id, uuid: `Item.${id}`, name, type, system: { specialization, aliases, ref } };
}

function parsedItem(name, specialization = "", type = "skill") {
  return { name, type, system: { specialization, ref: "" } };
}

test("resolves a translated full alias and returns the canonical source", async () => {
  const source = worldItem("guns", "Guns", {
    specialization: "Pistol",
    aliases: ["Armas de Fogo (Pistola)"]
  });
  game.items.contents = [source];
  invalidateHybridItemIndex();

  const result = await resolveHybridSourceItem({
    gcsNode: { name: "Armas de Fogo", specialization: "Pistola" },
    parsedItem: parsedItem("Armas de Fogo", "Pistola")
  });

  assert.equal(result.item, source);
  assert.equal(result.matchedBy, "alias+specialization");
});

test("does not fall back to a different specialization with the same name", async () => {
  game.items.contents = [worldItem("arctic", "Survival", { specialization: "Arctic" })];
  invalidateHybridItemIndex();

  const result = await resolveHybridSourceItem({
    gcsNode: { name: "Survival", specialization: "Desert" },
    parsedItem: parsedItem("Survival", "Desert")
  });

  assert.equal(result.item, null);
  assert.equal(result.ambiguity, null);
});

test("reports same-priority alias collisions without choosing an item", async () => {
  game.items.contents = [
    worldItem("first", "Night Vision", { type: "advantage", aliases: ["Visão Noturna"] }),
    worldItem("second", "Dark Sight", { type: "advantage", aliases: ["Visão Noturna"] })
  ];
  invalidateHybridItemIndex();

  const result = await resolveHybridSourceItem({
    gcsNode: { name: "Visão Noturna" },
    parsedItem: parsedItem("Visão Noturna", "", "advantage")
  });

  assert.equal(result.item, null);
  assert.equal(result.ambiguity.length, 2);
});

test("configured compendia take priority over world items", async () => {
  const compendiumItem = worldItem("pack-skill", "Stealth");
  compendiumItem.toObject = () => structuredClone(compendiumItem);
  const pack = {
    collection: "world.hybrid",
    documentName: "Item",
    async getIndex() {
      return { contents: [{ _id: compendiumItem.id, name: compendiumItem.name, type: compendiumItem.type, system: compendiumItem.system }] };
    },
    async getDocument(id) { return id === compendiumItem.id ? compendiumItem : null; }
  };
  packs.push(pack);
  contentSources = { characterImport: [pack.collection] };
  hybridScope = "configured-world";
  game.items.contents = [worldItem("world-skill", "Stealth")];
  invalidateHybridItemIndex();

  const result = await resolveHybridSourceItem({ gcsNode: null, parsedItem: parsedItem("Stealth") });
  assert.equal(result.item, compendiumItem);
  packs.length = 0;
  contentSources = {};
});

test("faithful GUM JSON restoration leaves embedded item data unchanged", async () => {
  hybridScope = "configured";
  const source = {
    _id: "actor-old",
    name: "Backup",
    type: "character",
    system: { notes: "kept" },
    items: [{ _id: "item-old", name: "Stealth", type: "skill", system: { level: 12 } }]
  };
  const restored = await prepareGumCharacterImportData(source);
  assert.equal(restored._id, undefined);
  assert.deepEqual(restored.items, source.items);
});
