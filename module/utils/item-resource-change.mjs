import { equipmentIntegrityRecord, equipmentLinkedReserve } from "./equipment-resolution.mjs";

function readChange(changes, path) {
  if (!changes || typeof changes !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  return path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, changes);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildPayload({ item, eventData, eventIdFactory, resource, resourceKind, path, label, before, after, maximum }) {
  const parentEventId = eventData?.eventId ? String(eventData.eventId) : null;
  const generatedId = eventIdFactory?.() ?? `${Date.now()}-${resourceKind}`;
  return {
    version: 1,
    pulse: true,
    type: "resource_change",
    eventId: parentEventId ? `${parentEventId}:${resourceKind}:${item.id}-change` : String(generatedId),
    resource,
    resourceKind,
    path,
    label,
    before,
    after,
    maximum,
    delta: after - before,
    direction: after < before ? "decrease" : "increase",
    owner: {
      type: "item",
      id: item.id || null,
      uuid: item.uuid || null,
      name: item.name || null
    },
    source: eventData
      ? { type: eventData.type || "item_update", eventId: parentEventId }
      : { type: "item_update", eventId: null }
  };
}

export function captureItemResourceChanges(item, changes, { eventData = null, eventIdFactory = null } = {}) {
  if (!item || item.type !== "equipment") return [];
  const captured = [];

  const reserve = equipmentLinkedReserve(item, item.system?.equipmentResolution);
  const nextSpent = finiteNumber(readChange(changes, "system.current_uses"));
  if (reserve && nextSpent !== null) {
    const after = Math.max(0, Math.min(reserve.max, reserve.max - nextSpent));
    if (after !== reserve.current) captured.push(buildPayload({
      item,
      eventData,
      eventIdFactory,
      resource: reserve.type || item.id,
      resourceKind: "equipment-reserve",
      path: `equipment:${item.id}`,
      label: reserve.name,
      before: reserve.current,
      after,
      maximum: reserve.max
    }));
  }

  const integrity = equipmentIntegrityRecord(item, item.system?.equipmentResolution);
  const nextIntegrity = finiteNumber(readChange(changes, "system.item_hp_current"));
  if (integrity && nextIntegrity !== null) {
    const after = Math.max(0, Math.min(integrity.max, Math.floor(nextIntegrity)));
    if (after !== integrity.current) captured.push(buildPayload({
      item,
      eventData,
      eventIdFactory,
      resource: item.id,
      resourceKind: "equipment-integrity",
      path: `equipment-integrity:${item.id}`,
      label: integrity.name,
      before: integrity.current,
      after,
      maximum: integrity.max
    }));
  }

  return captured;
}
