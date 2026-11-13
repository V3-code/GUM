import test from "node:test";
import assert from "node:assert/strict";
import { exclusionPeers, normalizeEffectExclusionGroups, replacedDirectEffectIds } from "../module/utils/effect-exclusion.mjs";

test("grupos são simétricos e recusam um efeito em dois grupos", () => {
  const groups = [{ id: "maneuvers", name: "Manobras", effectUuids: ["Item.A", "Item.B"] }];
  assert.deepEqual([...exclusionPeers(groups, "Item.A")], ["Item.B"]);
  assert.deepEqual([...exclusionPeers(groups, "Item.B")], ["Item.A"]);
  assert.throws(() => normalizeEffectExclusionGroups([...groups, { effectUuids: ["Item.B", "Item.C"] }]));
});

test("a limpeza só seleciona aplicações diretas dos outros membros", () => {
  const peers = new Set(["Item.B"]);
  const effect = (id, effectUuid, stackingDomain) => ({ id, flags: { gum: { effectUuid, stackingDomain } } });
  const effects = [effect("old", "Item.B", "direct"), effect("self", "Item.A", "direct"),
    effect("condition", "Item.B", "condition"), effect("managed", "Item.B", "managed"),
    { id: "foreign", flags: {} }];
  assert.deepEqual(replacedDirectEffectIds(effects, peers), ["old"]);
});
