import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GUM_API_HOOKS,
  GUM_API_VERSION,
  GumApiError,
  createGumApi,
  installGumApi
} from "../module/api/gum-api.mjs";

const actorDocument = (id = "actor-1") => ({
  id,
  uuid: `Actor.${id}`,
  documentName: "Actor",
  items: new Map()
});

const itemDocument = (id = "item-1", parent = null) => ({
  id,
  uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`,
  documentName: "Item",
  parent,
  system: { actions: [{ id: "a", type: "chat" }] }
});

function fixture({ isGM = true } = {}) {
  const actor = actorDocument();
  const item = itemDocument("embedded", actor);
  const effect = itemDocument("effect");
  actor.items.set(item.id, item);
  const uuidDocuments = new Map([[actor.uuid, actor], [item.uuid, item], [effect.uuid, effect]]);
  const calls = [];
  const contentSourceService = {
    getSourceIds: purpose => [`world.${purpose}`],
    resolveSources: purpose => [{ id: `world.${purpose}`, status: "available" }],
    getDocuments: async purpose => ({ documents: [{ purpose }], invalidSources: [] }),
    getIndex: async (purpose, options) => ({ entries: [{ purpose, options }], invalidSources: [] }),
    setSourceIds: async (purpose, ids) => calls.push(["setSourceIds", purpose, ids]),
    restoreDefaults: async purpose => calls.push(["restoreDefaults", purpose])
  };
  const dependencies = {
    performGURPSRoll: async (...args) => (calls.push(["perform", ...args]), "roll-result"),
    rollFromHotbar: (...args) => (calls.push(["hotbar", ...args]), "hotbar-result"),
    damageFromHotbar: (...args) => (calls.push(["damage-hotbar", ...args]), "damage-hotbar-result"),
    executeRollRequest: (...args) => (calls.push(["request", ...args]), "request-result"),
    getEffectActions: system => system.actions,
    applyEffectWithResistance: async (...args) => (calls.push(["apply", ...args]), "effect-result"),
    applySingleEffect: async (...args) => calls.push(["direct", ...args]),
    applyUseEventEffects: async (...args) => calls.push(["use", ...args]),
    setStateEffectGroupActive: async (...args) => calls.push(["group", ...args]),
    syncItemStateEffects: async (...args) => calls.push(["sync", ...args]),
    resolveCombatDamageFormula: () => "2d+1",
    resolveCombatDamageProfile: () => ({ main: { formula: "2d+1" } }),
    resolveTargetCombatDefenseRecalculationModifiers: () => [{ value: -2 }],
    importFromGCS: async options => (calls.push(["gcs", options]), options.actor),
    openTestRequestLauncher: () => "test-window",
    openGmScreen: () => "gm-window",
    openContentSourceConfig: () => "content-window",
    openWorldStatusConfig: () => "status-window",
    contentSourceService,
    contentSourcePurposes: {
      skills: { id: "skills", defaults: [], itemTypes: ["skill"] }
    }
  };
  const gameRef = {
    system: { version: "9.9.9" },
    user: { isGM },
    actors: new Map([[actor.id, actor]]),
    items: new Map([[effect.id, effect]])
  };
  return {
    actor, item, effect, calls, dependencies, gameRef,
    resolveUuid: async uuid => uuidDocuments.get(uuid) ?? null
  };
}

test("publishes a versioned immutable API with isolated namespaces", () => {
  const setup = fixture();
  const api = createGumApi(setup);
  assert.equal(api.version, GUM_API_VERSION);
  assert.equal(api.systemVersion, "9.9.9");
  assert.equal(api.hooks.READY, "gum.apiReady");
  assert.ok(Object.isFrozen(api));
  assert.ok(Object.isFrozen(api.rolls));
  assert.ok(Object.isFrozen(api.effects));
  assert.ok(Object.isFrozen(api.content));
});

test("installs after preserving runtime state and keeps historical aliases", () => {
  const setup = fixture();
  setup.gameRef.gum = { gmScreen: { rendered: true } };
  const emitted = [];
  const api = installGumApi({
    ...setup,
    hooks: { callAll: (...args) => emitted.push(args) }
  });
  assert.equal(setup.gameRef.gum.gmScreen.rendered, true);
  assert.equal(setup.gameRef.gum.api, api);
  assert.equal(setup.gameRef.gum.rollFromHotbar, setup.dependencies.rollFromHotbar);
  assert.equal(setup.gameRef.gum.damageFromHotbar, setup.dependencies.damageFromHotbar);
  assert.equal(setup.gameRef.gum.applySingleEffect, setup.dependencies.applySingleEffect);
  assert.deepEqual(emitted, [[GUM_API_HOOKS.READY, api]]);
});

test("resolves actors, tokens, world items, embedded items, IDs, and UUIDs", async () => {
  const setup = fixture();
  const api = createGumApi(setup);
  assert.equal(await api.actors.resolve(setup.actor.id), setup.actor);
  assert.equal(await api.actors.resolve(setup.actor.uuid), setup.actor);
  assert.equal(await api.actors.resolve({ documentName: "Token", actor: setup.actor }), setup.actor);
  assert.equal(await api.items.resolve(setup.effect.id), setup.effect);
  assert.equal(await api.items.resolve(setup.item.id, { actor: setup.actor }), setup.item);
  await assert.rejects(() => api.actors.resolve("Actor.missing"), error => {
    assert.ok(error instanceof GumApiError);
    assert.equal(error.code, "DOCUMENT_NOT_FOUND");
    return true;
  });
});

test("routes rolls and effects through the supported system flows", async () => {
  const setup = fixture();
  const api = createGumApi(setup);
  assert.equal(await api.rolls.perform(setup.actor.uuid, { value: 12 }, { ignoreGlobals: true }), "roll-result");
  assert.equal(await api.effects.apply(setup.effect.uuid, [{ actor: setup.actor }], { origin: setup.item }), "effect-result");
  await api.effects.applyUseEvent(setup.item.id, setup.actor.id, "activate");
  assert.equal(setup.calls[0][0], "perform");
  assert.equal(setup.calls[1][0], "apply");
  assert.equal(setup.calls[2][0], "use");
  await assert.rejects(() => api.effects.apply(setup.effect, []), error => error.code === "INVALID_ARGUMENT");
});

test("exposes damage helpers and defensive copies of content metadata", async () => {
  const setup = fixture();
  const api = createGumApi(setup);
  assert.equal(api.damage.fromHotbar({ actorId: setup.actor.id }), "damage-hotbar-result");
  assert.equal(api.damage.resolveFormula({}, {}, {}, "melee"), "2d+1");
  assert.deepEqual(api.damage.resolveProfile({}, {}, {}, "melee"), { main: { formula: "2d+1" } });
  const purposes = api.content.purposes();
  purposes[0].itemTypes.push("effect");
  assert.deepEqual(api.content.purposes()[0].itemTypes, ["skill"]);
  assert.deepEqual(api.content.getSourceIds("skills"), ["world.skills"]);
  assert.deepEqual((await api.content.getIndex("skills", { fields: ["name"] })).entries[0].options, { fields: ["name"] });
});

test("requires GM permission for world configuration mutations and windows", async () => {
  const setup = fixture({ isGM: false });
  const api = createGumApi(setup);
  assert.throws(() => api.content.setSourceIds("skills", []), error => error.code === "PERMISSION_DENIED");
  assert.throws(() => api.content.restoreDefaults("skills"), error => error.code === "PERMISSION_DENIED");
  assert.throws(() => api.ui.openContentSources(), error => error.code === "PERMISSION_DENIED");
  assert.throws(() => api.ui.openStatusConfiguration(), error => error.code === "PERMISSION_DENIED");
  assert.equal(api.ui.openTestRequest(), "test-window");
});

test("resolves actor references before importing a GCS character", async () => {
  const setup = fixture();
  const api = createGumApi(setup);
  assert.equal(await api.imports.gcs({ actor: setup.actor.uuid }), setup.actor);
  assert.equal(setup.calls[0][0], "gcs");
  assert.equal(setup.calls[0][1].actor, setup.actor);
});

test("reports missing optional implementations as stable capability errors", async () => {
  const setup = fixture();
  const api = createGumApi({ gameRef: setup.gameRef, resolveUuid: setup.resolveUuid });
  await assert.rejects(() => api.rolls.perform(setup.actor, {}), error => {
    assert.equal(error.code, "CAPABILITY_UNAVAILABLE");
    assert.equal(error.details.capability, "performGURPSRoll");
    return true;
  });
});

test("documents, types, and the Foundry entry point expose the same public API", async () => {
  const [portuguese, english, declarations, main] = await Promise.all([
    readFile(new URL("../docs/API.pt-BR.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/API.md", import.meta.url), "utf8"),
    readFile(new URL("../types/gum-api.d.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/main.js", import.meta.url), "utf8")
  ]);
  for (const namespace of ["actors", "items", "rolls", "effects", "damage", "content", "status", "imports", "ui"]) {
    assert.match(portuguese, new RegExp(`api\\.${namespace}`));
    assert.match(english, new RegExp(`api\\.${namespace}`));
    assert.match(declarations, new RegExp(`readonly ${namespace}:`));
  }
  assert.match(main, /installGumApi\(\{/);
  assert.doesNotMatch(main, /game\.gum\s*=\s*\{\}/);
});
