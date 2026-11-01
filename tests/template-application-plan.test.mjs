import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { resolveEquipmentDrop } from "../module/utils/equipment-drop.mjs";
import { calculateTraitCost } from "../module/utils/trait-cost.mjs";
import { addItemOrganizationGroup, moveOrganizedItem, normalizeItemOrganization } from "../module/utils/item-organization.mjs";
import { templateEntryDisplayName } from "../module/utils/template-entry-display.mjs";

const source = fs.readFileSync("module/actor/gurps-actor-sheet.js", "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export class GurpsActorSheet", "class GurpsActorSheet");
const context = vm.createContext({
  foundry: { appv1: { sheets: { ActorSheet: class {} } }, applications: { ux: {} }, data: { operators: {
    ForcedDeletion: class ForcedDeletion {}
  } }, utils: {
    deepClone: value => structuredClone(value), randomID: (() => { let n = 0; return () => `id-${++n}`; })(),
    getProperty: (root, path) => path.split(".").reduce((value, key) => value?.[key], root),
    escapeHTML: value => String(value)
  } },
  TextEditor: class {},
  game: { user: { id: "gm" }, i18n: { localize: key => key, format: key => key } },
  ui: { notifications: { error() {}, info() {} } },
  resolveEquipmentDrop,
  calculateTraitCost,
  addItemOrganizationGroup,
  moveOrganizedItem,
  normalizeItemOrganization,
  templateEntryDisplayName,
  console
});
vm.runInContext(`${source}\nthis.Sheet = GurpsActorSheet;`, context);
const sheet = new context.Sheet();

test("dropping a Template on a character starts the template application flow", async () => {
  const droppedTemplate = { id: "template", type: "template", name: "Traveler" };
  const dropSheet = new context.Sheet();
  let appliedTemplate = null;
  dropSheet._runTemplateApplicationFlow = async item => { appliedTemplate = item; };

  const previousItem = context.Item;
  const previousGetDragEventData = context.TextEditor.getDragEventData;
  context.TextEditor.getDragEventData = () => ({ type: "Item", uuid: "Item.template" });
  context.Item = { fromDropData: async () => droppedTemplate };
  let prevented = false;

  try {
    await dropSheet._onDrop({ preventDefault: () => { prevented = true; } });
  } finally {
    context.Item = previousItem;
    context.TextEditor.getDragEventData = previousGetDragEventData;
  }

  assert.equal(appliedTemplate, droppedTemplate);
  assert.equal(prevented, true);
});

test("template entry titles distinguish skill specializations without changing item names", async () => {
  const first = { id: "m1", kind: "item", itemType: "skill", name: "Mimicry", specialization: "Animal", cost: 1,
    inlineItem: { name: "Mimicry", system: { specialization: "Animal" } } };
  const second = { id: "m2", kind: "item", itemType: "skill", name: "Mimicry", cost: 1,
    inlineItem: { name: "Mimicry", system: { specialization: "Speech" } } };
  assert.equal((await sheet._buildTemplateEntryViewData(first)).title, "Mimicry (Animal)");
  assert.equal((await sheet._buildTemplateEntryViewData(second)).title, "Mimicry (Speech)");
  assert.equal(first.name, "Mimicry");
  assert.equal(templateEntryDisplayName({ name: "Mimicry (Animal)", specialization: "Animal" }), "Mimicry (Animal)");
});

test("same-name conflict detection separates skill specializations", () => {
  const conflictSheet = new context.Sheet();
  conflictSheet.actor = { items: [{ id: "a", type: "skill", name: "Survival", system: { specialization: "Desert" } },
    { id: "b", type: "skill", name: "Survival", system: { specialization: "Arctic" } }] };
  const matches = conflictSheet._getTemplateItemConflicts({ name: "Survival", itemType: "skill", specialization: "Arctic" });
  assert.deepEqual(matches.map(item => item.id), ["b"]);
});

test("choice rules include selected packages and owned items, but exclude ignored entries", () => {
  const ruleSheet = new context.Sheet();
  ruleSheet.actor = { items: [{ name: "Licença" }] };
  const blocks = [
    { id: "base", type: "guaranteed", contents: [{ id: "trait", name: "Arquearia", requiresNames: ["Licença"] }] },
    { id: "choice", type: "selection", contents: [
      { id: "package", kind: "group", name: "Caçador", requiresNames: ["Arquearia"],
        subBlocks: [{ id: "inside", type: "guaranteed", contents: [{ id: "bow", name: "Arco", excludesNames: ["Machado"] }] }] },
      { id: "axe", name: "Machado" }
    ] }
  ];
  assert.equal(ruleSheet._validateTemplateChoiceRules(blocks, { choice: { ids: ["package"] } }).length, 0);
  assert.equal(ruleSheet._validateTemplateChoiceRules(blocks, { choice: { ids: ["package", "axe"] } })[0].kind, "incompatible");
  assert.equal(ruleSheet._validateTemplateChoiceRules(blocks, {
    choice: { ids: ["package", "axe"] }, __conflicts: { axe: { action: "ignore" } }
  }).length, 0);
  ruleSheet.actor.items = [];
  assert.equal(ruleSheet._validateTemplateChoiceRules(blocks, { choice: { ids: ["package"] } })[0].kind, "required");
});

test("structured availability requirements inspect owned items, levels, exclusions, and selected options", () => {
  const availabilitySheet = new context.Sheet();
  availabilitySheet.actor = { items: [
    { id: "license", type: "advantage", name: "Licença de Porte", system: { level: 2 } },
    { id: "enemy", type: "disadvantage", name: "Procurado", system: { level: 1 } }
  ] };
  const blocks = [{ id: "shop", type: "money", contents: [
    { id: "rifle", itemType: "equipment", name: "Rifle", requirements: [
      { condition: "require", itemType: "advantage", name: "Licença de Porte", minimumLevel: 2 }
    ] },
    { id: "restricted", itemType: "equipment", name: "Documento", requirements: [
      { condition: "exclude", itemType: "disadvantage", name: "Procurado" }
    ] },
    { id: "ammo", itemType: "equipment", name: "Munição" },
    { id: "case", itemType: "equipment", name: "Estojo", requirements: [
      { condition: "require", itemType: "equipment", name: "Munição" }
    ] }
  ] }];
  assert.equal(availabilitySheet._getTemplateEntryAvailability(blocks[0].contents[0], blocks, {}).available, true);
  assert.equal(availabilitySheet._getTemplateEntryAvailability(blocks[0].contents[1], blocks, {}).available, false);
  assert.equal(availabilitySheet._getTemplateEntryAvailability(blocks[0].contents[3], blocks, { shop: { ids: ["ammo"] } }).available, true);
  assert.equal(availabilitySheet._getTemplateEntryAvailability(blocks[0].contents[3], blocks, { shop: { ids: [] } }).available, false);
});

