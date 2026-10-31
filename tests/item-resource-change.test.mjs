import test from "node:test";
import assert from "node:assert/strict";

import { captureItemResourceChanges } from "../module/utils/item-resource-change.mjs";

test("captures an equipment-backed reserve and retains the causing damage event", () => {
  const system = {
    quantity: 1,
    uses_mode: "charges",
    charge_reserve_type: "spell",
    charge_reserve_name: "Mana do Cajado",
    max_uses: 5,
    current_uses: 1,
    cost: 0,
    weight: 0
  };
  const item = { id: "staff", uuid: "Actor.a.Item.staff", name: "Cajado", type: "equipment", _source: { system }, system };
  const [event] = captureItemResourceChanges(item, { "system.current_uses": 4 }, {
    eventData: { type: "damage", eventId: "damage-1" }
  });

  assert.equal(event.type, "resource_change");
  assert.equal(event.resourceKind, "equipment-reserve");
  assert.equal(event.path, "equipment:staff");
  assert.equal(event.before, 4);
  assert.equal(event.after, 1);
  assert.equal(event.maximum, 5);
  assert.equal(event.eventId, "damage-1:equipment-reserve:staff-change");
  assert.deepEqual(event.source, { type: "damage", eventId: "damage-1" });
});

test("captures equipment integrity without treating unrelated item changes as resources", () => {
  const system = {
    quantity: 1,
    integrity_record_enabled: true,
    item_hp: 12,
    item_hp_current: 9,
    item_dr: 2,
    cost: 0,
    weight: 0
  };
  const item = { id: "shield", uuid: "Actor.a.Item.shield", name: "Escudo", type: "equipment", _source: { system }, system };
  const [event] = captureItemResourceChanges(item, { system: { item_hp_current: 3 } }, { eventIdFactory: () => "integrity-1" });

  assert.equal(event.resourceKind, "equipment-integrity");
  assert.equal(event.path, "equipment-integrity:shield");
  assert.equal(event.before, 9);
  assert.equal(event.after, 3);
  assert.equal(event.eventId, "integrity-1");
  assert.deepEqual(captureItemResourceChanges(item, { name: "Novo nome" }), []);
});
