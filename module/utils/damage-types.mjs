const fold = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[–—−]/g, "-")
  .replace(/\s+/g, " ")
  .trim();

export const DAMAGE_TYPE_DEFINITIONS = Object.freeze([
  { id: "cont", aliases: ["cont", "contusao", "cr", "crush", "crushing", "crusing"] },
  { id: "cort", aliases: ["cort", "corte", "cut", "cutting"] },
  { id: "perf", aliases: ["perf", "perfuracao", "imp", "impaling"] },
  { id: "pi++", aliases: ["pi++", "pa++", "extremamente perfurante", "huge piercing"] },
  { id: "pi+", aliases: ["pi+", "pa+", "muito perfurante", "large piercing"] },
  { id: "pi-", aliases: ["pi-", "pa-", "pouco perfurante", "small piercing"] },
  { id: "pi", aliases: ["pi", "pa", "perfurante", "piercing"] },
  { id: "qmd", aliases: ["qmd", "queimadura", "burn", "burning", "bur", "brn", "cold", "freezing"] },
  { id: "cor", aliases: ["cor", "corr", "corrosao", "corrosion"] },
  { id: "tox", aliases: ["tox", "toxina", "toxic"] },
  { id: "fat", aliases: ["fat", "fad", "fadiga", "fatigue"] }
]);

const aliasToId = new Map();
for (const definition of DAMAGE_TYPE_DEFINITIONS) {
  for (const alias of definition.aliases) aliasToId.set(fold(alias), definition.id);
}

const DAMAGE_RESISTANCE_NATURE_ALIASES = new Map([
  ["fire", "fire"], ["fogo", "fire"], ["heat/fire", "fire"],
  ["cold", "cold"], ["freezing", "cold"], ["frio", "cold"], ["gelo", "cold"],
  ["electrical", "electricity"], ["electricity", "electricity"], ["lightning", "electricity"], ["eletricidade", "electricity"],
  ["acid", "acid"], ["acido", "acid"],
  ["poison", "poison"], ["veneno", "poison"],
  ["magic", "magical-force"], ["magical", "magical-force"], ["magia", "magical-force"],
  ["psionic", "psychic"], ["psychic", "psychic"], ["psiquico", "psychic"],
  ["radiation", "radiation"], ["radiacao", "radiation"],
  ["sonic", "sonic"], ["sonico", "sonic"],
  ["water", "water"], ["agua", "water"], ["air", "air"], ["ar", "air"], ["earth", "earth"], ["terra", "earth"],
  ["cosmic", "cosmic"], ["cosmico", "cosmic"],
  ["metal", "custom:metal"], ["energy", "custom:energy"], ["physical", "custom:physical"]
]);

const tokenPatterns = [
  [/\b(?:pi|pa)\s*\+\s*\+/i, "pi++"],
  [/\b(?:pi|pa)\s*\+/i, "pi+"],
  [/\b(?:pi|pa)\s*-/i, "pi-"],
  [/\b(?:contus[aã]o|crushing|crusing|crush|cont|cr)\b/i, "cont"],
  [/\b(?:cutting|corte|cort|cut)\b/i, "cort"],
  [/\b(?:perfura[cç][aã]o|impaling|perf|imp)\b/i, "perf"],
  [/\b(?:extremamente\s+perfurante|huge\s+piercing)\b/i, "pi++"],
  [/\b(?:muito\s+perfurante|large\s+piercing)\b/i, "pi+"],
  [/\b(?:pouco\s+perfurante|small\s+piercing)\b/i, "pi-"],
  [/\b(?:perfurante|piercing|pi|pa)\b/i, "pi"],
  [/\b(?:queimadura|burning|freezing|burn|fire|cold|qmd|bur|brn)\b/i, "qmd"],
  [/\b(?:corros[aã]o|corrosion|corr|cor)\b/i, "cor"],
  [/\b(?:toxina|toxic|tox)\b/i, "tox"],
  [/\b(?:fadiga|fatigue|fad|fat)\b/i, "fat"]
];

/** Preserve the source spelling for display while removing accidental whitespace. */
export function cleanDamageTypeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/\b(pi|pa)\s*([+-])\s*([+]?)/gi, (_match, base, sign, second) => `${base}${sign}${second}`)
    .replace(/\s+/g, " ");
}

/** Parse the editable "base, effective type" notation while preserving typed aliases. */
export function parseDamageResistanceString(value) {
  if (value && typeof value === "object") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return {};

  const parts = raw.split(",").map(part => part.trim()).filter(Boolean);
  const parsed = {};
  const basePart = parts.find(part => /^[-+]?\d+(?:[.,]\d+)?$/.test(part));
  const base = basePart ? Number(basePart.replace(",", ".")) : 0;
  if (basePart) parsed.base = base;

  for (const part of parts) {
    const match = part.match(/^([-+]?\d+(?:[.,]\d+)?)\s+(.+)$/);
    if (!match) continue;
    const effective = Number(match[1].replace(",", "."));
    const sourceKey = cleanDamageTypeLabel(match[2]).toLowerCase();
    if (!sourceKey || !Number.isFinite(effective)) continue;
    parsed[sourceKey] = basePart ? effective - base : effective;
  }

  return parsed;
}