test("the unified requirement engine accepts packages, Templates, attributes, and legacy rules", () => {
  const requirementSheet = new context.Sheet();
  requirementSheet.actor = { items: [] };
  const packageEntry = { id: "package", kind: "group", name: "Caçador", subBlocks: [] };
  const templateEntry = { id: "template", kind: "template", name: "Veterano", subBlocks: [] };
  const attributeEntry = { id: "attribute", kind: "attribute", label: "ST", attributes: { st: 1 } };
  const gated = { id: "gated", name: "Recompensa", requirements: [
    { condition: "require", itemType: "group", name: "Caçador" },
    { condition: "require", itemType: "template", name: "Veterano" },
    { condition: "require", itemType: "attribute", name: "ST" }
  ] };
  const legacy = { id: "legacy", name: "Legado", requiresNames: ["Caçador"], excludesNames: ["Proibido"] };
  const blocks = [{ id: "choice", type: "selection", contents: [packageEntry, templateEntry, attributeEntry, gated, legacy] }];
  const choices = { choice: { ids: ["package", "template", "attribute"] } };
  assert.equal(requirementSheet._getTemplateEntryAvailability(gated, blocks, choices).available, true);
  assert.equal(requirementSheet._getTemplateEntryAvailability(legacy, blocks, choices).available, true);
  assert.equal(requirementSheet._getTemplateEntryRequirements(legacy).length, 2);
});

test("manual availability can hide entries, omit guaranteed delivery, and allow an explicit GM override", () => {
  const availabilitySheet = new context.Sheet();
  availabilitySheet.actor = { items: [] };
  const hidden = { id: "hidden", kind: "item", itemType: "equipment", name: "Hidden", available: false, unavailableBehavior: "hidden" };
  const blocks = [{ id: "delivery", type: "guaranteed", contents: [hidden, { id: "open", kind: "item", itemType: "equipment", name: "Open" }] }];
  assert.equal(availabilitySheet._getTemplateEntryAvailability(hidden, blocks, {}).hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(availabilitySheet._buildTemplatePlanFromChoices(blocks, {}).plan.map(entry => entry.id))), ["open"]);
  context.game.user.isGM = true;
  hidden.allowGMOverride = true;
  assert.equal(availabilitySheet._getTemplateEntryAvailability(hidden, blocks, {}).overridden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(availabilitySheet._buildTemplatePlanFromChoices(blocks, {}).plan.map(entry => entry.id))), ["hidden", "open"]);
  context.game.user.isGM = false;
});

test("template steps include guaranteed blocks and only nested blocks from selected options", () => {
  const nested = { id: "nested", type: "guaranteed", contents: [{ id: "sword", kind: "item" }] };
  const blocks = [
    { id: "base", type: "guaranteed", contents: [{ id: "trait", kind: "item" }] },
    { id: "choice", type: "selection", contents: [
      { id: "a", kind: "group", subBlocks: [nested] },
      { id: "b", kind: "item" }
    ] }
  ];
  assert.deepEqual([...sheet._collectTemplateSteps(blocks, {})].map(block => block.id), ["base", "choice"]);
  assert.deepEqual([...sheet._collectTemplateSteps(blocks, { choice: { ids: ["a"] } })].map(block => block.id), ["base", "choice", "nested"]);
});

test("point plan uses chosen levels and equipment quantities without charging equipment currency", () => {
  const blocks = [{ id: "points", type: "points", pointsAvailable: 20, contents: [
    { id: "skill", kind: "item", itemType: "skill", name: "Sword", level: 0, cost: 2, difficulty: "M" },
    { id: "rope", kind: "item", itemType: "equipment", name: "Rope", quantity: 1, cost: 100, pointsCost: 2 }
  ] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["skill", "rope"], levels: { skill: 2 }, quantities: { rope: 3 } }
  });
  assert.equal(result.pointsLeftoverTotal, 6);
  assert.equal(result.plan[0].level, 2);
  assert.equal(result.plan[0].cost, 8);
  assert.equal(result.plan[1].quantity, 3);
  assert.equal(result.plan[1].cost, 100);
});

test("fixed equipment quantity ignores a requested change unless quantity consumes choices", () => {
  const fixed = { id: "fixed", kind: "item", itemType: "equipment", quantity: 2, quantityLocked: true, pointsCost: 3 };
  const adjustable = { id: "adjustable", kind: "item", itemType: "equipment", quantity: 2, quantityLocked: true,
    selectionQuantity: true, pointsCost: 3 };
  const blocks = [{ id: "points", type: "points", pointsAvailable: 30, contents: [fixed, adjustable] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["fixed", "adjustable"], quantities: { fixed: 5, adjustable: 4 } }
  });
  assert.equal(result.plan[0].quantity, 2);
  assert.equal(result.plan[1].quantity, 4);
  assert.equal(result.budgetResults[0].spent, 18);
});

test("equipment quantities are clamped to their configured acquisition limits", () => {
  const entry = { itemType: "equipment", quantity: 3, minimumQuantity: 2, maximumQuantity: 5 };
  assert.equal(sheet._templateEntryQuantity(entry, 1), 2);
  assert.equal(sheet._templateEntryQuantity(entry, 4), 4);
  assert.equal(sheet._templateEntryQuantity(entry, 10), 5);
  assert.equal(sheet._templateEntryQuantity({ ...entry, quantityLocked: true }, 5), 3);
});

test("point allocation scales attribute increments and cost, including quarter speed steps", () => {
  const entry = { id: "attrs", kind: "attribute", attributes: { st: 2, basic_speed: 0.5, dodge: 1 },
    costs: { st: 10, basic_speed: 5, dodge: 5 }, cost: 35 };
  const blocks = [{ id: "points", type: "points", pointsAvailable: 20, contents: [entry] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["attrs"], attributeValues: { attrs: { st: 1, basic_speed: 0.25, dodge: 0 } } }
  });
  assert.equal(result.budgetResults[0].spent, 15);
  assert.equal(result.plan[0].cost, 15);
  assert.equal(result.plan[0].attributes.st, 1);
  assert.equal(result.plan[0].attributes.basic_speed, 0.25);
  assert.equal(result.plan[0].attributes.dodge, 0);
  assert.equal(sheet._templateAttributeAmounts(entry, { st: 9 }).st, 9);
});

