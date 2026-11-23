import { isPersistentEffectAction } from "../utils/effect-stacking.mjs";

const syncQueues = new Map();

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return Array.from(collection);
}

function gumFlags(effect) {
  return effect?.flags?.gum || {};
}

function actionMatches(effect, action, actionIndex) {
  const flags = gumFlags(effect);
  if (flags.actionId != null && action?.id != null) {
    return String(flags.actionId) === String(action.id);
  }
  return Number(flags.actionIndex ?? 0) === Number(actionIndex);
}

function matchesDescriptor(effect, descriptor, { allowLegacyLink = false } = {}) {
  const flags = gumFlags(effect);
  if (flags.source !== "passiveItem") return false;
  if (String(flags.originItemId || "") !== String(descriptor.originItemId || "")) return false;
  if (String(flags.effectUuid || "") !== String(descriptor.effectUuid || "")) return false;
  if (!actionMatches(effect, descriptor.action, descriptor.actionIndex)) return false;
  if (flags.passiveEffectLinkId != null) {
    return String(flags.passiveEffectLinkId) === String(descriptor.linkId);
  }
  return allowLegacyLink;
}

function originRepairUpdates(effect, item, linkId) {
  const flags = gumFlags(effect);
  const updates = {};
  if (effect.origin !== item.uuid) updates.origin = item.uuid;
  if (String(flags.originItemId || "") !== String(item.id)) updates["flags.gum.originItemId"] = item.id;
  if (String(flags.passiveEffectLinkId || "") !== String(linkId)) updates["flags.gum.passiveEffectLinkId"] = linkId;
  if (flags.valueScaling) {
    if (String(flags.valueScaling.originItemId || "") !== String(item.id)) {
      updates["flags.gum.valueScaling.originItemId"] = item.id;
    }
    if (flags.valueScaling.originItemUuid !== item.uuid) {
      updates["flags.gum.valueScaling.originItemUuid"] = item.uuid;
    }
  }
  if (Array.isArray(flags.rollModifier?.entries) && flags.rollModifier.entries.some(entry =>
    String(entry.origin_item_id || "") !== String(item.id) || entry.origin_item_uuid !== item.uuid
  )) {
    updates["flags.gum.rollModifier.entries"] = flags.rollModifier.entries.map(entry => ({
      ...entry,
      origin_item_id: item.id,
      origin_item_uuid: item.uuid
    }));
  }
  return updates;
}

