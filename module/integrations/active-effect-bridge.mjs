export const GUM_EFFECT_BRIDGE_FLAG = "effectItemBridge";
export const GUM_EFFECT_BRIDGE_VERSION = 1;

const documentName = document => document?.documentName || document?.constructor?.documentName || null;
const collectionValues = collection => Array.from(collection?.values?.() ?? collection ?? []);
const resolveDocument = async (resolveUuid, uuid) => {
  if (typeof resolveUuid !== "function" || !uuid) return null;
  try {
    return await resolveUuid(uuid);
  } catch (_error) {
    return null;
  }
};

export function getEffectItemBridgeData(effect) {
  return effect?.flags?.gum?.[GUM_EFFECT_BRIDGE_FLAG] ?? null;
}

export function isEffectItemBridge(effect) {
  const bridge = getEffectItemBridgeData(effect);
  return Boolean(bridge?.effectItemUuid);
}

export function isEffectItemBridgeSource(effect) {
  return isEffectItemBridge(effect) && documentName(effect?.parent) === "Item";
}

export function isEffectItemBridgeCarrier(effect) {
  return isEffectItemBridge(effect) && documentName(effect?.parent) === "Actor";
}

export function findEffectItemBridge(item) {
  if (documentName(item) !== "Item" || item?.type !== "effect") return null;
  return collectionValues(item.effects).find(isEffectItemBridgeSource) ?? null;
}

export function buildEffectItemBridgeData(item, { namePrefix = "GUM" } = {}) {
  return {
    name: `${namePrefix}: ${item?.name || "Effect"}`,
    img: null,
    showIcon: 0,
    origin: item?.uuid ?? null,
    transfer: false,
    disabled: false,
    changes: [],
    statuses: [],
    duration: {},
    flags: {
      gum: {
        [GUM_EFFECT_BRIDGE_FLAG]: {
          version: GUM_EFFECT_BRIDGE_VERSION,
          effectItemUuid: item?.uuid ?? null
        }
      }
    }
  };
}

const bridgeNeedsUpdate = (bridge, desired) => {
  const current = getEffectItemBridgeData(bridge);
  return bridge?.name !== desired.name
    || bridge?.img !== desired.img
    || bridge?.disabled !== false
    || bridge?.transfer !== false
    || collectionValues(bridge?.changes).length > 0
    || collectionValues(bridge?.statuses).length > 0
    || current?.version !== GUM_EFFECT_BRIDGE_VERSION
    || current?.effectItemUuid !== desired.flags.gum[GUM_EFFECT_BRIDGE_FLAG].effectItemUuid;
};

/** Ensure that a GUM Effect Item exposes one inert ActiveEffect for native Foundry integrations. */
export async function ensureEffectItemBridge(item, { namePrefix = "GUM" } = {}) {
  if (documentName(item) !== "Item" || item?.type !== "effect") return null;
  const desired = buildEffectItemBridgeData(item, { namePrefix });
  const bridges = collectionValues(item.effects).filter(isEffectItemBridgeSource);
  let bridge = bridges[0] ?? null;

  if (!bridge) {
    if (typeof item.createEmbeddedDocuments !== "function") return null;
    const created = await item.createEmbeddedDocuments("ActiveEffect", [desired], { gumEffectBridgeSync: true });
    bridge = created?.[0] ?? null;
  } else if (bridgeNeedsUpdate(bridge, desired) && typeof bridge.update === "function") {
    await bridge.update(desired, { gumEffectBridgeSync: true });
  }

  const duplicateIds = bridges.slice(1).map(effect => effect.id).filter(Boolean);
  if (duplicateIds.length && typeof item.deleteEmbeddedDocuments === "function") {
    await item.deleteEmbeddedDocuments("ActiveEffect", duplicateIds, { gumEffectBridgeSync: true });
  }
  return bridge;
}

export function buildEffectItemBridgeApplicationContext(carrier, { applicationId } = {}) {
  const bridge = getEffectItemBridgeData(carrier);
  const id = applicationId || carrier?.flags?.gum?.[GUM_EFFECT_BRIDGE_FLAG]?.applicationId || null;
  return {
    applicationId: id,
    mode: "active-effect-bridge",
    source: "activeEffectBridge",
    stackingDomain: "managed",
    origin: carrier,
    gumFlags: {
      activeEffectBridge: {
        carrierUuid: carrier?.uuid ?? null,
        carrierId: carrier?.id ?? null,
        effectItemUuid: bridge?.effectItemUuid ?? null,
        applicationId: id,
        triggerOrigin: carrier?.origin ?? null
      }
    }
  };
}

