import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildConfigurationBundle,
  combineConfigurationImport,
  parseConfigurationBundle,
  prepareConfigurationBundle,
  previewConfigurationImport
} from "../module/utils/configuration-bundle-json.mjs";

const effect = name => ({ name, type: "effect", system: { schemaVersion: 2, actions: [] } });

test("recognizes configuration bundles and validates kinds and document types", () => {
  assert.equal(parseConfigurationBundle({ format: "another-format" }), null);
  assert.throws(() => parseConfigurationBundle({ format: "gum-configuration-bundle", version: 2 }), /Unsupported/);
  assert.throws(() => parseConfigurationBundle({
    format: "gum-configuration-bundle", version: 1, id: "x", kind: "unknown", configuration: {}
  }), /kind/);
  assert.throws(() => parseConfigurationBundle({
    format: "gum-configuration-bundle", version: 1, id: "statuses", kind: "world-statuses",
    configuration: {}, documents: { modifier: { name: "No", type: "gm_modifier", system: {} } }
  }), /does not support/);
});

test("resolves shared GM Screen item references to one stable compendium UUID", () => {
  const bundle = {
    format: "gum-configuration-bundle", version: 1, id: "gm-screen-test", name: "GM Screen", kind: "gm-screen",
    configuration: { tabs: [{ id: "main", groups: [
      { id: "a", items: [{ itemRef: "glow" }] },
      { id: "b", items: [{ itemRef: "glow" }, { itemRef: "penalty" }] }
    ] }] },
    documents: {
      glow: effect("Glow"),
      penalty: { name: "Darkness", type: "gm_modifier", system: { modifier: -2 } }
    }
  };
  const prepared = prepareConfigurationBundle(bundle, "world.screen");
  const first = prepared.configuration.tabs[0].groups[0].items[0];
  const shared = prepared.configuration.tabs[0].groups[1].items[0];
  assert.equal(first, shared);
  assert.match(first, /^Compendium\.world\.screen\.Item\.[A-Za-z0-9]{16}$/);
  assert.equal(prepared.itemBundle.documents.glow.type, "effect");
});

test("resolves status effectRefs while preserving external UUIDs", () => {
  const bundle = {
    format: "gum-configuration-bundle", version: 1, id: "statuses-test", kind: "world-statuses",
    configuration: {
      bindingsMigrated: true,
      overrides: { stunned: { effectUuids: [{ effectRef: "glow" }, "Item.external"] } },
      customStatuses: [{ id: "blessed", effectRefs: ["glow"] }]
    },
    documents: { glow: effect("Glow") }
  };
  const prepared = prepareConfigurationBundle(bundle, "world.statuses");
  const localUuid = prepared.configuration.overrides.stunned.effectUuids[0];
  assert.equal(prepared.configuration.overrides.stunned.effectUuids[1], "Item.external");
  assert.deepEqual(prepared.configuration.customStatuses[0].effectUuids, [localUuid]);
  assert.equal("effectRefs" in prepared.configuration.customStatuses[0], false);
});

test("rejects missing or misplaced local configuration references", () => {
  const missing = {
    format: "gum-configuration-bundle", version: 1, id: "x", kind: "gm-screen",
    configuration: { groups: [{ items: [{ itemRef: "missing" }] }] }, documents: {}
  };
  assert.throws(() => prepareConfigurationBundle(missing), /Unknown configuration bundle reference/);

  const misplaced = {
    format: "gum-configuration-bundle", version: 1, id: "x", kind: "world-statuses",
    configuration: { unexpected: { effectRef: "glow" } }, documents: { glow: effect("Glow") }
  };
  assert.throws(() => prepareConfigurationBundle(misplaced, "world.statuses"), /not allowed/);
});

test("exports referenced documents once and keeps missing external references", async () => {
  const documents = new Map([["Item.glow", {
    id: "glow", name: "Glow", type: "effect", folder: "folder", system: { actions: [] },
    toObject() { return { _id: this.id, name: this.name, type: this.type, folder: this.folder, system: this.system }; }
  }]]);
  const bundle = await buildConfigurationBundle({
    id: "export-test", kind: "gm-screen",
    configuration: { groups: [{ items: ["Item.glow", "Item.glow", "Item.missing"] }] },
    resolveUuid: uuid => documents.get(uuid) || null
  });
  assert.equal(Object.keys(bundle.documents).length, 1);
  assert.deepEqual(bundle.configuration.groups[0].items.slice(0, 2), [
    { itemRef: "effect-glow" }, { itemRef: "effect-glow" }
  ]);
  assert.equal(bundle.configuration.groups[0].items[2], "Item.missing");
  assert.equal(bundle.documents["effect-glow"]._id, undefined);
  assert.equal(bundle.documents["effect-glow"].folder, undefined);
});

