export const HYBRID_ALIAS_ITEM_TYPES = Object.freeze([
  "advantage",
  "disadvantage",
  "skill",
  "spell",
  "power",
  "equipment"
]);

export function normalizeItemName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function splitItemNameAndSpecialization(rawName) {
  const original = String(rawName ?? "").trim();
  const match = original.match(/^(.*)\(([^)]+)\)\s*$/);
  if (!match) return { full: original, base: original, specialization: "" };
  return {
    full: original,
    base: String(match[1] ?? "").trim(),
    specialization: String(match[2] ?? "").trim()
  };
}

export function normalizeItemAliases(value) {
  const aliases = Array.isArray(value) ? value : (value == null || value === "" ? [] : [value]);
  const seen = new Set();
  const result = [];
  for (const rawAlias of aliases) {
    const alias = String(rawAlias ?? "").replace(/\s+/g, " ").trim();
    const normalized = normalizeItemName(alias);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(alias);
  }
  return result;
}

export function itemNameIdentity(rawName, specialization = "") {
  const parts = splitItemNameAndSpecialization(rawName);
  const resolvedSpecialization = String(specialization || parts.specialization || "").trim();
  return {
    raw: parts.full,
    nameNorm: normalizeItemName(parts.base || parts.full),
    specializationNorm: normalizeItemName(resolvedSpecialization)
  };
}

export function itemNameIdentities({ name = "", specialization = "", aliases = [] } = {}) {
  const canonical = itemNameIdentity(name, specialization);
  const identities = [{ ...canonical, kind: "name" }];
  const seen = new Set([`${canonical.nameNorm}::${canonical.specializationNorm}`]);

  for (const alias of normalizeItemAliases(aliases)) {
    const parts = splitItemNameAndSpecialization(alias);
    const identity = itemNameIdentity(parts.base, parts.specialization || specialization);
    const key = `${identity.nameNorm}::${identity.specializationNorm}`;
    if (!identity.nameNorm || seen.has(key)) continue;
    seen.add(key);
    identities.push({ ...identity, raw: alias, kind: "alias" });
  }
  return identities;
}
