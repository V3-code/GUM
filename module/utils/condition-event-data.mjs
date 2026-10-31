const textOrNull = value => {
  const text = String(value ?? "").trim();
  return text || null;
};

const finiteOrNull = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const statusIds = effect => {
  const statuses = effect?.statuses ?? effect?._source?.statuses ?? [];
  return [...new Set(Array.from(statuses || [], value => String(value)).filter(Boolean))].sort();
};

const tokenUuid = combatant => combatant?.token?.uuid
  || combatant?.token?.document?.uuid
  || combatant?.tokenUuid
  || null;

const pointData = point => point && typeof point === "object" ? {
  x: finiteOrNull(point.x),
  y: finiteOrNull(point.y),
  elevation: finiteOrNull(point.elevation),
  level: textOrNull(point.level)
} : null;

export function buildDefenseRollConditionEvent({
  eventId = null,
  actor = null,
  target = null,
  sourceItem = null,
  rollData = {},
  rollContext = null,
  result = {},
  combat = null
} = {}) {
  return {
    version: 1,
    pulse: true,
    type: "defense_roll",
    family: "roll",
    category: "defense",
    eventId: textOrNull(eventId),
    defenseType: textOrNull(rollData.defenseType),
    context: textOrNull(rollContext),
    inCombat: Boolean(combat),
    outcome: textOrNull(result.outcome),
    success: result.isSuccess === true,
    isSuccess: result.isSuccess === true,
    criticalSuccess: result.isCriticalSuccess === true,
    isCriticalSuccess: result.isCriticalSuccess === true,
    criticalFailure: result.isCriticalFailure === true,
    isCriticalFailure: result.isCriticalFailure === true,
    total: finiteOrNull(result.total),
    target: finiteOrNull(result.effectiveLevel),
    effectiveLevel: finiteOrNull(result.effectiveLevel),
    margin: finiteOrNull(result.margin),
    modifier: finiteOrNull(result.totalModifier),
    baseValue: finiteOrNull(result.baseValue),
    purposeIds: Array.isArray(rollData.purposeIds) ? [...rollData.purposeIds] : [],
    source: {
      actorUuid: textOrNull(actor?.uuid),
      tokenUuid: textOrNull(rollData.sourceTokenUuid),
      itemUuid: textOrNull(sourceItem?.uuid ?? rollData.itemUuid),
      itemId: textOrNull(sourceItem?.id ?? rollData.itemId),
      attackId: textOrNull(rollData.attackId),
      name: textOrNull(sourceItem?.name ?? rollData.label)
    },
    targetActor: {
      actorUuid: textOrNull(target?.actor?.uuid ?? target?.actorUuid),
      tokenUuid: textOrNull(target?.document?.uuid ?? target?.tokenUuid)
    },
    combat: combat ? {
      id: textOrNull(combat.id),
      round: finiteOrNull(combat.round),
      turn: finiteOrNull(combat.turn)
    } : null
  };
}

export function buildCombatConditionEvent({
  eventId = null,
  phase,
  reason = null,
  combat = null,
  combatant = null,
  previous = null
} = {}) {
  const normalizedPhase = textOrNull(phase);
  return {
    version: 1,
    pulse: true,
    type: "combat",
    phase: normalizedPhase,
    reason: textOrNull(reason) || (normalizedPhase === "turn_start" ? "turnStart" : normalizedPhase),
    eventId: textOrNull(eventId),
    combatId: textOrNull(combat?.id),
    combat: combat ? {
      id: textOrNull(combat.id),
      round: finiteOrNull(combat.round),
      turn: finiteOrNull(combat.turn),
      started: combat.started === true || combat.active === true
    } : null,
    combatant: combatant ? {
      id: textOrNull(combatant.id),
      actorId: textOrNull(combatant.actorId ?? combatant.actor?.id),
      actorUuid: textOrNull(combatant.actor?.uuid ?? combatant.actorUuid),
      tokenId: textOrNull(combatant.tokenId ?? combatant.token?.id),
      tokenUuid: textOrNull(tokenUuid(combatant))
    } : null,
    previous: previous ? {
      round: finiteOrNull(previous.round),
      turn: finiteOrNull(previous.turn),
      combatantId: textOrNull(previous.combatantId)
    } : null
  };
}

export function buildActiveEffectConditionEvent({
  eventId = null,
  operation,
  effect = null,
  changes = null
} = {}) {
  return {
    version: 1,
    pulse: true,
    type: "active_effect_change",
    eventId: textOrNull(eventId),
    operation: textOrNull(operation),
    effect: {
      id: textOrNull(effect?.id),
      uuid: textOrNull(effect?.uuid),
      name: textOrNull(effect?.name),
      disabled: effect?.disabled === true,
      statusIds: statusIds(effect),
      origin: textOrNull(effect?.origin)
    },
    changedFields: changes && typeof changes === "object" ? Object.keys(changes).sort() : []
  };
}

