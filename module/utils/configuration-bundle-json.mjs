import {
  GUM_ITEM_BUNDLE_FORMAT,
  GUM_ITEM_BUNDLE_VERSION,
  prepareItemBundle
} from "./item-bundle-json.mjs";

export const GUM_CONFIGURATION_BUNDLE_FORMAT = "gum-configuration-bundle";
export const GUM_CONFIGURATION_BUNDLE_VERSION = 1;
export const GUM_CONFIGURATION_BUNDLE_KINDS = Object.freeze(["gm-screen", "world-statuses", "passive-conditions"]);

const KIND_SET = new Set(GUM_CONFIGURATION_BUNDLE_KINDS);
const ALLOWED_TYPES = Object.freeze({
  "gm-screen": new Set(["effect", "gm_modifier"]),
  "world-statuses": new Set(["effect"]),
  "passive-conditions": new Set(["condition", "effect"])
});

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = value => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function valueIdentity(value) {
  return typeof value === "string" ? `string:${value}` : `json:${JSON.stringify(value)}`;
}

function mergeUniqueValues(current = [], incoming = []) {
  const result = clone(Array.isArray(current) ? current : []);
  const seen = new Set(result.map(valueIdentity));
  for (const value of Array.isArray(incoming) ? incoming : []) {
    const identity = valueIdentity(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(clone(value));
  }
  return result;
}

function gmScreenTabs(configuration) {
  if (Array.isArray(configuration?.tabs)) return clone(configuration.tabs);
  const groups = Array.isArray(configuration?.groups)
    ? configuration.groups
    : (Array.isArray(configuration?.columns)
      ? configuration.columns.flatMap(column => column?.groups || [])
      : []);
  return [{ id: "tab-1", name: "1", groups: clone(groups) }];
}

function mergeGMScreenConfiguration(current, incoming, mode) {
  const currentTabs = gmScreenTabs(current);
  const incomingTabs = gmScreenTabs(incoming);
  const tabs = clone(currentTabs);
  const tabById = new Map(tabs.map((tab, index) => [String(tab?.id || `tab-${index + 1}`), tab]));

  for (const [tabIndex, incomingTab] of incomingTabs.entries()) {
    const tabId = String(incomingTab?.id || `tab-${tabIndex + 1}`);
    let targetTab = tabById.get(tabId);
    if (!targetTab) {
      targetTab = clone(incomingTab);
      targetTab.id ||= tabId;
      targetTab.groups = Array.isArray(targetTab.groups) ? targetTab.groups : [];
      tabs.push(targetTab);
      tabById.set(tabId, targetTab);
      continue;
    }
    if (mode === "merge") {
      const currentGroups = targetTab.groups;
      Object.assign(targetTab, clone(incomingTab));
      targetTab.groups = currentGroups;
    }
    targetTab.groups = Array.isArray(targetTab.groups) ? targetTab.groups : [];
    const groupById = new Map(targetTab.groups.map((group, index) => [
      String(group?.id || `legacy:${tabId}:${index}`), group
    ]));
    for (const [groupIndex, incomingGroup] of (incomingTab?.groups || []).entries()) {
      const groupId = String(incomingGroup?.id || `legacy:${tabId}:${groupIndex}`);
      const targetGroup = groupById.get(groupId);
      if (!targetGroup) {
        targetTab.groups.push(clone(incomingGroup));
        continue;
      }
      const items = mergeUniqueValues(targetGroup.items, incomingGroup?.items);
      const macroOptions = mode === "merge"
        ? { ...clone(targetGroup.macroOptions || {}), ...clone(incomingGroup?.macroOptions || {}) }
        : { ...clone(incomingGroup?.macroOptions || {}), ...clone(targetGroup.macroOptions || {}) };
      const referenceMetadata = mode === "merge"
        ? { ...clone(targetGroup.referenceMetadata || {}), ...clone(incomingGroup?.referenceMetadata || {}) }
        : { ...clone(incomingGroup?.referenceMetadata || {}), ...clone(targetGroup.referenceMetadata || {}) };
      if (mode === "merge") Object.assign(targetGroup, clone(incomingGroup));
      targetGroup.items = items;
      targetGroup.macroOptions = macroOptions;
      targetGroup.referenceMetadata = referenceMetadata;
    }
  }

  return {
    ...clone(current || {}),
    tabs,
    activeTabId: current?.activeTabId || incoming?.activeTabId || tabs[0]?.id
  };
}

function mergeStatusEntry(current, incoming, mode) {
  const result = mode === "merge"
    ? { ...clone(current || {}), ...clone(incoming || {}) }
    : { ...clone(incoming || {}), ...clone(current || {}) };
  result.effectUuids = mergeUniqueValues(current?.effectUuids, incoming?.effectUuids);
  result.legacyRuleUuids = mergeUniqueValues(current?.legacyRuleUuids, incoming?.legacyRuleUuids);
  return result;
}

function mergeWorldStatusConfiguration(current, incoming, mode) {
  const statuses = clone(Array.isArray(current?.statuses) ? current.statuses : []);
  const statusById = new Map(statuses.map(status => [String(status?.id || ""), status]));
  for (const incomingStatus of incoming?.statuses || []) {
    const id = String(incomingStatus?.id || "");
    const existing = statusById.get(id);
    if (!existing) {
      const added = clone(incomingStatus);
      statuses.push(added);
      statusById.set(id, added);
      continue;
    }
    Object.assign(existing, mergeStatusEntry(existing, incomingStatus, mode));
  }

  return {
    ...clone(current || {}),
    version: Math.max(Number(current?.version) || 2, Number(incoming?.version) || 2),
    initialized: true,
    bindingsMigrated: current?.bindingsMigrated === true || incoming?.bindingsMigrated === true,
    statuses
  };
}

function mergePassiveConditionConfiguration(current, incoming, mode) {
  const entries = clone(Array.isArray(current?.entries) ? current.entries : []);
  const byId = new Map(entries.map(entry => [String(entry?.id || entry?.sourceUuid || ""), entry]));
  for (const incomingEntry of incoming?.entries || []) {
    const id = String(incomingEntry?.id || incomingEntry?.sourceUuid || "");
    const existing = byId.get(id);
    if (!existing) {
      const added = clone(incomingEntry);
      entries.push(added);
      byId.set(id, added);
      continue;
    }
    if (mode === "merge") Object.assign(existing, clone(incomingEntry));
  }
  return {
    ...clone(current || {}),
    version: Math.max(Number(current?.version) || 1, Number(incoming?.version) || 1),
    initialized: true,
    entries,
    managedSourceUuids: mergeUniqueValues(current?.managedSourceUuids, incoming?.managedSourceUuids)
  };
}

/** Combine an imported configuration with the current world state. */
export function combineConfigurationImport(kind, current, incoming, mode = "merge") {
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported GUM configuration bundle kind: ${kind}.`);
  if (!["add", "merge", "replace"].includes(mode)) throw new Error(`Unsupported configuration import mode: ${mode}.`);
  if (mode === "replace") return clone(incoming || {});
  if (kind === "gm-screen") return mergeGMScreenConfiguration(current || {}, incoming || {}, mode);
  if (kind === "passive-conditions") return mergePassiveConditionConfiguration(current || {}, incoming || {}, mode);
  return mergeWorldStatusConfiguration(current || {}, incoming || {}, mode);
}

function configurationEntries(kind, configuration) {
  if (kind === "gm-screen") {
    return new Map(gmScreenTabs(configuration).flatMap((tab, tabIndex) => {
      const tabId = tab?.id || tabIndex;
      return [
        [`tab:${tabId}`, { id: tab?.id, name: tab?.name }],
        ...(tab?.groups || []).map((group, groupIndex) => [
          `group:${tabId}:${group?.id || groupIndex}`,
          group
        ])
      ];
    }));
  }
  if (kind === "passive-conditions") {
    return new Map((configuration?.entries || []).map((value, index) => [`condition:${value?.id || value?.sourceUuid || index}`, value]));
  }
  return new Map([
    ...(configuration?.statuses || []).map((value, index) => [`status:${value?.id || `status-${index}`}`, value])
  ]);
}

/** Summarize configuration-level changes before importing a bundle. */
export function previewConfigurationImport(kind, current, incoming) {
  const currentEntries = configurationEntries(kind, current);
  const incomingEntries = configurationEntries(kind, incoming);
  let creates = 0;
  let updates = 0;
  let unchanged = 0;
  for (const [key, value] of incomingEntries) {
    if (!currentEntries.has(key)) creates += 1;
    else if (JSON.stringify(currentEntries.get(key)) === JSON.stringify(value)) unchanged += 1;
    else updates += 1;
  }
  const removes = [...currentEntries.keys()].filter(key => !incomingEntries.has(key)).length;
  return { creates, updates, unchanged, removes };
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function validateDocuments(documents, kind) {
  const normalized = {};
  for (const [rawKey, rawDocument] of Object.entries(documents || {})) {
    const key = requiredText(rawKey, "Configuration bundle document key");
    if (!isObject(rawDocument)) throw new Error(`Configuration bundle document "${key}" must be an object.`);
    const name = requiredText(rawDocument.name, `Configuration bundle document "${key}" name`);
    const type = requiredText(rawDocument.type, `Configuration bundle document "${key}" type`);
    if (!ALLOWED_TYPES[kind].has(type)) {
      throw new Error(`Configuration bundle kind "${kind}" does not support Item type "${type}" at "${key}".`);
    }
    if (!isObject(rawDocument.system)) {
      throw new Error(`Configuration bundle document "${key}" must contain a system object.`);
    }
    normalized[key] = { ...clone(rawDocument), name, type };
  }
  return normalized;
}

/** Return a normalized configuration bundle, or null for another JSON format. */
export function parseConfigurationBundle(data) {
  if (!data || data.format !== GUM_CONFIGURATION_BUNDLE_FORMAT) return null;
  if (data.version !== GUM_CONFIGURATION_BUNDLE_VERSION) {
    throw new Error(`Unsupported GUM configuration bundle version: ${data.version}.`);
  }
  const id = requiredText(data.id, "Configuration bundle id");
  const kind = requiredText(data.kind, "Configuration bundle kind");
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported GUM configuration bundle kind: ${kind}.`);
  if (!isObject(data.configuration)) throw new Error("A GUM configuration bundle must contain a configuration object.");
  if (data.documents !== undefined && !isObject(data.documents)) {
    throw new Error("Configuration bundle documents must be an object.");
  }
  return {
    format: GUM_CONFIGURATION_BUNDLE_FORMAT,
    version: GUM_CONFIGURATION_BUNDLE_VERSION,
    id,
    kind,
    name: String(data.name ?? "").trim(),
    configuration: clone(data.configuration),
    documents: validateDocuments(data.documents || {}, kind),
    ...(isObject(data.portability) ? { portability: clone(data.portability) } : {})
  };
}