test("point allocation can move an attribute above its initial value without leaving phantom points", () => {
  const entry = { id: "attrs", kind: "attribute", attributes: { st: 1, dx: 1 },
    costs: { st: 10, dx: 20 }, cost: 30 };
  const blocks = [{ id: "points", type: "points", pointsAvailable: 20, contents: [entry] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["attrs"], attributeValues: { attrs: { st: 2, dx: 0 } } }
  });
  assert.equal(result.budgetResults[0].spent, 20);
  assert.equal(result.pointsLeftoverTotal, 0);
  assert.equal(result.plan[0].attributes.st, 2);
  assert.equal(result.plan[0].attributes.dx, 0);
  const deltas = {}, changes = [];
  sheet._accumulateAttributeChanges(result.plan[0], deltas, changes);
  assert.equal(deltas.st, 2);
  assert.equal(deltas.dx, undefined);
});

test("individual attribute caps constrain point allocation without limiting other attributes", () => {
  const entry = { id: "attrs", kind: "attribute", attributes: { st: 1, dx: 1 },
    attributeLimits: { st: 3, dx: 5 }, costs: { st: 10, dx: 20 }, cost: 30 };
  const blocks = [{ id: "points", type: "points", pointsAvailable: 130, contents: [entry] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["attrs"], attributeValues: { attrs: { st: 4, dx: 6 } } }
  });
  assert.equal(result.plan[0].attributes.st, 3);
  assert.equal(result.plan[0].attributes.dx, 5);
  assert.equal(result.budgetResults[0].spent, 130);
  assert.equal(result.pointsLeftoverTotal, 0);
  assert.equal(sheet._templateAttributeAmounts({ ...entry, attributeLimits: {} }, { st: 4, dx: 6 }).st, 4);
  assert.equal(sheet._templateAttributeAmounts({ attributes: { st: -1, basic_speed: 0.25 },
    attributeLimits: { st: 3, basic_speed: 0.5 } }, { st: -4, basic_speed: 1 }).st, -3);
  assert.equal(sheet._templateAttributeAmounts({ attributes: { basic_speed: 0.25 },
    attributeLimits: { basic_speed: 0.5 } }, { basic_speed: 1 }).basic_speed, 0.5);
});

test("fixed attribute values cannot be reduced or increased during allocation", () => {
  const entry = { id: "attrs", kind: "attribute", attributes: { st: 2, dx: 1 }, lockedAttributes: ["st"],
    attributeLimits: { st: 4, dx: 4 }, costs: { st: 10, dx: 20 }, cost: 40 };
  const result = sheet._buildTemplatePlanFromChoices(
    [{ id: "points", type: "points", pointsAvailable: 100, contents: [entry] }],
    { points: { ids: ["attrs"], attributeValues: { attrs: { st: 0, dx: 3 } } } }
  );
  assert.equal(result.plan[0].attributes.st, 2);
  assert.equal(result.plan[0].attributes.dx, 3);
  assert.equal(result.budgetResults[0].spent, 80);
});

test("an attribute may start at zero and become available through its configured cap", () => {
  const entry = { kind: "attribute", attributes: { st: 0, dx: 0 },
    attributeLimits: { st: 3 }, costs: { st: 10, dx: 20 }, cost: 0 };
  assert.deepEqual({ ...sheet._templateAttributeAmounts(entry, { st: 2 }) }, { st: 2 });
  assert.equal(sheet._templateAttributeCost(entry, { st: 2 }), 20);
});

test("an explicitly selected attribute may start at zero without a configured cap", () => {
  const entry = { kind: "attribute", attributes: { st: 0 }, selectedAttributes: ["st"],
    attributeLimits: {}, costs: { st: 10 }, cost: 0 };
  assert.deepEqual({ ...sheet._templateAttributeAmounts(entry) }, { st: 0 });
  assert.deepEqual({ ...sheet._templateAttributeAmounts(entry, { st: 2 }) }, { st: 2 });
  assert.equal(sheet._templateAttributeCost(entry, { st: 2 }), 20);
});

test("negative attribute choices refund points into a positive allocation budget", () => {
  const entry = { id: "attrs", kind: "attribute", attributes: { st: 0 }, selectedAttributes: ["st"],
    attributeLimits: { st: 3 }, costs: { st: 10 }, cost: 0 };
  const blocks = [{ id: "points", type: "points", pointsAvailable: 15, contents: [entry] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["attrs"], attributeValues: { attrs: { st: -2 } } }
  });
  assert.equal(result.plan[0].cost, -20);
  assert.equal(result.budgetResults[0].spent, -20);
  assert.equal(result.pointsLeftoverTotal, 35);
  assert.equal(sheet._isTemplatePointsSpendValid({ pointsAvailable: 15 }, -20), true);
});

test("template attributes map secondary statistics and maximum HP/FP to their actor paths", () => {
  const actorSheet = new context.Sheet();
  actorSheet.actor = { system: { attributes: {
    st: { value: 10 }, dx: { value: 10 }, ht: { value: 10 }, per: { value: 10 },
    hp: { value: 10, max: 12 }, fp: { value: 10, max: 11 },
    vision: { value: 10 }, hearing: { value: 10 }, touch: { value: 10 },
    basic_move: { value: 5 }, enhanced_move: { value: 0 }, dodge: { value: 8 }, mt: { value: 0 }
  } } };
  const deltas = {}, changes = [];
  actorSheet._accumulateAttributeChanges({ attributes: {
    vision: 2, hearing: 1, touch: 1, mt: 1, basic_move: 1,
    enhanced_move: 2, dodge: 1, hp_max: 3, fp_max: 2
  } }, deltas, changes);
  const update = actorSheet._buildTemplateAttributeUpdateData(deltas);
  assert.equal(update["system.attributes.vision.value"], 12);
  assert.equal(update["system.attributes.hearing.value"], 11);
  assert.equal(update["system.attributes.touch.value"], 11);
  assert.equal(update["system.attributes.mt.value"], 1);
  assert.equal(update["system.attributes.basic_move.value"], 6);
  assert.equal(update["system.attributes.enhanced_move.value"], 2);
  assert.equal(update["system.attributes.dodge.value"], 9);
  assert.equal(update["system.attributes.hp.max"], 15);
  assert.equal(update["system.attributes.fp.max"], 13);
  assert.ok(changes.some(change => change.key === "hp.max" && change.amount === 3));
});

