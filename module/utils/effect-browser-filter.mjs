export const EFFECT_ACTION_TYPES = Object.freeze([
  "attribute", "status", "roll_modifier", "skill_modifier", "combat_modifier", "resource_change",
  "resource_create", "damage_roll", "chat", "macro", "flag"
]);

/** Return every action type exposed by both current and legacy effect records. */
export function getEffectActionTypes(system = {}) {
  const actions = Array.isArray(system.actions) ? system.actions : [];
  const types = actions.map(action => action?.type).filter(Boolean);
  if (system.type) types.push(system.type);
  return [...new Set(types)];
}

/** An effect matches a type filter when at least one of its actions matches. */
export function effectMatchesTypeFilter(system = {}, enabledTypes = {}) {
  const selectedTypes = Object.entries(enabledTypes)
    .filter(([, enabled]) => enabled)
    .map(([type]) => type);
  if (!selectedTypes.length) return true;
  const effectTypes = new Set(getEffectActionTypes(system));
  return selectedTypes.some(type => effectTypes.has(type));
}
