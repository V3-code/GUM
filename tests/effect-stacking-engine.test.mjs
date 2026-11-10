import test from "node:test";
import assert from "node:assert/strict";

const clone = value => structuredClone(value);
const getPath = (target, path) => path.split(".").reduce((value, part) => value?.[part], target);
const setPath = (target, path, value) => {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = parts.reduce((object, part) => object[part] ??= {}, target);
  parent[key] = value;
};
const merge = (base, source) => {
  const result = clone(base);
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) result[key] = merge(result[key] || {}, value);
    else result[key] = value;
  }
  return result;
};

let randomId = 0;
globalThis.foundry = { utils: {
  deepClone: clone,
  duplicate: clone,
  mergeObject: (base, source) => merge(base, source),
  getProperty: getPath,
  setProperty: setPath,
  randomID: () => `application-${++randomId}`
} };
globalThis.CONST = {
  ACTIVE_EFFECT_CHANGE_TYPES: { ADD: 2 },
  ACTIVE_EFFECT_MODES: { ADD: 2, OVERRIDE: 5 }
};
globalThis.CONFIG = { statusEffects: [] };
globalThis.game = {
  combat: null,
  time: { worldTime: 10 },
  users: [],
  release: { generation: 13 },
  settings: { get: () => "publicroll" },
  macros: { getName: () => null }
};
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.ChatMessage = {
  getSpeaker: () => ({}),
  create: async () => {},
  getWhisperRecipients: () => []
};
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; this.total = Number(formula) || 0; }
  async evaluate() { return this; }
  async toMessage() {}
};
if (!String.prototype.slugify) {
  Object.defineProperty(String.prototype, "slugify", {
    configurable: true,
    value() { return this.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  });
}

const { applySingleEffect } = await import("../scripts/effects-engine.js");

function makeActor({ createDelay = 0 } = {}) {
  let nextEffectId = 0;
  const actor = {
    id: `actor-${Math.random()}`,
    uuid: `Actor.${Math.random()}`,
    isToken: false,
    system: { attributes: { hp: { value: 10 } }, spell_reserves: {}, power_reserves: {}, combat: { combat_meters: {} } },
    items: [],
    effects: [],
    sheet: { render() {} },
    getRollData: () => ({}),
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
    },
    async createEmbeddedDocuments(_type, documents) {
      if (createDelay) await new Promise(resolve => setTimeout(resolve, createDelay));
      const created = documents.map(data => {
        const document = {
          id: `ae-${++nextEffectId}`,
          ...clone(data),
          async update(updateData) {
            for (const [path, value] of Object.entries(clone(updateData))) {
              if (path.includes(".")) setPath(this, path, value);
              else this[path] = value;
            }
          }
        };
        this.effects.push(document);
        return document;
      });
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
    }
  };
  return actor;
}

function makeEffect(mode, actions, duration = { isPermanent: true, inCombat: false, _uiMode: "permanent" }) {
  return {
    id: `effect-${mode}`,
    uuid: `Item.effect-${mode}-${Math.random()}`,
    name: `Effect ${mode}`,
    img: "icons/svg/aura.svg",
    system: { conditionStackingMode: mode, tokenIconPolicy: "never", duration, actions }
  };
}

const attributeAction = (value = 1) => ({
  id: "attribute-action",
  type: "attribute",
  path: "system.attributes.st.passive",
  operation: "ADD",
  value,
  value_mode: "fixed",
  attribute_chat_visibility: "none"
});

test("unique deduplica persistentes diretos, mas repete ações pontuais", async () => {
  const actor = makeActor();
  const effect = makeEffect("unique", [
    attributeAction(2),
    { id: "hp-action", type: "resource_change", category: "hp", value: 1, chat_notice: false }
  ]);
  const targets = [{ actor }];

  await applySingleEffect(effect, targets, { actor, origin: effect });
  await applySingleEffect(effect, targets, { actor, origin: effect });

  assert.equal(actor.effects.length, 1);
  assert.equal(actor.system.attributes.hp.value, 12);
  assert.equal(actor.effects[0].flags.gum.stackingDomain, "direct");
  assert.equal(actor.effects[0].flags.gum.stackingMode, "unique");
  assert.ok(actor.effects[0].flags.gum.applicationId);
});