test("review conflict choices omit ignored entries and return their point budget", () => {
  const blocks = [{ id: "points", type: "points", pointsAvailable: 10, contents: [
    { id: "skill", kind: "item", itemType: "skill", name: "Sword", cost: 4, difficulty: "M" },
    { id: "spell", kind: "item", itemType: "spell", name: "Light", cost: 2, difficulty: "M" }
  ] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {
    points: { ids: ["skill", "spell"] },
    __conflicts: { skill: { action: "ignore" }, spell: { action: "duplicate" } }
  });
  assert.deepEqual([...result.plan].map(entry => entry.id), ["spell"]);
  assert.equal(result.pointsLeftoverTotal, 8);
});

test("referenced templates expand their own blocks and preserve the origin chain", async () => {
  const referenced = { id: "kit", uuid: "Item.kit", type: "template", name: "Adventurer Kit", img: "kit.webp",
    system: { blocks: [{ id: "kit-block", type: "guaranteed", contents: [{ id: "rope", kind: "item", itemType: "equipment", name: "Rope" }] }] } };
  context.fromUuid = async uuid => uuid === referenced.uuid ? referenced : null;
  context.game.items = { get: () => null };
  const root = { id: "root", uuid: "Item.root", name: "Barbarian", system: { blocks: [
    { id: "choose-kit", type: "selection", contents: [{ id: "ref", kind: "template", uuid: referenced.uuid, name: referenced.name }] }
  ] } };
  const result = await sheet._resolveTemplateReferenceGraph(root);
  assert.equal(result.blocks[0].contents[0].subBlocks[0].id, "ref:kit-block");
  assert.deepEqual([...result.blocks[0].contents[0].subBlocks[0].originChain].map(entry => entry.name), ["Barbarian", "Adventurer Kit"]);
});

test("two occurrences of a referenced Template keep independent choice IDs", async () => {
  const reference = { id: "kit", uuid: "Item.kit", type: "template", name: "Kit", system: { blocks: [
    { id: "choose", type: "selection", contents: [{ id: "a", kind: "item", name: "A" }, { id: "b", kind: "item", name: "B" }] }
  ] } };
  context.fromUuid = async uuid => uuid === reference.uuid ? reference : null;
  const root = { id: "root", uuid: "Item.root", name: "Root", system: { blocks: [
    { id: "base", type: "guaranteed", contents: [
      { id: "first", kind: "template", uuid: reference.uuid, repeatable: true },
      { id: "second", kind: "template", uuid: reference.uuid, repeatable: true }
    ] }
  ] } };
  const graph = await sheet._resolveTemplateReferenceGraph(root);
  assert.equal(graph.blocks[0].contents[0].subBlocks[0].id, "first:choose");
  assert.equal(graph.blocks[0].contents[1].subBlocks[0].id, "second:choose");
  assert.notEqual(graph.blocks[0].contents[0].subBlocks[0].contents[0].id, graph.blocks[0].contents[1].subBlocks[0].contents[0].id);
});

test("shared points across referenced blocks are charged once and validated cumulatively", () => {
  const sharedBudgets = [{ name: "Heroic", type: "points", amount: 10, policy: "hard" }];
  const blocks = [{ id: "base", type: "guaranteed", contents: [
    { id: "first", kind: "template", name: "A", subBlocks: [{ id: "a", type: "points", sharedBudgetKey: "Heroic", contents: [
      { id: "trait-a", kind: "item", itemType: "advantage", cost: 6 }
    ] }] },
    { id: "second", kind: "template", name: "B", subBlocks: [{ id: "b", type: "points", sharedBudgetKey: "Heroic", contents: [
      { id: "trait-b", kind: "item", itemType: "advantage", cost: 5 }
    ] }] }
  ] }];
  const choices = { a: { ids: ["trait-a"] }, b: { ids: ["trait-b"] } };
  const result = sheet._buildTemplatePlanFromChoices(blocks, choices, sharedBudgets);
  assert.equal(result.budgetResults.length, 1);
  assert.equal(result.budgetResults[0].spent, 11);
  assert.equal(result.pointsLeftoverTotal, -1);
  assert.equal(sheet._isTemplateBudgetResultValid(result.budgetResults[0]), false);
  const draft = sheet._templateBudgetStatus(blocks[0].contents[1].subBlocks[0], { ids: [] }, blocks, choices, sharedBudgets);
  assert.equal(draft.spent, 6);
  assert.equal(draft.valid, true);
  const earlier = sheet._templateBudgetStatus(blocks[0].contents[0].subBlocks[0], { ids: ["trait-a"] }, blocks, choices, sharedBudgets);
  assert.equal(earlier.spent, 6);
  assert.equal(earlier.valid, true);
});

test("shared money pools are charged once and retain the pool accounting rule", () => {
  const budgets = [{ name: "Equipment", type: "money", amount: 100, policy: "allow", accounting: "deduct",
    paymentRules: { categories: ["coins"], modes: ["physical"], locations: ["carried"] } }];
  const blocks = [{ id: "a", type: "money", sharedBudgetKey: "Equipment", contents: [
    { id: "rope", kind: "item", itemType: "equipment", cost: 20, quantity: 1 }
  ] }, { id: "b", type: "money", sharedBudgetKey: "Equipment", contents: [
    { id: "torch", kind: "item", itemType: "equipment", cost: 15, quantity: 1 }
  ] }];
  const choices = { a: { ids: ["rope"], quantities: { rope: 2 } }, b: { ids: ["torch"], quantities: { torch: 1 } } };
  const result = sheet._buildTemplatePlanFromChoices(blocks, choices, budgets);
  assert.equal(result.budgetResults.length, 1);
  assert.equal(result.budgetResults[0].spent, 55);
  assert.equal(result.budgetResults[0].accounting, "deduct");
  assert.equal(result.budgetResults[0].moneyMode, "shared");
  assert.deepEqual(JSON.parse(JSON.stringify(result.budgetResults[0].paymentRules)), {
    categories: ["coins"], modes: ["physical"], locations: ["carried"]
  });
  assert.equal(result.pointsLeftoverTotal, 0);
});

test("money costs use an explicit unit price for every entry type and never become negative", () => {
  assert.equal(sheet._templateMoneyCost({ itemType: "skill", cost: 4, moneyCost: 12 }, 3), 36);
  assert.equal(sheet._templateMoneyCost({ itemType: "advantage", cost: 20, moneyCost: -5 }, 1), 0);
  assert.equal(sheet._templateMoneyCost({ itemType: "equipment", cost: 7 }, 2), 14);
});

test("money spending modes preserve legacy data and explicit mode semantics", () => {
  const legacyDeduct = { id: "legacy", type: "money", moneyAvailable: 80, moneyAccounting: "deduct", moneySourceFilter: "wallet", contents: [
    { id: "legacy-item", kind: "item", itemType: "equipment", cost: 20, quantity: 1 }
  ] };
  const explicitAvailable = { id: "available", type: "money", moneyMode: "available", sharedBudgetKey: "Stale", moneyAvailable: 50, moneyAccounting: "deduct", moneySourceFilter: "ignored", contents: [
    { id: "available-item", kind: "item", itemType: "equipment", cost: 15, quantity: 1 }
  ] };
  const choices = { legacy: { ids: ["legacy-item"] }, available: { ids: ["available-item"] } };
  const result = sheet._buildTemplatePlanFromChoices([legacyDeduct, explicitAvailable], choices, [
    { name: "Stale", type: "money", amount: 999, policy: "hard", accounting: "deduct" }
  ]);

  assert.equal(result.budgetResults.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.budgetResults.map(entry => ({ blockId: entry.blockId, moneyMode: entry.moneyMode, accounting: entry.accounting, filter: entry.moneySourceFilter })))),
    [
      { blockId: "legacy", moneyMode: "deduct", accounting: "deduct", filter: "wallet" },
      { blockId: "available", moneyMode: "available", accounting: "budget", filter: "" }
    ]
  );
});

