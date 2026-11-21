import { cleanDamageTypeLabel } from "./damage-types.mjs";

export function normalizeGCSDamageFormula(value) {
  return String(value || "")
    .trim()
    .replace(/\bthr\b/gi, "gdp")
    .replace(/\bsw\b/gi, "gdb")
    .replace(/d(?!b|p|\d)/gi, "d6");
}

export function extractGCSDamageScaling(value) {
  const raw = String(value || "");
  if (!raw.trim()) return { cleaned: "", scaling: "" };

  const scalingPattern = /([+\-]\s*(?:(?:\d+)?d(?:\d+)?|\d+)(?:[+\-]\d+)?\s*(?:\/\s*[\p{L}_-]+|\b(?:per|por)\s+[\p{L}_-]+))/iu;
  const match = raw.match(scalingPattern);
  if (!match) return { cleaned: raw.trim(), scaling: "" };

  return {
    cleaned: raw.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
    scaling: normalizeGCSDamageFormula(match[1].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim())
  };
}

export function parseGCSDamageType(value) {
  return cleanDamageTypeLabel(value);
}

export function parseGCSDamageParts(damage = {}) {
  const baseScaling = extractGCSDamageScaling(damage.base);
  const typeScaling = extractGCSDamageScaling(damage.type);

  let formula = baseScaling.cleaned;
  let type = parseGCSDamageType(typeScaling.cleaned);
  const scaling = baseScaling.scaling || typeScaling.scaling;

  if (!type && formula) {
    const combinedMatch = formula.match(/^([+\-]?(?:\d+)?d(?:\d+)?(?:[+\-]\d+)?|[+\-]?\d+)\s+(.+)$/i);
    if (combinedMatch) {
      formula = combinedMatch[1].trim();
      type = parseGCSDamageType(combinedMatch[2]);
    }
  }

  return { formula, type, scaling };
}
