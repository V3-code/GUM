import { resolveStoredEffectStackingDomain } from "./effect-stacking.mjs";

export const EFFECT_EXCLUSION_SETTING = "effectExclusionGroups";

export function normalizeEffectExclusionGroups(value) {
  const groups = Array.isArray(value) ? value : [];
  const used = new Set();
  return groups.map((group, index) => {
    const uuids = [...new Set((Array.isArray(group?.effectUuids) ? group.effectUuids : [])
      .filter(uuid => typeof uuid === "string" && uuid.trim())
      .map(uuid => uuid.trim()))];
    for (const uuid of uuids) {
      if (used.has(uuid)) throw new Error(`Item Efeito em mais de um grupo de exclusão: ${uuid}`);
      used.add(uuid);
    }
    return { id: String(group?.id || `group-${index + 1}`), name: String(group?.name || "").trim(), effectUuids: uuids };
  });
}

export function exclusionPeers(groups, effectUuid) {
  const group = normalizeEffectExclusionGroups(groups).find(entry => entry.effectUuids.includes(effectUuid));
  return new Set((group?.effectUuids || []).filter(uuid => uuid !== effectUuid));
}

export function replacedDirectEffectIds(effects, peers) {
  return Array.from(effects || []).filter(effect =>
    peers.has(effect?.flags?.gum?.effectUuid)
    && resolveStoredEffectStackingDomain(effect) === "direct"
  ).map(effect => effect.id).filter(Boolean);
}
