import test from "node:test";
import assert from "node:assert/strict";
import { syncPassiveItemEffects } from "../module/services/passive-item-effect-service.mjs";

function makeActor(initialEffects = []) {
  const effects = [...initialEffects];
  return {
    effects,
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      for (const id of ids) {
        const index = effects.findIndex(effect => effect.id === id);
        if (index >= 0) effects.splice(index, 1);
      }
    }
  };
}

function makeItem(actor, passiveEffects) {
  return {
    id: "advantage",
    uuid: "Actor.actor.Item.advantage",
    name: "Magery",
    parent: actor,
    system: { level: 2, passiveEffects }
  };
}

function makeEffectItem(uuid = "Item.effect") {
  return {
    uuid,
    name: "ST por nível",
    system: {
      actions: [
        { id: "st", type: "attribute", path: "system.attributes.st.passive", value: 1 },
        { id: "notice", type: "chat" }
      ]
    }
  };
}

function mockDependencies(actor, effectItem, applications) {
  let nextId = actor.effects.length;
  return {
    resolveUuid: async uuid => uuid === effectItem.uuid ? effectItem : null,
    getActions: system => system.actions,
    buildTargets: targetActor => [{ actor: targetActor }],
    applyEffect: async (effect, _targets, context) => {
      applications.push(context);
      const selected = context.actionIds ? new Set(context.actionIds.map(String)) : null;
      for (const [actionIndex, action] of effect.system.actions.entries()) {
        if (action.type !== "attribute") continue;
        if (selected && !selected.has(String(action.id))) continue;
        actor.effects.push({
          id: `effect-${++nextId}`,
          flags: { gum: {
            source: context.source,
            originItemId: context.originItemId,
            passiveEffectLinkId: context.passiveEffectLinkId,
            effectUuid: effect.uuid,
            actionId: action.id,
            actionIndex
          } },
          async update(changes) {
            if (changes["flags.gum.passiveEffectLinkId"] !== undefined) {
              this.flags.gum.passiveEffectLinkId = changes["flags.gum.passiveEffectLinkId"];
            }
          }
        });
      }
    }
  };
}

test("initial synchronization applies each passive link once and reconciliation is idempotent", async () => {
  const actor = makeActor();
  const item = makeItem(actor, {
    first: { effectUuid: "Item.effect" },
    second: { effectUuid: "Item.effect" }
  });
  const effectItem = makeEffectItem();
  const applications = [];
  const dependencies = mockDependencies(actor, effectItem, applications);

  const initial = await syncPassiveItemEffects(item, { ...dependencies, mode: "initial" });
  assert.equal(initial.errors.length, 0);
  assert.equal(actor.effects.length, 2);
  assert.deepEqual(actor.effects.map(effect => effect.flags.gum.passiveEffectLinkId).sort(), ["first", "second"]);
  assert.equal(applications.length, 2);
  assert.ok(applications.every(context => context.skipInstantEffects !== true));

  const reconciled = await syncPassiveItemEffects(item, dependencies);
  assert.equal(reconciled.kept, 2);
  assert.equal(actor.effects.length, 2);
  assert.equal(applications.length, 2, "reconciliation must not replay persistent or instant actions");
});

test("reconciliation claims legacy effects and removes only duplicate managed copies", async () => {
  const legacy = {
    id: "legacy",
    origin: "Actor.old.Item.advantage",
    flags: { gum: { source: "passiveItem", originItemId: "advantage", effectUuid: "Item.effect", actionId: "st", actionIndex: 0 } },
    async update(changes) {
      this.origin = changes.origin;
      this.flags.gum.passiveEffectLinkId = changes["flags.gum.passiveEffectLinkId"];
    }
  };
  const duplicate = {
    id: "duplicate",
    flags: structuredClone(legacy.flags),
    update: legacy.update
  };
  const unrelated = {
    id: "direct",
    flags: { gum: { source: null, originItemId: "advantage", effectUuid: "Item.effect", actionId: "st" } }
  };
  const actor = makeActor([legacy, duplicate, unrelated]);
  const item = makeItem(actor, { link: { effectUuid: "Item.effect" } });
  const applications = [];

  const report = await syncPassiveItemEffects(item, mockDependencies(actor, makeEffectItem(), applications));
  assert.equal(report.kept, 1);
  assert.equal(report.removed, 1);
  assert.equal(actor.effects.length, 2);
  assert.equal(legacy.flags.gum.passiveEffectLinkId, "link");
  assert.equal(legacy.origin, item.uuid);
  assert.ok(actor.effects.includes(unrelated));
  assert.equal(applications.length, 0);
});

test("refresh recalculates persistent actions without replaying instant actions", async () => {
  const actor = makeActor();
  const item = makeItem(actor, { link: { effectUuid: "Item.effect" } });
  const effectItem = makeEffectItem();
  const applications = [];
  const dependencies = mockDependencies(actor, effectItem, applications);
  await syncPassiveItemEffects(item, { ...dependencies, mode: "initial" });

  await syncPassiveItemEffects(item, { ...dependencies, refreshPersistent: true });
  assert.equal(actor.effects.length, 1);
  assert.equal(applications.length, 2);
  assert.equal(applications[1].skipInstantEffects, true);
  assert.deepEqual(applications[1].actionIds, ["st"]);
});

test("an unresolved link reports the problem and preserves its existing effect", async () => {
  const existing = {
    id: "existing",
    flags: { gum: {
      source: "passiveItem",
      originItemId: "advantage",
      effectUuid: "Item.missing",
      actionId: "st"
    } }
  };
  const actor = makeActor([existing]);
  const item = makeItem(actor, { missing: { effectUuid: "Item.missing" } });
  const applications = [];
  const dependencies = mockDependencies(actor, makeEffectItem(), applications);

  const report = await syncPassiveItemEffects(item, dependencies);
  assert.equal(report.errors.length, 1);
  assert.deepEqual(actor.effects, [existing]);
  assert.equal(applications.length, 0);
});