test("GM Screen bundles preserve dynamic and empty tabs", async () => {
  const configuration = { activeTabId: "custom", tabs: [
    { id: "main", name: "Main", groups: [] },
    { id: "custom", name: "Custom", groups: [] }
  ] };
  const bundle = await buildConfigurationBundle({
    id: "dynamic-tabs", kind: "gm-screen", configuration, resolveUuid: async () => null
  });
  assert.deepEqual(bundle.configuration, configuration);
  const prepared = prepareConfigurationBundle(bundle);
  assert.deepEqual(prepared.configuration, configuration);
});

test("GM Screen exports preserve Macro UUIDs as external unsupported references", async () => {
  const macro = { id: "weather", name: "Weather", type: "script", documentName: "Macro" };
  const configuration = { groups: [{
    id: "tools",
    items: ["Macro.weather"],
    macroOptions: { "Macro.weather": { executionMode: "single-target" } }
  }] };
  const bundle = await buildConfigurationBundle({
    id: "macro-reference", kind: "gm-screen", configuration,
    resolveUuid: uuid => uuid === "Macro.weather" ? macro : null
  });
  assert.deepEqual(bundle.documents, {});
  assert.deepEqual(bundle.configuration.groups[0].items, ["Macro.weather"]);
  assert.equal(bundle.configuration.groups[0].macroOptions["Macro.weather"].executionMode, "single-target");
  assert.deepEqual(bundle.portability.unsupportedReferences, ["Macro.weather"]);
  assert.equal(bundle.portability.complete, false);
});

test("GM Screen exports preserve RollTable UUIDs as external references", async () => {
  const table = { id: "weather", name: "Weather", documentName: "RollTable" };
  const configuration = { groups: [{
    id: "tables",
    items: ["RollTable.weather"]
  }] };
  const bundle = await buildConfigurationBundle({
    id: "roll-table-reference", kind: "gm-screen", configuration,
    resolveUuid: uuid => uuid === "RollTable.weather" ? table : null
  });

  assert.deepEqual(bundle.configuration.groups[0].items, ["RollTable.weather"]);
  assert.deepEqual(bundle.portability.unsupportedReferences, ["RollTable.weather"]);
  assert.deepEqual(bundle.documents, {});
});

test("GM Screen merges per-group Macro execution modes with the selected import policy", () => {
  const current = { tabs: [{ id: "tab-1", groups: [{
    id: "tools", items: ["Macro.shared"],
    macroOptions: { "Macro.shared": { executionMode: "standard" } }
  }] }] };
  const incoming = { tabs: [{ id: "tab-1", groups: [{
    id: "tools", items: ["Macro.shared", "Macro.new"],
    macroOptions: {
      "Macro.shared": { executionMode: "single-target" },
      "Macro.new": { executionMode: "each-target" }
    }
  }] }] };
  const added = combineConfigurationImport("gm-screen", current, incoming, "add");
  assert.equal(added.tabs[0].groups[0].macroOptions["Macro.shared"].executionMode, "standard");
  assert.equal(added.tabs[0].groups[0].macroOptions["Macro.new"].executionMode, "each-target");
  const merged = combineConfigurationImport("gm-screen", current, incoming, "merge");
  assert.equal(merged.tabs[0].groups[0].macroOptions["Macro.shared"].executionMode, "single-target");
});

