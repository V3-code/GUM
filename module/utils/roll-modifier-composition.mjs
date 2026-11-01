export const ROLL_MODIFIER_COMPOSITION_MODES = Object.freeze([
  "sum",
  "worst",
  "best",
  "priority",
  "once_per_origin"
]);

export function normalizeRollModifierCompositionMode(value) {
  const normalized = String(value ?? "sum").trim().toLowerCase();
  return ROLL_MODIFIER_COMPOSITION_MODES.includes(normalized) ? normalized : "sum";
}

const numericValue = candidate => {
  const value = Number(candidate?.value);
  return Number.isFinite(value) ? value : 0;
};

const chooseWorst = candidates => candidates.reduce((chosen, candidate) =>
  !chosen || numericValue(candidate) < numericValue(chosen) ? candidate : chosen, null);

const chooseBest = candidates => candidates.reduce((chosen, candidate) =>
  !chosen || numericValue(candidate) > numericValue(chosen) ? candidate : chosen, null);

const decorateChoice = (chosen, candidates, group, mode) => ({
  ...chosen,
  compositionGroup: group,
  compositionMode: mode,
  compositionSourceCount: candidates.length,
  compositionSuppressedCount: Math.max(0, candidates.length - 1)
});

/**
 * Compose already evaluated roll-modifier candidates.
 * Entries without a group, or whose mode is "sum", retain legacy additive behavior.
 */
export function composeRollModifiers(candidates = []) {
  const additive = [];
  const grouped = new Map();

  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const group = String(candidate.compositionGroup ?? candidate.composition_group ?? "").trim();
    const mode = normalizeRollModifierCompositionMode(candidate.compositionMode ?? candidate.composition_mode);
    if (!group) {
      additive.push(candidate);
      continue;
    }
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push({ ...candidate, compositionGroup: group, compositionMode: mode });
  }

  const composed = [...additive];
  for (const [group, members] of grouped) {
    // A group should normally use one policy. A non-additive policy configured
    // by any participant governs the whole group, so one forgotten default
    // cannot silently reintroduce a duplicate modifier.
    const mode = members.map(member => normalizeRollModifierCompositionMode(member.compositionMode))
      .find(candidateMode => candidateMode !== "sum") ?? "sum";
    if (mode === "sum") {
      composed.push(...members);
      continue;
    }
    if (mode === "once_per_origin") {
      const byOrigin = new Map();
      for (const member of members) {
        const origin = String(member.compositionOrigin ?? member.composition_origin ?? member.id ?? "").trim();
        if (!byOrigin.has(origin)) byOrigin.set(origin, []);
        byOrigin.get(origin).push(member);
      }
      for (const originMembers of byOrigin.values()) {
        composed.push(decorateChoice(chooseWorst(originMembers), originMembers, group, mode));
      }
      continue;
    }

    let chosen;
    if (mode === "best") chosen = chooseBest(members);
    else if (mode === "priority") {
      const highest = Math.max(...members.map(member => Number(member.compositionPriority ?? member.composition_priority) || 0));
      chosen = chooseWorst(members.filter(member => (Number(member.compositionPriority ?? member.composition_priority) || 0) === highest));
    } else chosen = chooseWorst(members);
    composed.push(decorateChoice(chosen, members, group, mode));
  }
  return composed;
}

export function getRollModifierCompositionOrigin(effect) {
  return String(
    effect?.flags?.gum?.activeEffectBridge?.triggerOrigin
    ?? effect?.flags?.gum?.activeEffectBridge?.carrierUuid
    ?? effect?.origin
    ?? effect?.id
    ?? ""
  ).trim();
}
