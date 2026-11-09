import {
  buildExclusiveGroupUpdates,
  getStateEffectGroups,
  isManualStateEffectMode,
  isStateEffectGroupDesired
} from "../utils/state-effect-groups.mjs";
import { GUM_API_HOOKS, emitGumLifecycleHook, resolveGumSourceToken } from "../api/gum-hooks.mjs";

const PERSISTENT_ACTION_TYPES = new Set(["attribute", "flag", "roll_modifier", "skill_modifier", "combat_modifier", "status"]);
const syncQueues = new Map();

function forcedDeletionUpdates(...paths) {
  const forcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
  if (forcedDeletion !== undefined) {
    return Object.fromEntries(paths.map(path => [path, forcedDeletion]));
  }
  return Object.fromEntries(paths.map(path => {
    const separator = path.lastIndexOf(".");
    return [`${path.slice(0, separator)}.-=${path.slice(separator + 1)}`, null];
  }));
}

function actorTargets(actor) {
  // O item e os seus efeitos pertencem ao mesmo Actor. Um token ativo pode
  // expor outro Actor sintético e faria a validação consultar o documento errado.
  return [{ actor, document: null, id: null }];
}

function stateEffects(actor, itemId, groupId) {
  return Array.from(actor.effects || []).filter(effect => {
    const flags = effect.flags?.gum || {};
    return flags.originItemId === itemId && flags.stateEffectGroupId === groupId;
  });
}

async function deleteEffects(actor, effects) {
  const ids = effects.map(effect => effect.id).filter(Boolean);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

async function resolveGroupLinks(group) {
  const links = [];
  const errors = [];
  for (const [linkId, link] of Object.entries(group.effects || {})) {
    const uuid = link.effectUuid || link.uuid;
    if (!uuid) {
      errors.push(`O vínculo ${linkId} não possui UUID.`);
      continue;
    }
    const effectItem = await fromUuid(uuid).catch(() => null);
    if (!effectItem) {
      errors.push(`O efeito vinculado ${uuid} não foi encontrado.`);
      continue;
    }
    const actions = game.gum.getEffectActions(effectItem.system || {});
    links.push({ linkId, effectItem, actions });
  }
  return { links, errors };
}

function matchesAction(effect, linkId, action, actionIndex) {
  const flags = effect.flags?.gum || {};
  if (flags.stateEffectLinkId !== linkId) return false;
  if (flags.actionId != null) return String(flags.actionId) === String(action.id);
  return Number(flags.actionIndex) === actionIndex;
}

async function applyLinkActions(item, group, activationId, link, options = {}) {
  await game.gum.applySingleEffect(link.effectItem, actorTargets(item.parent), {
    actor: item.parent,
    origin: item,
    source: "stateItem",
    stackingDomain: "managed",
    originItemId: item.id,
    stateEffectGroupId: group.id,
    stateEffectLinkId: link.linkId,
    stateEffectActivationId: activationId,
    ...options
  });
}

async function activateGroup(item, group, resolved) {
  const activationId = foundry.utils.randomID();
  await deleteEffects(item.parent, stateEffects(item.parent, item.id, group.id));
  for (const link of resolved.links) await applyLinkActions(item, group, activationId, link);

  const created = stateEffects(item.parent, item.id, group.id);
  const missing = [];
  for (const link of resolved.links) {
    link.actions.forEach((action, actionIndex) => {
      if (PERSISTENT_ACTION_TYPES.has(action.type) && !created.some(effect => matchesAction(effect, link.linkId, action, actionIndex))) {
        missing.push(`${link.effectItem.name}: ${action.label || action.type}`);
      }
    });
  }
  if (missing.length) {
    await deleteEffects(item.parent, created);
    throw new Error(`Ações persistentes não criadas: ${missing.join(", ")}`);
  }

  await item.update({
    [`system.stateEffectGroups.${group.id}.activationId`]: activationId,
    ...forcedDeletionUpdates(`system.stateEffectGroups.${group.id}.runtimeActive`)
  }, { gumStateSync: true });
  return { activated: true, activationId, created: created.length };
}

async function reconcileActiveGroup(item, group, activationId, resolved) {
  const existing = stateEffects(item.parent, item.id, group.id);
  const keep = new Set();
  let created = 0;
  for (const link of resolved.links) {
    for (const [actionIndex, action] of link.actions.entries()) {
      if (!PERSISTENT_ACTION_TYPES.has(action.type)) continue;
      const matches = existing.filter(effect => matchesAction(effect, link.linkId, action, actionIndex));
      if (matches[0]) keep.add(matches[0].id);
      if (!matches.length) {
        await applyLinkActions(item, group, activationId, link, {
          actionIds: [action.id],
          skipInstantEffects: true
        });
        created += 1;
      }
    }
  }
  await deleteEffects(item.parent, existing.filter(effect => !keep.has(effect.id)));
  return { reconciled: true, created };
}

async function refreshActiveGroup(item, group, activationId, resolved) {
  await deleteEffects(item.parent, stateEffects(item.parent, item.id, group.id));
  let created = 0;
  for (const link of resolved.links) {
    const actionIds = link.actions
      .filter(action => PERSISTENT_ACTION_TYPES.has(action.type))
      .map(action => action.id);
    if (!actionIds.length) continue;
    await applyLinkActions(item, group, activationId, link, {
      actionIds,
      skipInstantEffects: true
    });
    created += actionIds.length;
  }
  return { refreshed: true, created };
}

async function performItemStateEffectSync(item, { assumeInactive = false, forceActivationGroupIds = [], refreshActive = false } = {}) {
  const actor = item?.parent;
  if (!actor || !item.id) return { groups: [], errors: [] };
  const report = { groups: [], errors: [] };
  const forcedActivations = new Set(Array.from(forceActivationGroupIds || [], String));

  for (const group of getStateEffectGroups(item)) {
    const desired = isStateEffectGroupDesired(group, item.system);
    const activationId = assumeInactive ? null : item.system.stateEffectGroups?.[group.id]?.activationId;
    if (!desired) {
      const effects = stateEffects(actor, item.id, group.id);
      await deleteEffects(actor, effects);
      if (activationId || item.system.stateEffectGroups?.[group.id]?.runtimeActive !== undefined) {
        await item.update(forcedDeletionUpdates(
          `system.stateEffectGroups.${group.id}.activationId`,
          `system.stateEffectGroups.${group.id}.runtimeActive`
        ), { gumStateSync: true });
      }
      report.groups.push({ id: group.id, active: false, removed: effects.length });
      continue;
    }

    const resolved = await resolveGroupLinks(group);
    if (resolved.errors.length) {
      await deleteEffects(actor, stateEffects(actor, item.id, group.id));
      await item.update(forcedDeletionUpdates(
        `system.stateEffectGroups.${group.id}.activationId`,
        `system.stateEffectGroups.${group.id}.runtimeActive`
      ), { gumStateSync: true });
      report.errors.push(...resolved.errors.map(message => `${group.name}: ${message}`));
      continue;
    }
    try {
      const result = !activationId || forcedActivations.has(String(group.id))
        ? await activateGroup(item, group, resolved)
        : refreshActive
          ? await refreshActiveGroup(item, group, activationId, resolved)
        : await reconcileActiveGroup(item, group, activationId, resolved);
      report.groups.push({ id: group.id, active: true, ...result });
    } catch (error) {
      report.errors.push(`${group.name}: ${error.message}`);
    }
  }

  const validIds = new Set(getStateEffectGroups(item).map(group => group.id));
  await deleteEffects(actor, Array.from(actor.effects || []).filter(effect => {
    const flags = effect.flags?.gum || {};
    return flags.originItemId === item.id && flags.stateEffectGroupId && !validIds.has(flags.stateEffectGroupId);
  }));
  if (report.errors.length) {
    console.error("GUM | Falha na sincronização de Efeitos de Estado:", report.errors);
    ui.notifications.error(`Efeitos de Estado de "${item.name}" não foram aplicados completamente. Consulte o console.`);
  }
  return report;
}

export async function syncItemStateEffects(item, options = {}) {
  if (!item?.uuid) return { groups: [], errors: [] };
  const previous = syncQueues.get(item.uuid) || Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => performItemStateEffectSync(item, options));
  syncQueues.set(item.uuid, pending);
  try {
    return await pending;
  } finally {
    if (syncQueues.get(item.uuid) === pending) syncQueues.delete(item.uuid);
  }
}