function referenceKey(value, field, location) {
  if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, field)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error(`${field} at ${location} must be the only field in its reference object.`);
  return requiredText(value[field], `${field} at ${location}`);
}

function resolveTarget(parsed, uuidByKey, key, expectedTypes, location) {
  const target = parsed.documents[key];
  if (!target) throw new Error(`Unknown configuration bundle reference "${key}" at ${location}.`);
  if (!expectedTypes.has(target.type)) {
    throw new Error(`Configuration bundle reference "${key}" at ${location} targets unsupported type "${target.type}".`);
  }
  return uuidByKey.get(key);
}

function resolveGMScreenConfiguration(parsed, uuidByKey) {
  const configuration = clone(parsed.configuration);
  const tabs = Array.isArray(configuration.tabs) ? configuration.tabs : [];
  const groupCollections = [
    ...tabs.map(tab => tab?.groups),
    configuration.groups,
    ...(Array.isArray(configuration.columns) ? configuration.columns.map(column => column?.groups) : [])
  ].filter(Array.isArray);

  for (const groups of groupCollections) {
    for (const [groupIndex, group] of groups.entries()) {
      if (!Array.isArray(group?.items)) continue;
      group.items = group.items.map((entry, itemIndex) => {
        if (typeof entry === "string") return entry;
        const location = `configuration group ${groupIndex} item ${itemIndex}`;
        const key = referenceKey(entry, "itemRef", location);
        if (!key) throw new Error(`Invalid GM Screen item reference at ${location}.`);
        return resolveTarget(parsed, uuidByKey, key, ALLOWED_TYPES["gm-screen"], location);
      });
    }
  }
  return configuration;
}

