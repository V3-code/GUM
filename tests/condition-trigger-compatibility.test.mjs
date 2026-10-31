import test from "node:test";
import assert from "node:assert/strict";

import { captureActorResourceChanges } from "../module/utils/actor-resource-change.mjs";
import { buildCombatConditionEvent, buildDefenseRollConditionEvent } from "../module/utils/condition-event-data.mjs";
import { buildDamageApplicationEvent } from "../module/utils/damage-application-event.mjs";

const evaluate = (expression, actor, eventData) => Function("actor", "game", "eventData", `return (${expression})`)(actor, {}, eventData);

test("legacy defense trigger remains true with the enriched defense payload", () => {
  const eventData = buildDefenseRollConditionEvent({
    eventId: "defense",
    rollData: { defenseType: "parry" },
    result: { isSuccess: true },
    combat: { id: "combat", round: 1, turn: 0 }
  });
  const expression = 'eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "parry"';
  assert.equal(evaluate(expression, {}, eventData), true);
});

test("legacy death-threshold trigger keeps the HP aliases and crossing semantics", () => {
  const actor = { system: { attributes: { hp: { value: 1, final: 10 }, fp: { value: 10, final: 10 } } } };
  const [eventData] = captureActorResourceChanges(actor, { "system.attributes.hp.value": -10 }, { eventIdFactory: () => "hp" });
  const expression = 'eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))';
  assert.equal(evaluate(expression, actor, eventData), true);
});

test("legacy major-wound and turn-start selectors remain available", () => {
  const actor = { system: { attributes: { hp: { value: 10, final: 10 } } } };
  const damage = buildDamageApplicationEvent({ damage: { injury: 6 }, targetPool: { path: "system.attributes.hp.value", before: 10, after: 4, maximum: 10 } });
  const majorWound = 'eventData?.type === "damage" && eventData?.appliedToHP === true && Number(eventData?.injury ?? 0) > (Number(eventData?.hpMaximum ?? Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))) / 2)';
  assert.equal(evaluate(majorWound, actor, damage), true);

  const turnStart = buildCombatConditionEvent({ eventId: "turn", phase: "turn_start", reason: "turnStart", combat: { id: "combat", round: 1, turn: 0 } });
  assert.equal(evaluate('eventData?.reason === "turnStart" && eventData?.combatId === "combat"', actor, turnStart), true);
});