test("referenced template cycles are rejected", async () => {
  const a = { id: "a", uuid: "Item.a", type: "template", name: "A", system: { blocks: [
    { id: "a-block", type: "guaranteed", contents: [{ id: "to-b", kind: "template", uuid: "Item.b", name: "B" }] }
  ] } };
  const b = { id: "b", uuid: "Item.b", type: "template", name: "B", system: { blocks: [
    { id: "b-block", type: "guaranteed", contents: [{ id: "to-a", kind: "template", uuid: "Item.a", name: "A" }] }
  ] } };
  context.fromUuid = async uuid => ({ "Item.a": a, "Item.b": b })[uuid] || null;
  assert.equal(await sheet._resolveTemplateReferenceGraph(a), null);
});

test("money budgets support hard, permissive, and GM-only excess policies", () => {
  context.game.user.isGM = false;
  assert.equal(sheet._isTemplateMoneySpendValid({ moneyAvailable: 100, budgetPolicy: "hard" }, 101), false);
  assert.equal(sheet._isTemplateMoneySpendValid({ moneyAvailable: 100, budgetPolicy: "allow" }, 150), true);
  assert.equal(sheet._isTemplateMoneySpendValid({ moneyAvailable: 100, budgetPolicy: "gm" }, 150), false);
  context.game.user.isGM = true;
  assert.equal(sheet._isTemplateMoneySpendValid({ moneyAvailable: 100, budgetPolicy: "gm" }, 150), true);
  context.game.user.isGM = false;
});

test("an empty character spending limit is unlimited while a numeric limit remains enforced", () => {
  const item = { id: "item", kind: "item", itemType: "equipment", cost: 150, quantity: 1 };
  const choices = { purchase: { ids: ["item"] } };
  const unlimited = sheet._buildTemplatePlanFromChoices([
    { id: "purchase", type: "money", moneyMode: "deduct", spendingLimit: "", moneyAvailable: 50, budgetPolicy: "hard", contents: [item] }
  ], choices).budgetResults[0];
  const limited = sheet._buildTemplatePlanFromChoices([
    { id: "purchase", type: "money", moneyMode: "deduct", spendingLimit: 100, moneyAvailable: 500, budgetPolicy: "hard", contents: [item] }
  ], choices).budgetResults[0];

  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.excess, 0);
  assert.equal(sheet._isTemplateBudgetResultValid(unlimited), true);
  assert.equal(limited.unlimited, false);
  assert.equal(limited.budget, 100);
  assert.equal(sheet._isTemplateBudgetResultValid(limited), false);
});

test("purchase blocks can deduct money and record the reversible charge", async () => {
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, money: { value: 100 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items: Object.assign([], { get: () => null }),
    async update(data) {
      if (data["system.money.value"] !== undefined) this.system.money.value = data["system.money.value"];
      if (data["system.applied_models"]) this.system.applied_models = data["system.applied_models"];
    }
  };
  const purchaseSheet = new context.Sheet();
  purchaseSheet.actor = actor;
  purchaseSheet._buildTemplateAttributeUpdateData = () => ({});
  const applied = await purchaseSheet._applyTemplatePlan({ id: "shop", name: "Shop" }, [], {
    budgetResults: [{ type: "money", spent: 30, accounting: "deduct" }]
  });
  assert.equal(applied, true);
  assert.equal(actor.system.money.value, 70);
  assert.equal(actor.system.applied_models[0].moneySpent, 30);
  assert.equal(actor.system.applied_models[0].moneySnapshot.before, 100);
  assert.equal(actor.system.applied_models[0].moneySnapshot.after, 70);
});