function resolveStatusEffectList(parsed, uuidByKey, row, location) {
  const entries = [
    ...(Array.isArray(row.effectUuids) ? row.effectUuids : []),
    ...(Array.isArray(row.effectRefs) ? row.effectRefs.map(effectRef => ({ effectRef })) : [])
  ];
  row.effectUuids = [...new Set(entries.map((entry, index) => {
    if (typeof entry === "string") return entry;
    const itemLocation = `${location}.effectUuids.${index}`;
    const key = referenceKey(entry, "effectRef", itemLocation);
    if (!key) throw new Error(`Invalid world status effect reference at ${itemLocation}.`);
    return resolveTarget(parsed, uuidByKey, key, ALLOWED_TYPES["world-statuses"], itemLocation);
  }))];
  delete row.effectRefs;
}

function resolveWorldStatusConfiguration(parsed, uuidByKey) {
  const configuration = clone(parsed.configuration);
  for (const [index, status] of (configuration.statuses || []).entries()) {
    if (isObject(status)) resolveStatusEffectList(parsed, uuidByKey, status, `configuration.statuses.${index}`);
  }
  for (const [statusId, override] of Object.entries(configuration.overrides || {})) {
    if (isObject(override)) resolveStatusEffectList(parsed, uuidByKey, override, `configuration.overrides.${statusId}`);
  }
  for (const [index, status] of (configuration.customStatuses || []).entries()) {
    if (isObject(status)) resolveStatusEffectList(parsed, uuidByKey, status, `configuration.customStatuses.${index}`);
  }
  return configuration;
}

