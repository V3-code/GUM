import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveEffectConditionEvent,
  buildCombatConditionEvent,
  buildDefenseRollConditionEvent,
  buildRegionConditionEvent,
  buildSceneDarknessConditionEvent,
  buildWorldTimeConditionEvent,
  collectRegionConditionTransitions
} from "../module/utils/condition-event-data.mjs";

test("defense roll keeps legacy selectors and adds the complete roll result", () => {
  const event = buildDefenseRollConditionEvent({
    eventId: "roll-1",
    actor: { uuid: "Actor.defender" },
    target: { actor: { uuid: "Actor.attacker" }, document: { uuid: "Scene.s.Token.attacker" } },
    sourceItem: { id: "shield", uuid: "Actor.defender.Item.shield", name: "Shield" },
    rollData: { defenseType: "block", attackId: "bash", purposeIds: ["pain"] },
    rollContext: "defense_block",
    result: { total: 9, baseValue: 12, totalModifier: -1, effectiveLevel: 11, margin: 2, outcome: "success", isSuccess: true },
    combat: { id: "combat", round: 2, turn: 1 }
  });

  assert.equal(event.type, "defense_roll");
  assert.equal(event.defenseType, "block");
  assert.equal(event.inCombat, true);
  assert.equal(event.family, "roll");
  assert.equal(event.category, "defense");
  assert.equal(event.success, true);
  assert.equal(event.margin, 2);
  assert.equal(event.target, 11);
  assert.equal(event.source.itemUuid, "Actor.defender.Item.shield");
  assert.equal(event.targetActor.tokenUuid, "Scene.s.Token.attacker");
  assert.deepEqual(event.purposeIds, ["pain"]);
});

test("combat event preserves turnStart and exposes structured combat data", () => {
  const event = buildCombatConditionEvent({
    eventId: "turn-1",
    phase: "turn_start",
    reason: "turnStart",
    combat: { id: "combat", round: 3, turn: 2, started: true },
    combatant: { id: "c1", actorId: "a1", actor: { id: "a1", uuid: "Actor.a1" }, token: { id: "t1", uuid: "Scene.s.Token.t1" } },
    previous: { round: 3, turn: 1, combatantId: "c0" }
  });

  assert.equal(event.reason, "turnStart");
  assert.equal(event.combatId, "combat");
  assert.equal(event.type, "combat");
  assert.equal(event.phase, "turn_start");
  assert.equal(event.combat.round, 3);
  assert.equal(event.combatant.actorUuid, "Actor.a1");
  assert.equal(event.previous.combatantId, "c0");
});

test("active effect event is serializable and normalizes status ids", () => {
  const event = buildActiveEffectConditionEvent({
    eventId: "effect-1",
    operation: "update",
    effect: { id: "e1", uuid: "Actor.a.ActiveEffect.e1", name: "Prone", disabled: false, statuses: new Set(["prone", "prone"]) },
    changes: { disabled: false, statuses: ["prone"] }
  });

  assert.equal(event.type, "active_effect_change");
  assert.equal(event.operation, "update");
  assert.deepEqual(event.effect.statusIds, ["prone"]);
  assert.deepEqual(event.changedFields, ["disabled", "statuses"]);
  assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
});

test("region event exposes stable enter and exit selectors with movement context", () => {
  const scene = { id: "scene", uuid: "Scene.scene", name: "Dungeon" };
  const region = { id: "region", uuid: "Scene.scene.Region.region", name: "Fire", parent: scene };
  const actor = { id: "actor", uuid: "Actor.actor" };
  const token = { id: "token", uuid: "Scene.scene.Token.token", name: "Hero", actor, parent: scene };
  const event = buildRegionConditionEvent({
    eventId: "region-1",
    phase: "enter",
    region,
    token,
    movement: {
      method: "dragging",
      origin: { x: 0, y: 1, elevation: 0, level: "ground" },
      destination: { x: 2, y: 3, elevation: 1, level: "upper" },
      passed: { waypoints: [{ x: 2, y: 3, elevation: 1, action: "teleport" }] }
    },
    teleport: true
  });

  assert.equal(event.type, "region");
  assert.equal(event.phase, "enter");
  assert.equal(event.path, "region.enter");
  assert.equal(event.region.uuid, region.uuid);
  assert.equal(event.token.actorUuid, actor.uuid);
  assert.equal(event.movement.method, "dragging");
  assert.equal(event.movement.teleport, true);
  assert.equal(event.movement.destination.elevation, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
});

test("region transition collection compares prior ids with current token membership", () => {
  const left = { id: "left" };
  const retained = { id: "retained" };
  const entered = { id: "entered" };
  const sceneRegions = new Map([[left.id, left], [retained.id, retained], [entered.id, entered]]);
  const token = { regions: new Set([retained, entered]), parent: { regions: sceneRegions } };
  assert.deepEqual(collectRegionConditionTransitions(token, [left.id, retained.id]), [
    { phase: "exit", region: left },
    { phase: "enter", region: entered }
  ]);
});

test("scene darkness event reports direction and both values", () => {
  const event = buildSceneDarknessConditionEvent({
    eventId: "darkness-1",
    scene: { id: "scene", uuid: "Scene.scene", name: "Dungeon" },
    before: 0.2,
    after: 0.7
  });
  assert.equal(event.type, "scene");
  assert.equal(event.category, "darkness");
  assert.equal(event.path, "scene.darkness.change");
  assert.equal(event.direction, "darken");
  assert.ok(Math.abs(event.delta - 0.5) < Number.EPSILON);
});

test("world time event distinguishes advance and rewind", () => {
  const advanced = buildWorldTimeConditionEvent({ eventId: "time-1", worldTime: 500, delta: 60, components: { hour: 12 } });
  assert.equal(advanced.type, "world_time");
  assert.equal(advanced.phase, "advance");
  assert.equal(advanced.path, "world.time.advance");
  assert.equal(advanced.previousWorldTime, 440);
  assert.deepEqual(advanced.components, { hour: 12 });

  const rewound = buildWorldTimeConditionEvent({ worldTime: 400, delta: -100 });
  assert.equal(rewound.phase, "rewind");
  assert.equal(rewound.previousWorldTime, 500);
});
