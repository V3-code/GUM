import assert from "node:assert/strict";
import test from "node:test";

import {
  GUM_API_HOOKS,
  createGumLifecycleContext,
  emitGumLifecycleHook,
  resolveGumSourceToken
} from "../module/api/gum-hooks.mjs";

test("publishes stable names for informational lifecycle hooks", () => {
  assert.deepEqual(GUM_API_HOOKS, {
    READY: "gum.apiReady",
    STATUS_CONFIGURATION_CHANGED: "gumWorldStatusConfigurationChanged",
    ROLL_COMPLETED: "gum.rollCompleted",
    DAMAGE_ROLLED: "gum.damageRolled",
    DAMAGE_APPLIED: "gum.damageApplied",
    EFFECT_APPLIED: "gum.effectApplied",
    EFFECT_REMOVED: "gum.effectRemoved",
    EFFECT_STATE_CHANGED: "gum.effectStateChanged",
    CONDITION_STATE_CHANGED: "gum.conditionStateChanged",
    STATE_EFFECT_GROUP_CHANGED: "gum.stateEffectGroupChanged",
    ITEM_USE_COMPLETED: "gum.itemUseCompleted"
  });
  assert.ok(Object.isFrozen(GUM_API_HOOKS));
});

test("builds a shallow immutable envelope without cloning Foundry documents", () => {
  const actor = { id: "actor" };
  const item = { id: "item" };
  const sourceToken = { id: "source", actor };
  const target = { id: "target" };
  const result = { isSuccess: true };
  const context = createGumLifecycleContext({
    eventId: "event-1",
    userId: "user-1",
    timestamp: 123,
    actor,
    sourceToken,
    item,
    action: { type: "attack", id: "attack-1", attackType: "ranged", label: "Tiro", data: item },
    targets: [target],
    result,
    metadata: { flow: "sheet" }
  });

  assert.equal(context.version, 1);
  assert.equal(context.actor, actor);
  assert.equal(context.item, item);
  assert.equal(context.sourceToken, sourceToken);
  assert.equal(context.action.data, item);
  assert.equal(context.targets[0], target);
  assert.equal(context.result, result);
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.action));
  assert.ok(Object.isFrozen(context.targets));
  assert.ok(Object.isFrozen(context.metadata));
});

test("isolates listener failures from the rules flow", () => {
  const errors = [];
  const context = emitGumLifecycleHook(GUM_API_HOOKS.ROLL_COMPLETED, {
    eventId: "event-2",
    result: { total: 9 }
  }, {
    hooks: { callAll: () => { throw new Error("external integration failed"); } },
    logger: { error: (...args) => errors.push(args) }
  });

  assert.equal(context.eventId, "event-2");
  assert.equal(context.result.total, 9);
  assert.equal(errors.length, 1);
});

test("resolves the controlled token before synthetic and active alternatives", () => {
  const actor = {
    id: "actor",
    token: { id: "synthetic" },
    getActiveTokens: () => [{ id: "active" }]
  };
  const controlled = { id: "controlled", actor };
  assert.equal(resolveGumSourceToken(actor, { tokens: { controlled: [controlled] } }), controlled);
  assert.equal(resolveGumSourceToken(actor, { tokens: { controlled: [] } }), actor.token);
});