test("purchase blocks select and debit their own compatible money sources", async () => {
  const makeSource = (id, name, category, balance) => ({
    id, name, type: "money_source", system: { mode: "abstract", category, balance },
    toObject() { return structuredClone({ id, name, type: "money_source", system: this.system }); },
    async update(data) { if (data["system.balance"] !== undefined) this.system.balance = data["system.balance"]; }
  });
  const coin = makeSource("coin", "Purse", "coins", 80);
  const credit = makeSource("credit", "Guild credit", "credit", 30);
  const items = [coin, credit];
  items.get = id => items.find(item => item.id === id);
  items.has = id => Boolean(items.get(id));
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, money: { value: 0 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items,
    async update(data) { if (data["system.applied_models"]) this.system.applied_models = data["system.applied_models"]; }
  };
  const purchaseSheet = new context.Sheet();
  purchaseSheet.actor = actor;
  purchaseSheet._buildTemplateAttributeUpdateData = () => ({});
  const budgets = [
    { blockId: "gear", title: "Gear", type: "money", accounting: "deduct", spent: 35, moneySourceFilter: "coins" },
    { blockId: "fees", title: "Fees", type: "money", accounting: "deduct", spent: 10, moneySourceFilter: "Guild credit" }
  ];
  const payments = purchaseSheet._buildTemplatePaymentTransactions(budgets, { gear: "coin", fees: "credit" });
  assert.equal(payments.valid, true);
  assert.equal(payments.transactions.length, 2);
  assert.equal(purchaseSheet._buildTemplatePaymentTransactions(budgets, { gear: "credit", fees: "credit" }).reason, "source");
  const applied = await purchaseSheet._applyTemplatePlan({ id: "shop", name: "Shop" }, [], { budgetResults: budgets, moneySourceIds: { gear: "coin", fees: "credit" } });
  assert.equal(applied, true);
  assert.equal(coin.system.balance, 45);
  assert.equal(credit.system.balance, 20);
  assert.equal(actor.system.applied_models[0].moneyTransactions.length, 2);
});

test("one purchase can be split across multiple money sources", async () => {
  const makeSource = (id, name, balance) => ({
    id, name, type: "money_source", system: { mode: "abstract", category: "funds", balance },
    toObject() { return structuredClone({ id, name, type: "money_source", system: this.system }); },
    async update(data) { if (data["system.balance"] !== undefined) this.system.balance = data["system.balance"]; }
  });
  const purse = makeSource("purse", "Purse", 50);
  const bank = makeSource("bank", "Bank", 40);
  const items = [purse, bank];
  items.get = id => items.find(item => item.id === id);
  items.has = id => Boolean(items.get(id));
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, money: { value: 0 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items,
    async update(data) { if (data["system.applied_models"]) this.system.applied_models = data["system.applied_models"]; }
  };
  const purchaseSheet = new context.Sheet();
  purchaseSheet.actor = actor;
  purchaseSheet._buildTemplateAttributeUpdateData = () => ({});
  const budgets = [{ blockId: "gear", title: "Gear", type: "money", accounting: "deduct", spent: 70, moneySourceFilter: "funds" }];
  const moneyAllocations = { gear: [
    { sourceId: "purse", amount: 20 },
    { sourceId: "purse", amount: 20 },
    { sourceId: "bank", amount: 30 }
  ] };
  const payments = purchaseSheet._buildTemplatePaymentTransactions(budgets, moneyAllocations);

  assert.equal(payments.valid, true);
  assert.equal(payments.transactions.length, 2);
  assert.equal(payments.transactions.find(transaction => transaction.sourceId === "purse").amount, 40);
  assert.equal(purchaseSheet._buildTemplatePaymentTransactions(budgets, { gear: [{ sourceId: "purse", amount: 40 }] }).reason, "allocation");
  assert.equal(purchaseSheet._buildTemplatePaymentTransactions(budgets, { gear: [{ sourceId: "purse", amount: 60 }, { sourceId: "bank", amount: 10 }] }).reason, "insufficient");

  const applied = await purchaseSheet._applyTemplatePlan({ id: "shop", name: "Shop" }, [], { budgetResults: budgets, moneyAllocations });
  assert.equal(applied, true);
  assert.equal(purse.system.balance, 10);
  assert.equal(bank.system.balance, 10);
  assert.equal(actor.system.applied_models[0].moneyTransactions.length, 2);
});

test("structured payment rules filter category, source type, and location", () => {
  const ruleSheet = new context.Sheet();
  const coin = { id: "coin", name: "Purse", type: "money_source", system: { category: "Coins", mode: "physical", location: "carried", quantity: 5, unit_value: 10 } };
  const bank = { id: "bank", name: "Bank", type: "money_source", system: { category: "Credit", mode: "abstract", location: "stored", balance: 100 } };
  const items = [coin, bank];
  items.get = id => items.find(item => item.id === id);
  ruleSheet.actor = { items };
  const result = { paymentRules: { categories: ["coins"], modes: ["physical"], locations: ["carried"] } };
  assert.deepEqual(ruleSheet._getCompatibleTemplateMoneySources(result).map(item => item.id), ["coin"]);
  assert.equal(ruleSheet._getCompatibleTemplateMoneyBalance(result), 50);
  assert.equal(ruleSheet._moneySourceMatchesFilter(coin, "Purse", result.paymentRules), true);
  assert.equal(ruleSheet._moneySourceMatchesFilter(coin, "Credit", result.paymentRules), false);
});

test("automatic payment respects physical denominations and can finish with abstract money", () => {
  const allocationSheet = new context.Sheet();
  const coins = { id: "coins", type: "money_source", system: { mode: "physical", quantity: 3, unit_value: 10 } };
  const account = { id: "account", type: "money_source", system: { mode: "abstract", balance: 20 } };
  allocationSheet.actor = { items: Object.assign([coins, account], { get: id => id === "coins" ? coins : account }) };
  assert.deepEqual(JSON.parse(JSON.stringify(allocationSheet._buildAutomaticTemplatePaymentAllocations({ spent: 35 }, [coins, account]))), [
    { sourceId: "coins", amount: 30 }, { sourceId: "account", amount: 5 }
  ]);
  const budget = [{ blockId: "buy", type: "money", accounting: "deduct", spent: 15 }];
  assert.equal(allocationSheet._buildTemplatePaymentTransactions(budget, { buy: [{ sourceId: "coins", amount: 15 }] }).reason, "denomination");
  assert.equal(allocationSheet._buildTemplatePaymentTransactions([{ ...budget[0], spent: 20 }], { buy: [{ sourceId: "coins", amount: 20 }] }).valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(allocationSheet._getMoneySourceDebit(coins, 20))), { "system.quantity": 1 });
});