async function deleteEffects(actor, effects) {
  const ids = effects.map(effect => effect?.id).filter(Boolean);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

function missingDescriptors(actor, descriptors) {
  const candidates = new Set(values(actor.effects));
  const missing = [];
  for (const descriptor of descriptors) {
    const effect = [...candidates].find(candidate => matchesDescriptor(candidate, descriptor));
    if (effect) candidates.delete(effect);
    else missing.push(descriptor);
  }
  return missing;
}

function recordApplicationResult(report, actor, descriptors, entry) {
  const missing = missingDescriptors(actor, descriptors);
  report.created += descriptors.length - missing.length;
  if (missing.length) {
    report.errors.push({
      linkId: entry.linkId,
      effectUuid: entry.effectUuid,
      message: `${missing.length} ação(ões) persistente(s) não produziram ActiveEffect.`
    });
  }
}

function persistentDescriptors(entry, item) {
  const usesDynamicRegionController = Number(globalThis.game?.release?.generation) >= 14
    && typeof globalThis.CONFIG?.Region?.documentClass?.createTokenEmanation === "function"
    && entry.effectItem.system?.dynamicRegion?.enabled === true;
  const actions = usesDynamicRegionController
    ? [{ action: { id: "dynamic-region", type: "dynamic_region" }, actionIndex: -1 }]
    : entry.actions.map((action, actionIndex) => ({ action, actionIndex }))
      .filter(({ action }) => isPersistentEffectAction(action));
  return actions.map(({ action, actionIndex }) => ({
    originItemId: item.id,
    linkId: entry.linkId,
    effectUuid: entry.effectUuid,
    action,
    actionIndex
  }));
}

async function resolveLinks(item, { resolveUuid, getActions }) {
  const resolved = [];
  const errors = [];
  for (const [linkId, link] of Object.entries(item.system?.passiveEffects || {})) {
    const effectUuid = link?.effectUuid || link?.uuid;
    if (!effectUuid) {
      errors.push({ linkId, effectUuid: null, message: `O vínculo passivo ${linkId} não possui UUID.` });
      continue;
    }
    let effectItem = null;
    try {
      effectItem = await resolveUuid(effectUuid);
    } catch (error) {
      errors.push({ linkId, effectUuid, message: error?.message || String(error) });
      continue;
    }
    if (!effectItem) {
      errors.push({ linkId, effectUuid, message: `O efeito vinculado ${effectUuid} não foi encontrado.` });
      continue;
    }
    const actions = getActions(effectItem.system || {});
    resolved.push({ linkId, link, effectUuid, effectItem, actions });
  }
  return { resolved, errors };
}

async function performPassiveItemEffectSync(item, {
  mode = "reconcile",
  refreshPersistent = false,
  resolveUuid = globalThis.fromUuid,
  getActions = globalThis.game?.gum?.getEffectActions,
  applyEffect = globalThis.game?.gum?.applySingleEffect,
  buildTargets = actor => [{ actor, id: null, document: null }]
} = {}) {
  const actor = item?.parent;
  if (!actor || !item?.id) return { created: 0, kept: 0, removed: 0, errors: [] };
  if (typeof resolveUuid !== "function" || typeof getActions !== "function" || typeof applyEffect !== "function") {
    throw new Error("A sincronização de efeitos passivos não possui todas as dependências necessárias.");
  }

  const report = { created: 0, kept: 0, removed: 0, errors: [] };
  const { resolved, errors } = await resolveLinks(item, { resolveUuid, getActions });
  report.errors.push(...errors);

  const existing = values(actor.effects).filter(effect => {
    const flags = gumFlags(effect);
    return flags.source === "passiveItem" && String(flags.originItemId || "") === String(item.id);
  });
  const unclaimed = new Set(existing);
  const unresolvedLinkIds = new Set(errors.map(error => String(error.linkId)));

  for (const entry of resolved) {
    const descriptors = persistentDescriptors(entry, item);

    const matches = [];
    for (const descriptor of descriptors) {
      let effect = [...unclaimed].find(candidate => matchesDescriptor(candidate, descriptor));
      if (!effect) effect = [...unclaimed].find(candidate => matchesDescriptor(candidate, descriptor, { allowLegacyLink: true }));
      if (effect) {
        unclaimed.delete(effect);
        matches.push({ effect, descriptor });
      } else {
        matches.push({ effect: null, descriptor });
      }
    }

    const matchedEffects = matches.map(match => match.effect).filter(Boolean);
    if (refreshPersistent) {
      await deleteEffects(actor, matchedEffects);
      report.removed += matchedEffects.length;
      const actionIds = descriptors.map(descriptor => descriptor.action?.id).filter(id => id != null);
      if (descriptors.length) {
        try {
          await applyEffect(entry.effectItem, buildTargets(actor), {
            actor,
            origin: item,
            source: "passiveItem",
            stackingDomain: "managed",
            originItemId: item.id,
            passiveEffectLinkId: entry.linkId,
            skipInstantEffects: true,
            ...(actionIds.length === descriptors.length ? { actionIds } : {})
          });
          recordApplicationResult(report, actor, descriptors, entry);
        } catch (error) {
          report.errors.push({ linkId: entry.linkId, effectUuid: entry.effectUuid, message: error?.message || String(error) });
        }
      }
      continue;
    }

    for (const { effect, descriptor } of matches) {
      if (!effect) continue;
      report.kept += 1;
      if (typeof effect.update === "function") {
        const updates = originRepairUpdates(effect, item, descriptor.linkId);
        if (Object.keys(updates).length) await effect.update(updates);
      }
    }

    const missing = matches.filter(match => !match.effect).map(match => match.descriptor);
    const isBrandNewLink = matchedEffects.length === 0 && missing.length === descriptors.length;
    if (mode === "initial" && isBrandNewLink) {
      try {
        await applyEffect(entry.effectItem, buildTargets(actor), {
          actor,
          origin: item,
          source: "passiveItem",
          stackingDomain: "managed",
          originItemId: item.id,
          passiveEffectLinkId: entry.linkId
        });
        recordApplicationResult(report, actor, descriptors, entry);
      } catch (error) {
        report.errors.push({ linkId: entry.linkId, effectUuid: entry.effectUuid, message: error?.message || String(error) });
      }
    } else if (missing.length) {
      const actionIds = missing.map(descriptor => descriptor.action?.id).filter(id => id != null);
      try {
        await applyEffect(entry.effectItem, buildTargets(actor), {
          actor,
          origin: item,
          source: "passiveItem",
          stackingDomain: "managed",
          originItemId: item.id,
          passiveEffectLinkId: entry.linkId,
          skipInstantEffects: true,
          ...(actionIds.length === missing.length ? { actionIds } : {})
        });
        recordApplicationResult(report, actor, missing, entry);
      } catch (error) {
        report.errors.push({ linkId: entry.linkId, effectUuid: entry.effectUuid, message: error?.message || String(error) });
      }
    }
  }

  const stale = [...unclaimed].filter(effect => {
    const flags = gumFlags(effect);
    const linkId = flags.passiveEffectLinkId;
    if (linkId != null) return !unresolvedLinkIds.has(String(linkId));
    return !errors.some(error => error.effectUuid && String(error.effectUuid) === String(flags.effectUuid || ""));
  });
  await deleteEffects(actor, stale);
  report.removed += stale.length;
  return report;
}

export async function syncPassiveItemEffects(item, options = {}) {
  if (!item?.uuid) return { created: 0, kept: 0, removed: 0, errors: [] };
  const previous = syncQueues.get(item.uuid) || Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => performPassiveItemEffectSync(item, options));
  syncQueues.set(item.uuid, pending);
  try {
    return await pending;
  } finally {
    if (syncQueues.get(item.uuid) === pending) syncQueues.delete(item.uuid);
  }
}
