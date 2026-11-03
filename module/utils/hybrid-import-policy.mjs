export const HYBRID_IMPORT_SCOPE_SETTING = "hybridItemMatchScope";
export const HYBRID_IMPORT_SCOPES = Object.freeze([
  "off",
  "configured",
  "configured-world",
  "all"
]);

export function normalizeHybridImportScope(value, { legacySearchAll = false } = {}) {
  return HYBRID_IMPORT_SCOPES.includes(value)
    ? value
    : legacySearchAll
      ? "all"
      : "configured";
}

export function hybridImportScopeCapabilities(scope) {
  const normalized = normalizeHybridImportScope(scope);
  return {
    scope: normalized,
    enabled: normalized !== "off",
    includeWorldItems: ["configured-world", "all"].includes(normalized),
    includeOtherCompendia: normalized === "all"
  };
}
