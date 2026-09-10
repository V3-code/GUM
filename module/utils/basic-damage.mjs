export const BASIC_DAMAGE_KEYS = Object.freeze([
  "thrust_damage",
  "swing_damage",
  "thrust_damage_alt",
  "swing_damage_alt"
]);

const DEFAULTS = Object.freeze({
  thrust_damage: "1d6-2",
  swing_damage: "1d6",
  thrust_damage_alt: "",
  swing_damage_alt: ""
});

export function createBasicDamageData(value = "") {
  return { value: String(value ?? "").trim(), mod: 0, temp: 0, passive: 0, points: 0, override: null, final: "", final_computed: "" };
}

export function normalizeBasicDamageData(data, fallback = "") {
  if (!data || typeof data !== "object" || Array.isArray(data)) return createBasicDamageData(data ?? fallback);
  return {
    value: String(data.value ?? fallback).trim(),
    mod: Number(data.mod) || 0,
    temp: Number(data.temp) || 0,
    passive: Number(data.passive) || 0,
    points: Number(data.points) || 0,
    override: data.override === null || data.override === undefined || data.override === "" ? null : String(data.override).trim(),
    final: String(data.final ?? "").trim(),
    final_computed: String(data.final_computed ?? "").trim()
  };
}

/** Adds a flat integer modifier to a dice expression without changing its dice count. */
export function addBasicDamageModifier(formula, modifier = 0) {
  const base = String(formula ?? "").replace(/\s+/g, "");
  const amount = Number(modifier) || 0;
  if (!base || !amount) return base;
  const match = base.match(/^(\d+)d6([+\-]\d+)?$/i);
  if (!match) return `${base}${amount > 0 ? "+" : ""}${amount}`;
  const total = Number(match[2] || 0) + amount;
  return `${match[1]}d6${total > 0 ? `+${total}` : total < 0 ? total : ""}`;
}

export function prepareBasicDamageAttributes(attributes = {}) {
  for (const key of BASIC_DAMAGE_KEYS) attributes[key] = normalizeBasicDamageData(attributes[key], DEFAULTS[key]);

  for (const key of BASIC_DAMAGE_KEYS) {
    const data = attributes[key];
    const isAlternate = key.endsWith("_alt");
    const inherited = key.startsWith("thrust") ? attributes.thrust_damage.final : attributes.swing_damage.final;
    const base = data.value || (isAlternate ? inherited : DEFAULTS[key]);
    data.final_computed = addBasicDamageModifier(base, data.mod + data.passive + data.temp);
    data.final = data.override ?? data.final_computed;
  }
  return attributes;
}

export function getBasicDamageFormula(data, fallback = "0") {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return String(data.final ?? data.final_computed ?? data.value ?? fallback).trim() || fallback;
  }
  return String(data ?? fallback).trim() || fallback;
}