function resolvePassiveConditionConfiguration(parsed, uuidByKey, preparedItems) {
  const configuration = clone(parsed.configuration);
  const preparedByKey = new Map((preparedItems?.documents || []).map(entry => [entry.key, entry]));
  configuration.entries = (configuration.entries || []).map((entry, index) => {
    const location = `configuration.entries.${index}.conditionRef`;
    const key = requiredText(entry?.conditionRef, location);
    const uuid = resolveTarget(parsed, uuidByKey, key, new Set(["condition"]), location);
    const target = parsed.documents[key];
    const prepared = preparedByKey.get(key)?.data || target;
    const snapshot = portableDocumentData(prepared);
    if (snapshot.flags?.gum?.itemBundle) {
      delete snapshot.flags.gum.itemBundle;
      if (!Object.keys(snapshot.flags.gum).length) delete snapshot.flags.gum;
      if (!Object.keys(snapshot.flags).length) delete snapshot.flags;
    }
    const resolved = { ...entry, sourceUuid: uuid, name: entry.name || target.name, img: entry.img || target.img, snapshot };
    delete resolved.conditionRef;
    return resolved;
  });
  configuration.managedSourceUuids = [...new Set([...(configuration.managedSourceUuids || []), ...configuration.entries.map(entry => entry.sourceUuid)].filter(Boolean))];
  configuration.initialized = true;
  return configuration;
}

function findUnresolvedReference(value, path = []) {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const found = findUnresolvedReference(entry, [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, entry] of Object.entries(value)) {
    if (["itemRef", "effectRef", "effectRefs"].includes(key)) return [...path, key].join(".");
    const found = findUnresolvedReference(entry, [...path, key]);
    if (found) return found;
  }
  return null;
}

/** Allocate destination UUIDs and resolve references without mutating the source bundle. */
export function prepareConfigurationBundle(bundleData, packCollection = "") {
  const parsed = parseConfigurationBundle(bundleData) || bundleData;
  if (!parsed?.id || !parsed?.kind || !parsed?.configuration || !parsed?.documents) {
    throw new Error("Invalid GUM configuration bundle.");
  }

  const documentKeys = Object.keys(parsed.documents);
  let itemBundle = null;
  let preparedItems = null;
  let uuidByKey = new Map();
  if (documentKeys.length) {
    requiredText(packCollection, "Destination pack collection");
    itemBundle = {
      format: GUM_ITEM_BUNDLE_FORMAT,
      version: GUM_ITEM_BUNDLE_VERSION,
      id: parsed.id,
      name: parsed.name || parsed.id,
      root: documentKeys[0],
      documents: clone(parsed.documents)
    };
    preparedItems = prepareItemBundle(itemBundle, packCollection);
    uuidByKey = preparedItems.uuidByKey;
  }

  const configuration = parsed.kind === "gm-screen"
    ? resolveGMScreenConfiguration(parsed, uuidByKey)
    : parsed.kind === "passive-conditions"
      ? resolvePassiveConditionConfiguration(parsed, uuidByKey, preparedItems)
      : resolveWorldStatusConfiguration(parsed, uuidByKey);
  const unresolved = findUnresolvedReference(configuration);
  if (unresolved) throw new Error(`Configuration bundle reference is not allowed at ${unresolved}.`);

  return { parsed, configuration, itemBundle, preparedItems };
}

function groupsFromGMScreen(configuration) {
  if (Array.isArray(configuration?.tabs)) return configuration.tabs.flatMap(tab => tab?.groups || []);
  if (Array.isArray(configuration?.groups)) return configuration.groups;
  if (Array.isArray(configuration?.columns)) return configuration.columns.flatMap(column => column?.groups || []);
  return [];
}

