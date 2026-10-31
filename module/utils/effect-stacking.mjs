export const EFFECT_STACKING_MODES = Object.freeze(["stack", "unique", "refresh"]);

export const PERSISTENT_EFFECT_ACTION_TYPES = new Set([
  "attribute",
  "flag",
  "roll_modifier",
  "skill_modifier",
  "combat_modifier",
  "status"
]);

export const INSTANT_EFFECT_ACTION_TYPES = new Set([
  "resource_change",
  "resource_create",
  "damage_roll",
  "macro",
  "chat"
]);

const MANAGED_EFFECT_SOURCES = new Set([
  "passiveItem",
  "equipmentModifierFeature",
  "stateItem",
  "statusBinding"
]);

export function normalizeEffectStackingMode(effectSystem = {}) {
  const mode = String(effectSystem?.conditionStackingMode || "stack").trim().toLowerCase();
  return EFFECT_STACKING_MODES.includes(mode) ? mode : "stack";
}

export function resolveEffectStackingDomain(context = {}) {
  if (context?.conditionId) return "condition";
  if (["direct", "condition", "managed"].includes(context?.stackingDomain)) return context.stackingDomain;
  if (MANAGED_EFFECT_SOURCES.has(context?.source)) return "managed";
  return "direct";
}

export function resolveStoredEffectStackingDomain(effectOrFlags = {}) {
  const flags = effectOrFlags?.flags?.gum || effectOrFlags?.gum || effectOrFlags || {};
  if (["direct", "condition", "managed"].includes(flags.stackingDomain)) return flags.stackingDomain;
  if (flags.conditionEffect === true || flags.conditionId || flags.conditionIds?.length) return "condition";
  if (MANAGED_EFFECT_SOURCES.has(flags.source)
    || flags.stateEffectGroupId
    || flags.statusBindingRuleUuid) return "managed";
  return "direct";
}

export function isPersistentEffectAction(actionOrType) {
  const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
  return PERSISTENT_EFFECT_ACTION_TYPES.has(type);
}

export function isInstantEffectAction(actionOrType) {
  const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
  return INSTANT_EFFECT_ACTION_TYPES.has(type);
}

export function matchesStackedEffect(effect, { effectUuid, action, actionIndex = 0, domain = "direct" } = {}) {
  const flags = effect?.flags?.gum || effect?.gum || effect || {};
  if (!effectUuid || flags.effectUuid !== effectUuid) return false;
  if (resolveStoredEffectStackingDomain(flags) !== domain) return false;

  const actionId = action?.id;
  if (actionId != null && flags.actionId != null) {
    return String(flags.actionId) === String(actionId);
  }
  return Number(flags.actionIndex ?? 0) === Number(actionIndex);
}

export function collectConditionOwners(effect, conditionId = null) {
  const flags = effect?.flags?.gum || effect?.gum || effect || {};
  const stored = Array.isArray(flags.conditionIds)
    ? flags.conditionIds
    : [flags.conditionId].filter(Boolean);
  return [...new Set([...stored, conditionId].filter(Boolean).map(String))];
}