test("exports effects linked indirectly by a GM modifier", async () => {
  const documents = new Map([
    ["Item.modifier", {
      id: "modifier", name: "Fog", type: "gm_modifier",
      system: { passiveEffects: { aura: { id: "aura", effectUuid: "Item.effect" } } }
    }],
    ["Item.effect", { id: "effect", name: "Obscured", type: "effect", system: { actions: [] } }]
  ]);
  const bundle = await buildConfigurationBundle({
    id: "nested-export", kind: "gm-screen",
    configuration: { groups: [{ items: ["Item.modifier"] }] },
    resolveUuid: uuid => documents.get(uuid) || null
  });

  assert.deepEqual(Object.keys(bundle.documents).sort(), ["effect-effect", "gm_modifier-modifier"]);
  assert.equal(
    bundle.documents["gm_modifier-modifier"].system.passiveEffects.aura.effectRef,
    "effect-effect"
  );
  assert.equal(bundle.documents["gm_modifier-modifier"].system.passiveEffects.aura.effectUuid, undefined);
  const prepared = prepareConfigurationBundle(bundle, "world.gm-screen");
  assert.match(
    prepared.preparedItems.documents.find(entry => entry.key === "gm_modifier-modifier")
      .data.system.passiveEffects.aura.effectUuid,
    /^Compendium\.world\.gm-screen\.Item\./
  );
});

test("ships valid importable examples for GM Screen and world statuses", () => {
  for (const filename of ["exemplo-escudo-mestre-autocontido.json", "exemplo-status-autocontido.json"]) {
    const source = JSON.parse(fs.readFileSync(`docs/referencias-ia/exemplos/${filename}`, "utf8"));
    const prepared = prepareConfigurationBundle(source, "world.configuration-examples");
    assert.ok(prepared.itemBundle);
    assert.ok(prepared.preparedItems.documents.length >= 2);
  }
});

test("GM Screen imports support add, merge, and replace without duplicating item links", () => {
  const current = {
    activeTabId: "tab-1",
    tabs: [{ id: "tab-1", name: "Current", groups: [
      { id: "shared", name: "Old", collapsed: false, items: ["Item.a"] },
      { id: "local", name: "Local", items: ["Item.local"] }
    ] }]
  };
  const incoming = {
    activeTabId: "tab-2",
    tabs: [{ id: "tab-1", name: "Imported", groups: [
      { id: "shared", name: "New", collapsed: true, items: ["Item.a", "Item.b"] },
      { id: "added", name: "Added", items: ["Item.c"] }
    ] }, { id: "custom-tab", name: "Imported empty tab", groups: [] }]
  };

  const added = combineConfigurationImport("gm-screen", current, incoming, "add");
  assert.equal(added.tabs[0].name, "Current");
  assert.equal(added.tabs[0].groups.find(group => group.id === "shared").name, "Old");
  assert.deepEqual(added.tabs[0].groups.find(group => group.id === "shared").items, ["Item.a", "Item.b"]);
  assert.equal(added.tabs.find(tab => tab.id === "custom-tab").name, "Imported empty tab");

  const merged = combineConfigurationImport("gm-screen", current, incoming, "merge");
  assert.equal(merged.tabs[0].name, "Imported");
  assert.equal(merged.tabs[0].groups.find(group => group.id === "shared").name, "New");
  assert.ok(merged.tabs[0].groups.some(group => group.id === "local"));
  assert.ok(merged.tabs.some(tab => tab.id === "custom-tab"));
  assert.equal(merged.activeTabId, "tab-1");

  const replaced = combineConfigurationImport("gm-screen", current, incoming, "replace");
  assert.deepEqual(replaced, incoming);
  assert.notStrictEqual(replaced, incoming);
});

test("world status imports merge by status id and preserve local-only entries", () => {
  const current = {
    version: 2,
    initialized: true,
    bindingsMigrated: true,
    statuses: [
      { id: "stunned", name: "Local", effectUuids: ["Item.a"] },
      { id: "local", name: "Local status", effectUuids: [], custom: true }
    ]
  };
  const incoming = {
    version: 2,
    initialized: true,
    bindingsMigrated: true,
    statuses: [
      { id: "stunned", name: "Imported", effectUuids: ["Item.b"] },
      { id: "new", name: "New status", effectUuids: ["Item.c"], custom: true }
    ]
  };

  const added = combineConfigurationImport("world-statuses", current, incoming, "add");
  assert.equal(added.statuses[0].name, "Local");
  assert.deepEqual(added.statuses[0].effectUuids, ["Item.a", "Item.b"]);

  const merged = combineConfigurationImport("world-statuses", current, incoming, "merge");
  assert.equal(merged.statuses[0].name, "Imported");
  assert.deepEqual(merged.statuses.map(status => status.id), ["stunned", "local", "new"]);

  const replaced = combineConfigurationImport("world-statuses", current, incoming, "replace");
  assert.deepEqual(replaced.statuses.map(status => status.id), ["stunned", "new"]);

  const replacedWithEmpty = combineConfigurationImport("world-statuses", current, {
    version: 2,
    initialized: true,
    bindingsMigrated: true,
    statuses: []
  }, "replace");
  assert.deepEqual(replacedWithEmpty.statuses, []);
});