test("detaching a template removes only its record and clears item provenance", async () => {
  const item = { id: "sword" };
  const items = [item];
  items.has = id => id === item.id;
  const actor = {
    items,
    system: { applied_models: [{ applicationId: "app" }, { applicationId: "other" }] },
    async updateEmbeddedDocuments(_kind, updates) { this.itemUpdates = updates; },
    async update(data) { this.system.applied_models = data["system.applied_models"]; }
  };
  const detachSheet = new context.Sheet();
  detachSheet.actor = actor;
  await detachSheet._detachTemplateApplication({ applicationId: "app", templateName: "Starter", createdItemIds: ["sword"] }, actor.system.applied_models);
  assert.deepEqual(actor.system.applied_models.map(record => record.applicationId), ["other"]);
  assert.equal(actor.itemUpdates[0]._id, "sword");
  assert.ok(actor.itemUpdates[0].flags.gum.templateApplicationId instanceof context.foundry.data.operators.ForcedDeletion);
  assert.ok(actor.itemUpdates[0].flags.gum.templateApplied instanceof context.foundry.data.operators.ForcedDeletion);
  assert.ok(actor.itemUpdates[0].flags.gum.templateDestination instanceof context.foundry.data.operators.ForcedDeletion);
  assert.ok(actor.itemUpdates[0].flags.gum.templateContainer instanceof context.foundry.data.operators.ForcedDeletion);
});

test("selection validation enforces the configured maximum and exact mode", () => {
  assert.equal(sheet._isTemplateSelectionValid({ choiceCount: 1 }, 0), true);
  assert.equal(sheet._isTemplateSelectionValid({ choiceCount: 1 }, 1), true);
  assert.equal(sheet._isTemplateSelectionValid({ choiceCount: 1 }, 2), false);
  assert.equal(sheet._isTemplateSelectionValid({ choiceCount: 2, choiceExact: true }, 1), false);
  assert.equal(sheet._isTemplateSelectionValid({ choiceCount: 2, choiceExact: true }, 2), true);
});

test("selection quantities consume choices only when an equipment entry enables it", () => {
  const block = { choiceCount: 3, contents: [
    { id: "fixed", itemType: "equipment", quantity: 4 },
    { id: "stack", itemType: "equipment", quantity: 1, selectionQuantity: true }
  ] };
  assert.equal(sheet._templateSelectionUnits(block, ["fixed", "stack"], { fixed: 4, stack: 2 }), 3);
  assert.equal(sheet._isTemplateSelectionValid(block, sheet._templateSelectionUnits(block, ["fixed", "stack"], { fixed: 4, stack: 3 })), false);
});

test("point validation blocks spending above either positive or negative budgets", () => {
  assert.equal(sheet._isTemplatePointsSpendValid({ pointsAvailable: 5 }, 5), true);
  assert.equal(sheet._isTemplatePointsSpendValid({ pointsAvailable: 5 }, 6), false);
  assert.equal(sheet._isTemplatePointsSpendValid({ pointsAvailable: -5 }, -5), true);
  assert.equal(sheet._isTemplatePointsSpendValid({ pointsAvailable: -5 }, -6), false);
});

test("levelled trait cost is recalculated from the chosen level", () => {
  const trait = { itemType: "advantage", cost: 5, trait_cost: { points: 5, points_per_level: 10, can_level: true, level: 0 } };
  assert.equal(sheet._templateChoiceCost(trait, 2), 25);
});

test("level caps limit the selected level and its point cost", () => {
  const trait = { itemType: "advantage", maxLevel: 2, trait_cost: { points: 5, points_per_level: 10, can_level: true, level: 0 } };
  assert.equal(sheet._templateEntryLevel(trait, 4), 2);
  assert.equal(sheet._templateChoiceCost(trait, 4), 25);
  assert.equal(sheet._templateEntryLevel({ itemType: "skill", maxLevel: 1 }, 3), 1);
});

test("entry destination can override or opt out of a block default", () => {
  const blocks = [{ id: "base", type: "guaranteed", destinationGroup: "Racial", containerName: "Pack", contents: [
    { id: "a", kind: "item", itemType: "advantage", destinationMode: "source" },
    { id: "b", kind: "item", itemType: "skill", destinationMode: "group", destinationGroup: "Training" },
    { id: "c", kind: "item", itemType: "equipment", containerMode: "loose" },
    { id: "group", kind: "group", subBlocks: [{ id: "nested", type: "guaranteed", contents: [
      { id: "d", kind: "item", itemType: "advantage" }
    ] }] }
  ] }];
  const result = sheet._buildTemplatePlanFromChoices(blocks, {});
  assert.equal(result.plan[0].destinationGroup, "");
  assert.equal(result.plan[1].destinationGroup, "Training");
  assert.equal(result.plan[2].containerName, "");
  assert.equal(result.plan[3].destinationGroup, "Racial");
});

test("applied-template identity prefers UUID when compendiums reuse an item ID", () => {
  const browserSheet = new context.Sheet();
  browserSheet.actor = { system: { applied_models: [{
    templateId: "same", templateUuid: "Compendium.one.Item.same", templateName: "Guard"
  }] } };
  assert.equal(browserSheet._findAppliedModelRecord({ id: "same", uuid: "Compendium.two.Item.same", name: "Guard" }), undefined);
  assert.ok(browserSheet._findAppliedModelRecord({ id: "same", uuid: "Compendium.one.Item.same", name: "Guard" }));
});

test("application creates a real container, links equipment, and records both IDs", async () => {
  const items = [];
  const links = [];
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items: Object.assign(items, { get: id => items.find(item => item.id === id) }),
    async createEmbeddedDocuments(_kind, data) {
      const created = data.map((value, i) => ({
        id: `${value.flags.gum.templateContainer ? "container" : "item"}-${items.length + i}`,
        name: value.name, type: value.type, system: value.system, flags: value.flags,
        getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; }
      }));
      items.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(_kind, updates) { links.push(...updates); },
    async update(data) { if (data["system.applied_models"]) this.system.applied_models = data["system.applied_models"]; }
  };
  const application = new context.Sheet();
  application.actor = actor;
  application._buildTemplateAttributeUpdateData = () => ({});
  const entry = {
    id: "rope", kind: "item", itemType: "equipment", name: "Rope", quantity: 3,
    level: "2", pointsCost: 4, containerName: "Travel kit",
    inlineItem: { type: "equipment", name: "Rope", system: { cost: 12, quantity: 1, level: "", points: 0 } }
  };
  assert.equal(await application._applyTemplatePlan({ id: "template", uuid: "Item.template", name: "Travel" }, [entry]), true);
  assert.equal(items.length, 2);
  assert.equal(items[0].system.is_container, true);
  assert.equal(items[1].system.level, "2");
  assert.equal(items[1].system.points, 4);
  assert.equal(links[0]["system.parent_container_id"], items[0].id);
  assert.equal(actor.system.applied_models[0].createdItemIds.length, 2);
});