export function buildRegionConditionEvent({
  eventId = null,
  phase,
  region = null,
  token = null,
  movement = null,
  teleport = false,
  forced = false
} = {}) {
  const normalizedPhase = phase === "exit" ? "exit" : "enter";
  const scene = region?.parent ?? token?.parent ?? null;
  const actor = token?.actor ?? null;
  const finalWaypoint = movement?.passed?.waypoints?.at?.(-1) ?? movement?.destination ?? null;
  return {
    version: 1,
    pulse: true,
    type: "region",
    family: "scene",
    category: "region",
    phase: normalizedPhase,
    reason: normalizedPhase === "enter" ? "regionEnter" : "regionExit",
    path: `region.${normalizedPhase}`,
    event: `region.${normalizedPhase}`,
    eventId: textOrNull(eventId),
    regionId: textOrNull(region?.id),
    regionUuid: textOrNull(region?.uuid),
    regionName: textOrNull(region?.name),
    sceneId: textOrNull(scene?.id),
    sceneUuid: textOrNull(scene?.uuid),
    tokenId: textOrNull(token?.id),
    tokenUuid: textOrNull(token?.uuid),
    actorId: textOrNull(actor?.id),
    actorUuid: textOrNull(actor?.uuid),
    region: {
      id: textOrNull(region?.id),
      uuid: textOrNull(region?.uuid),
      name: textOrNull(region?.name)
    },
    scene: {
      id: textOrNull(scene?.id),
      uuid: textOrNull(scene?.uuid),
      name: textOrNull(scene?.name)
    },
    token: {
      id: textOrNull(token?.id),
      uuid: textOrNull(token?.uuid),
      name: textOrNull(token?.name),
      actorId: textOrNull(actor?.id),
      actorUuid: textOrNull(actor?.uuid)
    },
    movement: {
      method: textOrNull(movement?.method),
      action: textOrNull(finalWaypoint?.action),
      origin: pointData(movement?.origin),
      destination: pointData(movement?.destination ?? finalWaypoint),
      teleport: teleport === true,
      forced: forced === true
    }
  };
}

export function collectRegionConditionTransitions(token, priorRegionIds = []) {
  const priorIds = new Set(Array.from(priorRegionIds ?? [], value => String(value)));
  const currentRegions = Array.from(token?.regions ?? []);
  const currentById = new Map(currentRegions.map(region => [String(region?.id), region]));
  const sceneRegions = token?.parent?.regions;
  const transitions = [];

  for (const id of priorIds) {
    if (currentById.has(id)) continue;
    const region = sceneRegions?.get?.(id) ?? Array.from(sceneRegions ?? []).find(candidate => String(candidate?.id) === id);
    if (region) transitions.push({ phase: "exit", region });
  }
  for (const [id, region] of currentById) {
    if (!priorIds.has(id)) transitions.push({ phase: "enter", region });
  }
  return transitions;
}

export function buildSceneDarknessConditionEvent({
  eventId = null,
  scene = null,
  before = null,
  after = null
} = {}) {
  const previous = finiteOrNull(before);
  const current = finiteOrNull(after);
  const delta = previous === null || current === null ? null : current - previous;
  return {
    version: 1,
    pulse: true,
    type: "scene",
    family: "scene",
    category: "darkness",
    phase: "change",
    reason: "darknessChange",
    path: "scene.darkness.change",
    event: "scene.darkness.change",
    eventId: textOrNull(eventId),
    sceneId: textOrNull(scene?.id),
    sceneUuid: textOrNull(scene?.uuid),
    sceneName: textOrNull(scene?.name),
    before: previous,
    after: current,
    delta,
    direction: delta === null || delta === 0 ? "none" : delta > 0 ? "darken" : "brighten",
    darkness: {
      before: previous,
      after: current,
      delta
    }
  };
}

export function buildWorldTimeConditionEvent({
  eventId = null,
  worldTime = null,
  delta = null,
  components = null
} = {}) {
  const current = finiteOrNull(worldTime);
  const elapsed = finiteOrNull(delta);
  const previous = current === null || elapsed === null ? null : current - elapsed;
  const phase = elapsed === null || elapsed === 0 ? "change" : elapsed > 0 ? "advance" : "rewind";
  return {
    version: 1,
    pulse: true,
    type: "world_time",
    family: "world",
    category: "time",
    phase,
    reason: phase === "advance" ? "timeAdvance" : phase === "rewind" ? "timeRewind" : "timeChange",
    path: `world.time.${phase}`,
    event: `world.time.${phase}`,
    eventId: textOrNull(eventId),
    worldTime: current,
    previousWorldTime: previous,
    delta: elapsed,
    direction: phase,
    components: components && typeof components === "object" ? { ...components } : null
  };
}