export async function activateEffectItemBridgeCarrier(carrier, {
  resolveUuid = globalThis.fromUuid,
  randomId = () => globalThis.foundry?.utils?.randomID?.(),
  buildTargets,
  applyEffect
} = {}) {
  if (!isEffectItemBridgeCarrier(carrier) || carrier.disabled) return { applied: false, reason: "not-active-carrier" };
  const bridge = getEffectItemBridgeData(carrier);
  if (bridge.applicationId) return { applied: false, reason: "already-applied", applicationId: bridge.applicationId };
  const effectItem = await resolveDocument(resolveUuid, bridge.effectItemUuid);
  if (documentName(effectItem) !== "Item" || effectItem?.type !== "effect") {
    return { applied: false, reason: "missing-effect-item" };
  }

  const applicationId = randomId?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await carrier.update({
    [`flags.gum.${GUM_EFFECT_BRIDGE_FLAG}.applicationId`]: applicationId
  }, { gumEffectBridgeSync: true, gumSkipConditionProcessing: true });

  const targets = buildTargets?.(carrier.parent) ?? [];
  if (!targets.length) {
    await carrier.update({
      [`flags.gum.${GUM_EFFECT_BRIDGE_FLAG}.applicationId`]: null
    }, { gumEffectBridgeSync: true, gumSkipConditionProcessing: true });
    return { applied: false, reason: "missing-target", applicationId };
  }
  try {
    await applyEffect(effectItem, targets, buildEffectItemBridgeApplicationContext(carrier, { applicationId }));
  } catch (error) {
    await carrier.update({
      [`flags.gum.${GUM_EFFECT_BRIDGE_FLAG}.applicationId`]: null
    }, { gumEffectBridgeSync: true, gumSkipConditionProcessing: true }).catch(() => undefined);
    throw error;
  }
  return { applied: true, applicationId, effectItem };
}

export function findEffectsGeneratedByBridge(actor, carrier) {
  const bridge = getEffectItemBridgeData(carrier);
  const carrierUuid = carrier?.uuid ?? null;
  const applicationId = bridge?.applicationId ?? null;
  return collectionValues(actor?.effects).filter(effect => {
    if (effect === carrier) return false;
    const link = effect?.flags?.gum?.activeEffectBridge;
    if (!link) return false;
    if (carrierUuid && link.carrierUuid === carrierUuid) return true;
    return Boolean(applicationId && link.applicationId === applicationId);
  });
}

export async function cleanupEffectItemBridgeCarrier(carrier, { actor = carrier?.parent } = {}) {
  if (!isEffectItemBridgeCarrier(carrier) || documentName(actor) !== "Actor") return [];
  const ids = findEffectsGeneratedByBridge(actor, carrier).map(effect => effect.id).filter(Boolean);
  if (ids.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids, {
      gumEffectBridgeCleanup: true,
      gumSkipConditionProcessing: true
    });
  }
  return ids;
}

export async function deactivateEffectItemBridgeCarrier(carrier) {
  const ids = await cleanupEffectItemBridgeCarrier(carrier);
  if (typeof carrier?.update === "function") {
    await carrier.update({
      [`flags.gum.${GUM_EFFECT_BRIDGE_FLAG}.applicationId`]: null
    }, { gumEffectBridgeSync: true, gumSkipConditionProcessing: true });
  }
  return ids;
}

/** Prevent delayed resistance results from applying after the carrier was removed or disabled. */
export async function isEffectItemBridgeApplicationActive(context, { resolveUuid = globalThis.fromUuid } = {}) {
  const link = context?.gumFlags?.activeEffectBridge;
  if (!link?.carrierUuid) return true;
  const carrier = await resolveDocument(resolveUuid, link.carrierUuid);
  if (!isEffectItemBridgeCarrier(carrier) || carrier.disabled) return false;
  const bridge = getEffectItemBridgeData(carrier);
  return !link.applicationId || bridge?.applicationId === link.applicationId;
}

export async function synchronizeWorldEffectItemBridges({
  items = globalThis.game?.items,
  actors = globalThis.game?.actors
} = {}) {
  const candidates = [
    ...collectionValues(items),
    ...collectionValues(actors).flatMap(actor => collectionValues(actor?.items))
  ].filter(item => item?.type === "effect" && (item?.isOwner ?? true));
  const results = [];
  for (const item of candidates) {
    try {
      const bridge = await ensureEffectItemBridge(item);
      if (bridge) results.push(bridge);
    } catch (error) {
      console.warn(`GUM | Não foi possível sincronizar a ponte ActiveEffect de "${item?.name || "Efeito"}".`, error);
    }
  }
  return results;
}
