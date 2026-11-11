import assert from "node:assert/strict";
import test from "node:test";

const previousGlobals = new Map();
for (const key of ["FormApplication", "Roll", "ChatMessage", "Hooks", "game", "foundry"]) {
  previousGlobals.set(key, globalThis[key]);
}

globalThis.FormApplication = class FormApplication {};
const { normalizeEffectDamageAction, rollEffectDamageAction } = await import("../module/services/effect-damage-roll-service.mjs");

test.after(() => {
  for (const [key, value] of previousGlobals) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

test("normalizes the main, follow-up, and fragmentation damage fields", () => {
  assert.deepEqual(normalizeEffectDamageAction({
    damage_formula: " 2d6+1 ",
    damage_type: "cor",
    damage_armor_divisor: "2",
    damage_follow_up_formula: "1d6",
    damage_fragmentation_formula: "2d6",
    damage_fragmentation_armor_divisor: 0
  }), {
    damage_formula: "2d6+1",
    damage_type: "cor",
    damage_nature: "",
    damage_armor_divisor: 2,
    damage_follow_up_formula: "1d6",
    damage_follow_up_type: "",
    damage_follow_up_nature: "",
    damage_follow_up_armor_divisor: 1,
    damage_fragmentation_formula: "2d6",
    damage_fragmentation_type: "",
    damage_fragmentation_nature: "",
    damage_fragmentation_armor_divisor: 1,
    damage_show_prompt: false,
    roll_visibility: "owners"
  });
});

test("rolls every configured damage component and binds the chat card to its target", async () => {
  const createdMessages = [];
  const emittedHooks = [];
  const totals = new Map([["2d6+1", 8], ["1d6", 4], ["2d6", 7]]);
  globalThis.Roll = class Roll {
    constructor(formula) {
      this.formula = formula;
      this.total = totals.get(formula);
      this.dice = [{ results: [{ result: this.total }] }];
    }
    async evaluate() { return this; }
  };
  globalThis.ChatMessage = { create: async data => { createdMessages.push(data); return data; } };
  globalThis.Hooks = { callAll: (...args) => emittedHooks.push(args) };
  globalThis.foundry = { utils: { escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("'", "&#39;") } };
  globalThis.game = {
    user: { id: "gm" },
    users: [{ id: "gm", isGM: true, active: true }],
    settings: { get: () => false },
    i18n: { localize: key => key }
  };

  const actor = {
    uuid: "Actor.target",
    name: "Alvo",
    system: { attributes: {} },
    getRollData: () => ({}),
    testUserPermission: () => false
  };
  const target = {
    actor,
    document: { documentName: "Token", uuid: "Scene.scene.Token.target" }
  };
  const result = await rollEffectDamageAction({
    action: {
      id: "damage-action",
      label: "Armadilha",
      type: "damage_roll",
      damage_formula: "2d6+1",
      damage_type: "cor",
      damage_armor_divisor: 2,
      damage_follow_up_formula: "1d6",
      damage_follow_up_type: "tox",
      damage_fragmentation_formula: "2d6",
      damage_fragmentation_type: "cor",
      roll_visibility: "owners"
    },
    effectItem: { id: "effect", uuid: "Item.effect", name: "Armadilha de espinhos" },
    target
  });

  assert.equal(result.rolls.length, 3);
  assert.equal(result.damagePackage.main.total, 8);
  assert.equal(result.damagePackage.followUp.total, 4);
  assert.equal(result.damagePackage.fragmentation.total, 7);
  assert.equal(result.damagePackage.targetActorUuid, "Actor.target");
  assert.equal(result.damagePackage.targetTokenUuid, "Scene.scene.Token.target");
  assert.equal(createdMessages.length, 1);
  assert.equal(createdMessages[0].rolls.length, 3);
  assert.match(createdMessages[0].content, /apply-damage-button/);
  assert.match(createdMessages[0].content, /Scene\.scene\.Token\.target/);
  assert.deepEqual(createdMessages[0].whisper, ["gm"]);
  assert.equal(emittedHooks.length, 1);
  assert.equal(emittedHooks[0][0], "gum.damageRolled");
  assert.equal(emittedHooks[0][1].item.uuid, "Item.effect");
  assert.equal(emittedHooks[0][1].targets[0], target);
});
