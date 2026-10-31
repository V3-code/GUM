import assert from "node:assert/strict";
import test from "node:test";

import {
  HYBRID_ALIAS_ITEM_TYPES,
  itemNameIdentities,
  itemNameIdentity,
  normalizeItemAliases,
  normalizeItemName
} from "../module/utils/item-name-aliases.mjs";

test("normalizes aliases without losing their display spelling", () => {
  assert.equal(normalizeItemName("  Visão   Noturna  "), "visao noturna");
  assert.deepEqual(
    normalizeItemAliases([" Visão Noturna ", "visao noturna", "Dark Vision", ""]),
    ["Visão Noturna", "Dark Vision"]
  );
});

test("translated specialized aliases carry their own specialization", () => {
  const identities = itemNameIdentities({
    name: "Guns",
    specialization: "Pistol",
    aliases: ["Armas de Fogo (Pistola)", "Firearms"]
  });

  assert.deepEqual(
    identities.map(({ nameNorm, specializationNorm, kind }) => ({ nameNorm, specializationNorm, kind })),
    [
      { nameNorm: "guns", specializationNorm: "pistol", kind: "name" },
      { nameNorm: "armas de fogo", specializationNorm: "pistola", kind: "alias" },
      { nameNorm: "firearms", specializationNorm: "pistol", kind: "alias" }
    ]
  );
});

test("different specializations remain different identities", () => {
  const desert = itemNameIdentity("Sobrevivência", "Deserto");
  const arctic = itemNameIdentity("Sobrevivência", "Ártico");
  assert.equal(desert.nameNorm, arctic.nameNorm);
  assert.notEqual(desert.specializationNorm, arctic.specializationNorm);
});

test("aliases are available only to hybrid-importable item families", () => {
  assert.deepEqual(HYBRID_ALIAS_ITEM_TYPES, ["advantage", "disadvantage", "skill", "spell", "power", "equipment"]);
});