test("passive-condition export embeds conditions and their linked effects", async () => {
  const documents = new Map([
    ["Item.collapse", { id: "collapse", name: "Colapso", type: "condition", img: "collapse.svg", system: { effects: [{ id: "link", uuid: "Item.consciousness", phase: "turnStart" }] } }],
    ["Item.consciousness", { id: "consciousness", name: "Teste de Consciência", type: "effect", img: "test.svg", system: { actions: [] } }]
  ]);
  const bundle = await buildConfigurationBundle({
    id: "passive-test", kind: "passive-conditions",
    configuration: { initialized: true, entries: [{ id: "collapse", sourceUuid: "Item.collapse", name: "Colapso", enabled: true, snapshot: documents.get("Item.collapse") }] },
    resolveUuid: async uuid => documents.get(uuid) || null
  });
  assert.deepEqual(Object.keys(bundle.documents).sort(), ["condition-collapse", "effect-consciousness"]);
  assert.equal(bundle.configuration.entries[0].conditionRef, "condition-collapse");
  assert.equal(bundle.configuration.entries[0].snapshot, undefined);
  assert.equal(bundle.documents["condition-collapse"].system.effects[0].effectRef, "effect-consciousness");
  assert.equal(bundle.documents["condition-collapse"].system.effects[0].uuid, undefined);

  const prepared = prepareConfigurationBundle(bundle, "world.passive-import");
  const entry = prepared.configuration.entries[0];
  assert.match(entry.sourceUuid, /^Compendium\.world\.passive-import\.Item\./);
  assert.match(entry.snapshot.system.effects[0].uuid, /^Compendium\.world\.passive-import\.Item\./);
  assert.equal(entry.snapshot.system.effects[0].effectRef, undefined);
});

test("passive-condition imports merge or replace entries by stable id", () => {
  const current = { initialized: true, entries: [{ id: "shared", name: "Local" }, { id: "local", name: "Only here" }], managedSourceUuids: ["Item.local"] };
  const incoming = { initialized: true, entries: [{ id: "shared", name: "Imported" }, { id: "new", name: "New" }], managedSourceUuids: ["Item.new"] };
  const merged = combineConfigurationImport("passive-conditions", current, incoming, "merge");
  assert.deepEqual(merged.entries.map(entry => entry.name), ["Imported", "Only here", "New"]);
  assert.deepEqual(merged.managedSourceUuids, ["Item.local", "Item.new"]);
  const added = combineConfigurationImport("passive-conditions", current, incoming, "add");
  assert.deepEqual(added.entries.map(entry => entry.name), ["Local", "Only here", "New"]);
  const replaced = combineConfigurationImport("passive-conditions", current, incoming, "replace");
  assert.deepEqual(replaced.entries.map(entry => entry.name), ["Imported", "New"]);
});

test("configuration preview counts matching, changed, new, and current-only entries", () => {
  const summary = previewConfigurationImport("gm-screen", {
    groups: [{ id: "same", items: [] }, { id: "remove", items: [] }]
  }, {
    groups: [{ id: "same", items: ["Item.a"] }, { id: "create", items: [] }]
  });
  assert.deepEqual(summary, { creates: 1, updates: 1, unchanged: 1, removes: 1 });
});

test("exports a portability report for unresolved references and external assets", async () => {
  const bundle = await buildConfigurationBundle({
    id: "portability", kind: "gm-screen", systemVersion: "1.4.4-beta", foundryVersion: "13",
    configuration: { groups: [{ items: ["Item.missing"] }] },
    resolveUuid: async () => null
  });
  assert.equal(bundle.portability.complete, false);
  assert.deepEqual(bundle.portability.unresolvedReferences, ["Item.missing"]);
  assert.equal(bundle.portability.systemVersion, "1.4.4-beta");
  assert.equal(bundle.portability.foundryVersion, "13");
});