test("Emanação cria um controlador inerte e transmite o efeito inteiro sem ícone genérico nos afetados", async () => {
  const previousGeneration = game.release.generation;
  const previousRegion = CONFIG.Region;
  game.release.generation = 14;
  CONFIG.Region = { documentClass: { createTokenEmanation() {} } };
  try {
    const emitter = makeActor();
    const affected = makeActor();
    const effect = makeEffect("unique", [
      attributeAction(2),
      { id: "hp-action", type: "resource_change", category: "hp", value: -1, chat_notice: false }
    ]);
    effect.system.dynamicRegion = { enabled: true };
    effect.system.tokenIconPolicy = "always";

    await applySingleEffect(effect, [{ actor: emitter }], { actor: emitter, origin: effect });
    assert.equal(emitter.effects.length, 1);
    assert.equal(emitter.effects[0].flags.gum.actionType, "dynamic_region");
    assert.equal(emitter.effects[0].flags.gum.dynamicRegionController, true);
    assert.equal(emitter.system.attributes.hp.value, 10, "instant actions must wait for the Emanation");

    await applySingleEffect(effect, [{ actor: affected }], {
      actor: emitter,
      origin: effect,
      skipDynamicRegionController: true,
      gumFlags: { dynamicRegionGrant: { sourceUuid: "Scene.s.Region.aura" } },
      durationOverride: { isPermanent: true, inCombat: false }
    });
    assert.equal(affected.effects.length, 1);
    assert.equal(affected.effects[0].flags.gum.actionType, "attribute");
    assert.equal(affected.effects[0].flags.gum.dynamicRegionGrant.sourceUuid, "Scene.s.Region.aura");
    assert.equal(affected.effects[0].img, null);
    assert.equal(affected.effects[0].showIcon, 0);
    assert.equal(affected.system.attributes.hp.value, 9);
  } finally {
    game.release.generation = previousGeneration;
    if (previousRegion === undefined) delete CONFIG.Region;
    else CONFIG.Region = previousRegion;
  }
});

test("alteração de registro de combate alcança a integridade vinculada do equipamento", async () => {
  const actor = makeActor();
  const equipmentSystem = {
    quantity: 1,
    item_hp: 12,
    item_hp_current: 8,
    item_dr: 3,
    integrity_record_enabled: true,
    current_uses: 2,
    max_uses: 6
  };
  const equipment = {
    id: "shield",
    name: "Escudo",
    type: "equipment",
    system: clone(equipmentSystem),
    _source: { system: clone(equipmentSystem) },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        setPath(this, path, value);
        setPath(this._source, path.replace(/^system\./, "system."), value);
      }
    }
  };
  actor.items.push(equipment);
  const effect = makeEffect("unique", [{
    id: "integrity-action",
    type: "resource_change",
    category: "combat_tracker",
    name: "Escudo",
    value: -3,
    chat_notice: false
  }]);

  await applySingleEffect(effect, [{ actor }], { actor, origin: effect });

  assert.equal(equipment.system.item_hp_current, 5);
  assert.equal(equipment.system.current_uses, 2);
});

test("stack cria uma cópia por aplicação e fontes administradas ignoram a deduplicação genérica", async () => {
  const stackedActor = makeActor();
  const stacked = makeEffect("stack", [attributeAction()]);
  await applySingleEffect(stacked, [{ actor: stackedActor }]);
  await applySingleEffect(stacked, [{ actor: stackedActor }]);
  assert.equal(stackedActor.effects.length, 2);

  const managedActor = makeActor();
  const managed = makeEffect("unique", [attributeAction()]);
  await applySingleEffect(managed, [{ actor: managedActor }], { source: "passiveItem", stackingDomain: "managed" });
  await applySingleEffect(managed, [{ actor: managedActor }], { source: "passiveItem", stackingDomain: "managed" });
  assert.equal(managedActor.effects.length, 2);
  assert.ok(managedActor.effects.every(effect => effect.flags.gum.stackingDomain === "managed"));
});

test("refresh recalcula a cópia existente e reinicia sua duração", async () => {
  const actor = makeActor();
  const effect = makeEffect("refresh", [attributeAction(1)], { isPermanent: false, inCombat: false, unit: "seconds", value: 30 });
  await applySingleEffect(effect, [{ actor }]);
  const originalId = actor.effects[0].id;
  const originalApplicationId = actor.effects[0].flags.gum.applicationId;
  assert.equal(actor.effects[0].duration.startTime, 10);
  assert.equal(actor.effects[0].changes[0].value, 1);

  game.time.worldTime = 25;
  effect.system.actions[0].value = 4;
  await applySingleEffect(effect, [{ actor }]);

  assert.equal(actor.effects.length, 1);
  assert.equal(actor.effects[0].id, originalId);
  assert.equal(actor.effects[0].duration.startTime, 25);
  assert.equal(actor.effects[0].changes[0].value, 4);
  assert.notEqual(actor.effects[0].flags.gum.applicationId, originalApplicationId);
});

test("condições compartilham proprietários sem se misturar com aplicação direta", async () => {
  const actor = makeActor();
  const effect = makeEffect("unique", [attributeAction()]);
  await applySingleEffect(effect, [{ actor }], { source: "condition", conditionId: "condition-1" });
  await applySingleEffect(effect, [{ actor }], { source: "condition", conditionId: "condition-2" });
  await applySingleEffect(effect, [{ actor }], { stackingDomain: "direct" });

  assert.equal(actor.effects.length, 2);
  const conditionEffect = actor.effects.find(entry => entry.flags.gum.stackingDomain === "condition");
  assert.deepEqual(conditionEffect.flags.gum.conditionIds, ["condition-1", "condition-2"]);
  assert.ok(actor.effects.some(entry => entry.flags.gum.stackingDomain === "direct"));
});

test("aplicações unique concorrentes são serializadas", async () => {
  const actor = makeActor({ createDelay: 10 });
  const effect = makeEffect("unique", [attributeAction()]);
  await Promise.all([
    applySingleEffect(effect, [{ actor }]),
    applySingleEffect(effect, [{ actor }])
  ]);
  assert.equal(actor.effects.length, 1);
});
