import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = { utils: { deepClone: structuredClone } };
globalThis.Hooks = { on() {} };

const packs = [];
packs.get = () => null;

globalThis.game = {
  items: {
    contents: [],
    get(id) { return this.contents.find(item => item.id === id) || null; }
  },
  packs,
  settings: {
    get(_namespace, key) {
      if (key === "contentSources") return {};
      if (key === "hybridImportSearchAllCompendia") return false;
      return null;
    }
  }
};

const { invalidateHybridItemIndex, resolveHybridSourceItem } = await import("../module/apps/importers.js");

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