test("application assigns a copied advantage to a character organization group", async () => {
  const items = [];
  items.get = id => items.find(item => item.id === id);
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items,
    async createEmbeddedDocuments(_kind, data) {
      const created = data.map((value, i) => ({ id: `trait-${i}`, name: value.name, type: value.type,
        system: value.system, flags: value.flags,
        getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; } }));
      items.push(...created);
      return created;
    },
    async update(data) { if (data["system.applied_models"]) this.system.applied_models = data["system.applied_models"]; }
  };
  const application = new context.Sheet();
  application.actor = actor;
  application._buildTemplateAttributeUpdateData = () => ({});
  application._saveCharacteristicOrganization = async organization => { actor.system.characteristic_organization = organization; };
  assert.equal(await application._applyTemplatePlan({ id: "race", name: "Elf" }, [{
    id: "eyes", kind: "item", itemType: "advantage", name: "Night Vision", destinationGroup: "Racial: Elf",
    inlineItem: { type: "advantage", name: "Night Vision", system: { points: 5 } }
  }]), true);
  const organization = actor.system.characteristic_organization;
  assert.equal(organization.groups[organization.assignments[items[0].id]].name, "Racial: Elf");
  assert.equal(items[0].system.group, "Racial: Elf");
});

test("failed item creation removes a container created earlier in the same application", async () => {
  const deleted = [];
  let calls = 0;
  const actor = {
    system: { attributes: {}, points: { unspent: 0 }, applied_models: [], skill_organization: {}, characteristic_organization: {} },
    items: [],
    async createEmbeddedDocuments(_kind, data) {
      calls++;
      if (calls === 2) throw new Error("simulated item failure");
      return data.map(value => ({ id: "container", name: value.name,
        getFlag(namespace, key) { return value.flags?.[namespace]?.[key]; } }));
    },
    async deleteEmbeddedDocuments(_kind, ids) { deleted.push(...ids); },
    async update() {}
  };
  const application = new context.Sheet();
  application.actor = actor;
  application._buildTemplateAttributeUpdateData = () => ({});
  const originalConsole = context.console;
  context.console = { error() {} };
  try {
    assert.equal(await application._applyTemplatePlan({ id: "template", name: "Travel" }, [{
      id: "rope", kind: "item", itemType: "equipment", name: "Rope", containerName: "Kit",
      inlineItem: { type: "equipment", name: "Rope", system: { quantity: 1, cost: 1 } }
    }]), false);
    assert.deepEqual(deleted, ["container"]);
  } finally {
    context.console = originalConsole;
  }
});

test("selective removal keeps unselected template items in the application record", async () => {
  const items = [{ id: "a", name: "Sword", type: "equipment", system: {} },
    { id: "b", name: "Shield", type: "equipment", system: {} }];
  items.get = id => items.find(item => item.id === id);
  items.has = id => items.some(item => item.id === id);
  const record = { applicationId: "app", templateName: "Guard", createdItemIds: ["a", "b"],
    attributeChanges: [], pointsLeftover: 0 };
  const actor = {
    system: { applied_models: [record] }, items,
    async deleteEmbeddedDocuments(_kind, ids) {
      for (const id of ids) items.splice(items.findIndex(item => item.id === id), 1);
    },
    async update(data) { this.system.applied_models = data["system.applied_models"]; }
  };
  const html = { find(selector) {
    if (selector === 'input[name="remove-item"]:checked') return { map: () => ({ get: () => ["a"] }) };
    if (selector === 'input[name="remove-attribute"]:checked') return { map: () => ({ get: () => [] }) };
    return { is: () => false };
  } };
  context.Dialog = class {
    constructor(config) { this.config = config; }
    render() { this.config.buttons.remove.callback(html); }
  };
  const removalSheet = new context.Sheet();
  removalSheet.actor = actor;
  await removalSheet._onRemoveCharacterModel({ preventDefault() {}, currentTarget: { dataset: { applicationId: "app" } } });
  assert.deepEqual(items.map(item => item.id), ["b"]);
  assert.deepEqual(actor.system.applied_models[0].createdItemIds, ["b"]);
  assert.equal(actor.system.applied_models[0].removedAt, undefined);
});

test("full attribute removal restores prior secondary values recorded at application", async () => {
  const record = {
    applicationId: "attrs", templateName: "Strong", createdItemIds: [],
    attributeChanges: [{ key: "st", amount: 1 }], secondaryRecalcApplied: true,
    attributeSnapshots: {
      "system.attributes.st.value": { before: 10, after: 11 },
      "system.attributes.hp.max": { before: 14, after: 11 },
      "system.attributes.basic_speed.value": { before: 5.5, after: 5.5 }
    }
  };
  const items = [];
  items.get = () => undefined;
  items.has = () => false;
  const actor = { system: { attributes: {
    st: { value: 11 }, dx: { value: 10 }, ht: { value: 10 }, per: { value: 10 },
    hp: { max: 11 }, basic_speed: { value: 5.5 }
  }, applied_models: [record], points: { unspent: 0 } }, items,
  async update(data) {
    for (const [path, value] of Object.entries(data)) {
      const parts = path.split(".");
      let target = this;
      for (const part of parts.slice(0, -1)) target = target[part] ?? (target[part] = {});
      target[parts.at(-1)] = value;
    }
  } };
  const html = { find(selector) {
    if (selector === 'input[name="remove-item"]:checked') return { map: () => ({ get: () => [] }) };
    if (selector === 'input[name="remove-attribute"]:checked') return { map: () => ({ get: () => [0] }) };
    return { is: () => false };
  } };
  context.Dialog = class {
    constructor(config) { this.config = config; }
    render() { this.config.buttons.remove.callback(html); }
  };
  const removalSheet = new context.Sheet();
  removalSheet.actor = actor;
  removalSheet._getBasicDamageFromST = () => ({ thrust: "1d-2", swing: "1d" });
  await removalSheet._onRemoveCharacterModel({ preventDefault() {}, currentTarget: { dataset: { applicationId: "attrs" } } });
  assert.equal(actor.system.attributes.st.value, 10);
  assert.equal(actor.system.attributes.hp.max, 14);
  assert.equal(actor.system.applied_models[0].removedAt !== undefined, true);
});