export async function setStateEffectGroupActive(item, groupId, active) {
  const groups = getStateEffectGroups(item);
  const group = groups.find(entry => entry.id === groupId);
  if (!group || !isManualStateEffectMode(group.mode)) return false;
  const updates = { [`system.stateEffectGroups.${groupId}.active`]: active === true };
  if (active) Object.assign(updates, buildExclusiveGroupUpdates(groups, groupId));
  await item.update(updates, { gumStateToggle: true });
  // A intenção da interação precisa chegar diretamente à sincronização. Ações
  // instantâneas não criam ActiveEffect e um activationId antigo ou atrasado não
  // pode transformar uma reativação explícita em uma simples reconciliação.
  const report = await syncItemStateEffects(item, {
    refreshActive: true,
    forceActivationGroupIds: active ? [groupId] : []
  });
  const updatedGroup = getStateEffectGroups(item).find(entry => entry.id === groupId) || group;
  emitGumLifecycleHook(GUM_API_HOOKS.STATE_EFFECT_GROUP_CHANGED, {
    actor: item.parent,
    sourceToken: resolveGumSourceToken(item.parent),
    item,
    action: {
      type: "state-effect-group",
      id: groupId,
      label: updatedGroup.name,
      data: updatedGroup
    },
    targets: actorTargets(item.parent),
    result: {
      active: active === true,
      synchronized: report.errors.length === 0,
      report
    },
    metadata: { mode: updatedGroup.mode || null }
  });
  return report.errors.length === 0;
}

export async function reconcileAllStateEffects(actors = game.actors) {
  const activeGMs = Array.from(game.users || []).filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id));
  if (activeGMs.length && activeGMs[0].id !== game.user.id) return;
  for (const actor of actors || []) {
    if (!game.user.isGM && !actor.isOwner) continue;
    for (const item of actor.items || []) {
      if (getStateEffectGroups(item).length) await syncItemStateEffects(item, { refreshActive: true });
    }
  }
}

export async function removeAllStateEffectsForItem(item) {
  if (item?.parent) await deleteEffects(item.parent, Array.from(item.parent.effects || []).filter(effect => {
    const flags = effect.flags?.gum || {};
    return flags.originItemId === item.id && Boolean(flags.stateEffectGroupId);
  }));
}
