import { expandDamageTypeKeys } from "./damage-types.mjs";

const number = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const mergeDamageResistance = (target, source) => {
  if (!source || typeof source !== "object") {
    const value = number(source);
    if (value) target.base = number(target.base) + value;
    return target;
  }

  const collapsed = new Map();
  for (const [type, value] of Object.entries(source)) {
    for (const normalizedType of expandDamageTypeKeys(type)) {
      const isCanonical = type === normalizedType;
      const previous = collapsed.get(normalizedType);
      if (previous?.isCanonical && !isCanonical) continue;
      collapsed.set(normalizedType, { value: number(value), isCanonical });
    }
  }
  for (const [type, entry] of collapsed) target[type] = number(target[type]) + entry.value;
  return target;
};

export const calculateDamageResistance = ({ armor, mod, temp, passive, override } = {}) => {
  const computed = {};
  for (const source of [armor, mod, temp, passive]) mergeDamageResistance(computed, source);

  const final = { ...computed };
  if (override && typeof override === "object") {
    if (override.base !== null && override.base !== undefined) {
      final.base = Math.max(0, number(override.base));
    }

    const finalBase = number(final.base);
    for (const [type, value] of Object.entries(override)) {
      if (type === "base" || value === null || value === undefined) continue;
      // Type overrides are absolute effective DR values. dr_locations stores
      // type entries as deltas from base for backwards compatibility.
      for (const normalizedType of expandDamageTypeKeys(type)) {
        final[normalizedType] = Math.max(0, number(value)) - finalBase;
      }
    }
  }

  return { computed, final };
};

export const parseDamageResistanceEffectPath = (path) => {
  if (typeof path !== "string") return null;
  let normalized = path.trim()
    .replace(/^actor\./, "")
    .replace(/^data\./, "system.");
  if (normalized.startsWith("combat.")) normalized = `system.${normalized}`;
  const match = normalized.match(/^system\.combat\.dr_(mods|temp_mods|passive_mods|overrides)\.([^.]+)(?:\.([^.]+))?$/);
  if (!match) return null;
  return {
    requestedLayer: match[1],
    location: match[2],
    damageType: match[3] || "base"
  };
};
