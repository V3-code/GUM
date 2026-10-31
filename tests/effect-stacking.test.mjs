import test from "node:test";
import assert from "node:assert/strict";
import {
  collectConditionOwners,
  isInstantEffectAction,
  isPersistentEffectAction,
  matchesStackedEffect,
  normalizeEffectStackingMode,
  resolveEffectStackingDomain,
  resolveStoredEffectStackingDomain
} from "../module/utils/effect-stacking.mjs";

test("normaliza as três políticas e preserva o padrão legado", () => {
  assert.equal(normalizeEffectStackingMode({ conditionStackingMode: "stack" }), "stack");
  assert.equal(normalizeEffectStackingMode({ conditionStackingMode: "unique" }), "unique");
  assert.equal(normalizeEffectStackingMode({ conditionStackingMode: "refresh" }), "refresh");
  assert.equal(normalizeEffectStackingMode({ conditionStackingMode: "invalid" }), "stack");
  assert.equal(normalizeEffectStackingMode({}), "stack");
});

test("separa aplicações diretas, condições e fontes administradas", () => {
  assert.equal(resolveEffectStackingDomain({}), "direct");
  assert.equal(resolveEffectStackingDomain({ stackingDomain: "direct", source: "passiveItem" }), "direct");
  assert.equal(resolveEffectStackingDomain({ conditionId: "c1", stackingDomain: "direct" }), "condition");
  for (const source of ["passiveItem", "equipmentModifierFeature", "stateItem", "statusBinding"]) {
    assert.equal(resolveEffectStackingDomain({ source }), "managed");
  }
});

test("reconhece domínios gravados e ActiveEffects legados", () => {
  assert.equal(resolveStoredEffectStackingDomain({ stackingDomain: "direct", source: "passiveItem" }), "direct");
  assert.equal(resolveStoredEffectStackingDomain({ conditionEffect: true }), "condition");
  assert.equal(resolveStoredEffectStackingDomain({ conditionIds: ["c1"] }), "condition");
  assert.equal(resolveStoredEffectStackingDomain({ source: "stateItem" }), "managed");
  assert.equal(resolveStoredEffectStackingDomain({ stateEffectGroupId: "ward" }), "managed");
  assert.equal(resolveStoredEffectStackingDomain({}), "direct");
});

test("classifica todas as ações persistentes e pontuais do motor", () => {
  for (const type of ["attribute", "flag", "roll_modifier", "skill_modifier", "combat_modifier", "status"]) {
    assert.equal(isPersistentEffectAction(type), true, type);
  }
  for (const type of ["resource_change", "resource_create", "damage_roll", "macro", "chat"]) {
    assert.equal(isInstantEffectAction({ type }), true, type);
    assert.equal(isPersistentEffectAction(type), false, type);
  }
});

test("identifica uma ação pela id estável antes de recorrer ao índice legado", () => {
  const current = { flags: { gum: { effectUuid: "Item.effect", actionId: "damage", actionIndex: 0, stackingDomain: "direct" } } };
  assert.equal(matchesStackedEffect(current, { effectUuid: "Item.effect", action: { id: "damage" }, actionIndex: 4 }), true);
  assert.equal(matchesStackedEffect(current, { effectUuid: "Item.effect", action: { id: "other" }, actionIndex: 0 }), false);

  const legacy = { flags: { gum: { effectUuid: "Item.effect", actionIndex: 2 } } };
  assert.equal(matchesStackedEffect(legacy, { effectUuid: "Item.effect", action: { id: "new-id" }, actionIndex: 2 }), true);
  assert.equal(matchesStackedEffect(legacy, { effectUuid: "Item.effect", action: { id: "new-id" }, actionIndex: 1 }), false);
});

test("nunca mistura cópias diretas, de condição e administradas", () => {
  const condition = { flags: { gum: { effectUuid: "Item.effect", actionId: "a", conditionEffect: true } } };
  const managed = { flags: { gum: { effectUuid: "Item.effect", actionId: "a", source: "passiveItem" } } };
  assert.equal(matchesStackedEffect(condition, { effectUuid: "Item.effect", action: { id: "a" }, domain: "direct" }), false);
  assert.equal(matchesStackedEffect(managed, { effectUuid: "Item.effect", action: { id: "a" }, domain: "direct" }), false);
});

test("mescla proprietários de condições sem duplicatas", () => {
  const effect = { flags: { gum: { conditionId: "c1", conditionIds: ["c1", "c2"] } } };
  assert.deepEqual(collectConditionOwners(effect, "c2"), ["c1", "c2"]);
  assert.deepEqual(collectConditionOwners(effect, "c3"), ["c1", "c2", "c3"]);
});