function referencedUuids(configuration, kind) {
  if (kind === "gm-screen") {
    return [...new Set(groupsFromGMScreen(configuration).flatMap(group => group?.items || []).filter(value => typeof value === "string" && value))];
  }
  if (kind === "passive-conditions") return [...new Set((configuration?.entries || []).map(entry => entry?.sourceUuid).filter(Boolean))];
  return [...new Set([
    ...(configuration?.statuses || []).flatMap(row => row?.effectUuids || []),
    ...Object.values(configuration?.overrides || {}).flatMap(row => row?.effectUuids || []),
    ...(configuration?.customStatuses || []).flatMap(row => row?.effectUuids || [])
  ].filter(value => typeof value === "string" && value))];
}

function portableDocumentData(document) {
  const data = typeof document?.toObject === "function" ? document.toObject() : clone(document);
  delete data._id;
  delete data.folder;
  delete data._stats;
  return data;
}

function collectionValues(value) {
  return Array.isArray(value) ? value : Object.values(value || {});
}

function collectExternalAssetPaths(value, path = [], result = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectExternalAssetPaths(entry, [...path, String(index)], result));
    return result;
  }
  if (!isObject(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (["img", "icon"].includes(key) && typeof entry === "string" && entry.trim()) {
      const asset = entry.trim();
      const bundled = asset.startsWith("icons/") || asset.startsWith("systems/gum/") || asset.startsWith("data:");
      if (!bundled) result.add(asset);
    }
    collectExternalAssetPaths(entry, nextPath, result);
  }
  return result;
}

function effectLinks(document) {
  const system = document?.system || {};
  return [
    ...(document?.type === "condition" ? collectionValues(system.effects) : []),
    ...collectionValues(system.activationEffects?.success),
    ...collectionValues(system.activationEffects?.failure),
    ...collectionValues(system.onDamageEffects),
    ...collectionValues(system.passiveEffects),
    ...collectionValues(system.useEventEffects),
    ...collectionValues(system.stateEffectGroups).flatMap(group => collectionValues(group?.effects)),
    ...collectionValues(system.melee_attacks).flatMap(attack => collectionValues(attack?.onDamageEffects)),
    ...collectionValues(system.ranged_attacks).flatMap(attack => collectionValues(attack?.onDamageEffects))
  ].filter(isObject);
}