export function formatDamageResistanceKey(value) {
  const key = String(value ?? "");
  if (key.startsWith("nature:custom:")) return key.slice("nature:custom:".length);
  if (key.startsWith("nature:")) return key.slice("nature:".length);
  return key;
}

/** Resolve localized names, legacy keys and decorated GCS types to one mechanical key. */
export function normalizeDamageTypeKey(value, { preserveUnknown = true } = {}) {
  const raw = cleanDamageTypeLabel(value);
  const normalized = fold(raw);
  if (!normalized || normalized === "base") return normalized || "base";

  const direct = aliasToId.get(normalized);
  if (direct) return direct;
  if (/^non(?:-|\s)/.test(normalized)) return preserveUnknown ? normalized : "";

  let earliest = null;
  for (const [pattern, id] of tokenPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    if (!earliest || match.index < earliest.index || (match.index === earliest.index && match[0].length > earliest.length)) {
      earliest = { id, index: match.index, length: match[0].length };
    }
  }
  if (earliest) return earliest.id;
  return preserveUnknown ? normalized : "";
}

/** Expand compound and exclusion-based GCS DR specializations to mechanical keys. */
export function expandDamageTypeKeys(value) {
  const normalized = fold(cleanDamageTypeLabel(value));
  if (!normalized || normalized === "base" || normalized === "all") return ["base"];
  if (normalized.startsWith("nature:")) return [normalized];

  const natureId = DAMAGE_RESISTANCE_NATURE_ALIASES.get(normalized);
  if (natureId) return [`nature:${natureId}`];

  const direct = aliasToId.get(normalized);
  if (direct) return [direct];

  const negated = normalized.match(/^non(?:-|\s+)(.+?)(?:\s+damage\s+type)?$/);
  if (negated) {
    const excluded = new Set(expandDamageTypeKeys(negated[1]));
    return DAMAGE_TYPE_DEFINITIONS.map(definition => definition.id).filter(id => !excluded.has(id));
  }

  const found = [];
  for (const [pattern, id] of tokenPatterns) {
    if (pattern.test(normalized) && !found.includes(id)) found.push(id);
  }
  if (/\b(?:piercing|perfurante)\b/.test(normalized) && !/\b(?:small|large|huge|pouco|muito|extremamente)\b/.test(normalized)) {
    const plainPiercingIndex = found.indexOf("pi");
    if (plainPiercingIndex >= 0) found.splice(plainPiercingIndex, 1, "pi-", "pi", "pi+", "pi++");
  }
  if (found.length > 1 || /\b(?:and|or|e|ou)\b|,/.test(normalized)) return found.length ? found : [normalized];
  return [normalizeDamageTypeKey(normalized)];
}

export function areDamageTypesEquivalent(left, right) {
  return normalizeDamageTypeKey(left) === normalizeDamageTypeKey(right);
}

/** Resolve one specialization without applying synonymous keys more than once. */
function getDamageResistanceSpecializationModifier(drObject, requested) {
  if (!drObject || typeof drObject !== "object") return 0;
  if (!requested || requested === "base") return 0;
  let selected = 0;
  let found = false;
  let foundCanonical = false;
  for (const [key, value] of Object.entries(drObject)) {
    if (key === "base" || !expandDamageTypeKeys(key).includes(requested)) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const isCanonical = fold(key) === requested;
    if (foundCanonical && !isCanonical) continue;
    selected = numeric;
    found = true;
    foundCanonical = isCanonical;
  }
  return found ? selected : 0;
}

export function getDamageResistanceTypeModifier(drObject, damageType) {
  return getDamageResistanceSpecializationModifier(drObject, normalizeDamageTypeKey(damageType));
}

export function getDamageResistanceContextModifier(drObject, damageType, damageNature = null) {
  if (!drObject || typeof drObject !== "object") return 0;
  const requestedType = normalizeDamageTypeKey(damageType);
  const natureId = typeof damageNature === "object" ? damageNature?.id : fold(damageNature);
  const requestedNature = natureId ? `nature:${natureId}` : "";

  const typeModifier = getDamageResistanceSpecializationModifier(drObject, requestedType);
  const natureModifier = requestedNature && requestedNature !== requestedType
    ? getDamageResistanceSpecializationModifier(drObject, requestedNature)
    : 0;
  return typeModifier + natureModifier;
}

/** Resolve the final non-negative DR for a damage type/nature against one location object. */
export function getDamageResistanceValue(drObject, damageType, damageNature = null) {
  if (drObject === null || drObject === undefined) return 0;
  if (typeof drObject !== "object") {
    const numeric = Number(drObject);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }
  const base = Number(drObject.base);
  const baseDR = Number.isFinite(base) ? base : 0;
  return Math.max(0, baseDR + getDamageResistanceContextModifier(drObject, damageType, damageNature));
}

/** Collapse aliases in persisted or imported RD data without losing unknown specializations. */
export function normalizeDamageResistanceObject(source) {
  if (!source || typeof source !== "object") return source;
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    const numeric = Number(value);
    for (const normalizedKey of expandDamageTypeKeys(key)) {
      normalized[normalizedKey] = (Number(normalized[normalizedKey]) || 0) + (Number.isFinite(numeric) ? numeric : 0);
    }
  }
  return normalized;
}
