const ATTRIBUTE_RESOURCE_KEYS = Object.freeze(["hp", "fp"]);

function readChange(changes, path) {
  if (!changes || typeof changes !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  return path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, changes);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resourceDescriptors(actor) {
  const system = actor?.system || {};
  const descriptors = ATTRIBUTE_RESOURCE_KEYS.map(resource => ({
    resource,
    kind: resource,
    paths: [`system.attributes.${resource}.value`],
    maximumPaths: [`system.attributes.${resource}.final`, `system.attributes.${resource}.max`],
    current: system.attributes?.[resource]
  }));

  for (const [collectionPath, collection, kind] of [
    ["system.combat.combat_meters", system.combat?.combat_meters, "combat-meter"],
    ["system.spell_reserves", system.spell_reserves, "spell-reserve"],
    ["system.power_reserves", system.power_reserves, "power-reserve"]
  ]) {
    for (const [resource, current] of Object.entries(collection || {})) {
      const valueKey = current?.current !== undefined ? "current" : "value";
      descriptors.push({
        resource,
        kind,
        label: String(current?.name || resource),
        paths: [
          `${collectionPath}.${resource}.${valueKey}`,
          `${collectionPath}.${resource}.${valueKey === "current" ? "value" : "current"}`
        ],
        maximumPaths: [`${collectionPath}.${resource}.max`],
        current
      });
    }
  }
  return descriptors;
}

export function captureActorResourceChanges(actor, changes, { eventData = null, eventIdFactory = null } = {}) {
  const captured = [];
  for (const descriptor of resourceDescriptors(actor)) {
    const { resource, kind, label = resource, paths, maximumPaths, current = {} } = descriptor;
    const path = paths.find(candidate => finiteNumber(readChange(changes, candidate)) !== null) || paths[0];
    const nextValue = finiteNumber(readChange(changes, path));
    if (nextValue === null) continue;

    const previousValue = finiteNumber(current.current ?? current.value);
    if (previousValue === null || previousValue === nextValue) continue;

    const changedMaximum = maximumPaths.reduce((value, maximumPath) => value ?? finiteNumber(readChange(changes, maximumPath)), null);
    const maximum = changedMaximum ?? finiteNumber(current.final) ?? finiteNumber(current.max) ?? 0;
    const parentEventId = eventData?.eventId ? String(eventData.eventId) : null;
    const generatedId = eventIdFactory?.() ?? `${Date.now()}-${resource}`;
    const resourceEventKey = kind === resource ? resource : `${kind}:${resource}`;
    const eventId = parentEventId ? `${parentEventId}:${resourceEventKey}-change` : String(generatedId);
    const payload = {
      version: 1,
      pulse: true,
      type: "resource_change",
      eventId,
      resource,
      resourceKind: kind,
      path,
      label,
      before: previousValue,
      after: nextValue,
      maximum,
      delta: nextValue - previousValue,
      direction: nextValue < previousValue ? "decrease" : "increase",
      source: eventData ? { type: eventData.type || "actor_update", eventId: parentEventId } : { type: "actor_update", eventId: null }
    };

    // Aliases keep threshold formulas concise and make migration from damage
    // events possible without losing the explicit resource-neutral fields.
    if (kind === "hp") {
      Object.assign(payload, { appliedToHP: true, hpBefore: previousValue, hpAfter: nextValue, hpMaximum: maximum });
    } else if (kind === "fp") {
      Object.assign(payload, { appliedToFP: true, fpBefore: previousValue, fpAfter: nextValue, fpMaximum: maximum });
    }
    captured.push(payload);
  }
  return captured;
}