/** Build an exportable bundle by embedding every resolvable referenced Item once. */
export async function buildConfigurationBundle({
  id,
  name = "",
  kind,
  configuration,
  resolveUuid,
  systemVersion = "",
  foundryVersion = ""
}) {
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported GUM configuration bundle kind: ${kind}.`);
  if (typeof resolveUuid !== "function") throw new Error("A UUID resolver is required.");
  const sourceConfiguration = clone(configuration || {});
  const documents = {};
  const keyByUuid = new Map();
  const usedKeys = new Set();
  const queuedUuids = referencedUuids(sourceConfiguration, kind);
  const resolvedByUuid = new Map();
  const unresolvedReferences = new Set();
  const unsupportedReferences = new Set();

  for (let index = 0; index < queuedUuids.length; index += 1) {
    const uuid = queuedUuids[index];
    if (resolvedByUuid.has(uuid)) continue;
    const document = await resolveUuid(uuid);
    resolvedByUuid.set(uuid, document || null);
    if (!document) {
      unresolvedReferences.add(uuid);
      continue;
    }
    if (!ALLOWED_TYPES[kind].has(document.type)) {
      unsupportedReferences.add(uuid);
      continue;
    }
    const base = `${document.type}-${document.id || "item"}`;
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${base}-${suffix++}`;
    usedKeys.add(key);
    keyByUuid.set(uuid, key);
    const data = portableDocumentData(document);
    documents[key] = data;
    if ((kind === "gm-screen" && data.type === "gm_modifier") || (kind === "passive-conditions" && data.type === "condition")) {
      for (const link of effectLinks(data)) {
        const effectUuid = String(link.effectUuid || "").trim();
        if (effectUuid && !resolvedByUuid.has(effectUuid)) queuedUuids.push(effectUuid);
      }
    }
  }

  if (kind === "passive-conditions") {
    for (const [index, entry] of (sourceConfiguration.entries || []).entries()) {
      let conditionKey = keyByUuid.get(String(entry?.sourceUuid || "").trim());
      if (!conditionKey && entry?.snapshot?.type === "condition") {
        const base = `condition-${entry.id || `entry-${index + 1}`}`.replace(/[^A-Za-z0-9_-]/g, "-");
        conditionKey = base;
        let suffix = 2;
        while (usedKeys.has(conditionKey)) conditionKey = `${base}-${suffix++}`;
        usedKeys.add(conditionKey);
        documents[conditionKey] = portableDocumentData(entry.snapshot);
        const snapshotUuid = String(entry?.sourceUuid || "").trim();
        if (snapshotUuid) keyByUuid.set(snapshotUuid, conditionKey);
      }
      if (!conditionKey) {
        unresolvedReferences.add(entry?.sourceUuid || entry?.id || `entry-${index + 1}`);
        continue;
      }
      const portableEntry = { id: entry.id, name: entry.name, img: entry.img, enabled: entry.enabled !== false, conditionRef: conditionKey };
      sourceConfiguration.entries[index] = portableEntry;
      for (const link of effectLinks(documents[conditionKey])) {
        const effectUuid = String(link.uuid || link.effectUuid || "").trim();
        if (!effectUuid || resolvedByUuid.has(effectUuid)) continue;
        const effect = await resolveUuid(effectUuid);
        resolvedByUuid.set(effectUuid, effect || null);
        if (!effect || effect.type !== "effect") {
          unresolvedReferences.add(effectUuid);
          continue;
        }
        const base = `effect-${effect.id || "item"}`;
        let key = base;
        let suffix = 2;
        while (usedKeys.has(key)) key = `${base}-${suffix++}`;
        usedKeys.add(key);
        keyByUuid.set(effectUuid, key);
        documents[key] = portableDocumentData(effect);
      }
    }
    sourceConfiguration.managedSourceUuids = [];
  }

  if (kind === "gm-screen") {
    for (const document of Object.values(documents)) {
      if (document.type !== "gm_modifier") continue;
      for (const link of effectLinks(document)) {
        const effectUuid = String(link.effectUuid || "").trim();
        const effectKey = keyByUuid.get(effectUuid);
        if (!effectKey) continue;
        delete link.effectUuid;
        link.effectRef = effectKey;
      }
    }
  }

  if (kind === "passive-conditions") {
    for (const document of Object.values(documents)) {
      if (document.type !== "condition") continue;
      for (const link of effectLinks(document)) {
        const effectUuid = String(link.uuid || link.effectUuid || "").trim();
        const effectKey = keyByUuid.get(effectUuid);
        if (!effectKey) continue;
        delete link.uuid;
        delete link.effectUuid;
        link.effectRef = effectKey;
      }
    }
  }

  if (kind === "gm-screen") {
    for (const group of groupsFromGMScreen(sourceConfiguration)) {
      if (!Array.isArray(group?.items)) continue;
      group.items = group.items.map(uuid => keyByUuid.has(uuid) ? { itemRef: keyByUuid.get(uuid) } : uuid);
    }
  } else if (kind === "world-statuses") {
    const rows = [
      ...(sourceConfiguration.statuses || []),
      ...Object.values(sourceConfiguration.overrides || {}),
      ...(sourceConfiguration.customStatuses || [])
    ];
    for (const row of rows) {
      if (!isObject(row) || !Array.isArray(row.effectUuids)) continue;
      row.effectUuids = row.effectUuids.map(uuid => keyByUuid.has(uuid) ? { effectRef: keyByUuid.get(uuid) } : uuid);
    }
  }

  const externalAssets = [...collectExternalAssetPaths({ configuration: sourceConfiguration, documents })].sort();
  const portability = {
    complete: unresolvedReferences.size === 0 && unsupportedReferences.size === 0 && externalAssets.length === 0,
    unresolvedReferences: [...unresolvedReferences].sort(),
    unsupportedReferences: [...unsupportedReferences].sort(),
    externalAssets,
    ...(systemVersion ? { systemVersion: String(systemVersion) } : {}),
    ...(foundryVersion ? { foundryVersion: String(foundryVersion) } : {})
  };

  return {
    format: GUM_CONFIGURATION_BUNDLE_FORMAT,
    version: GUM_CONFIGURATION_BUNDLE_VERSION,
    id: requiredText(id, "Configuration bundle id"),
    name: String(name || "").trim(),
    kind,
    configuration: sourceConfiguration,
    documents,
    portability
  };
}
