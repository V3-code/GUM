import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sheet = readFileSync(new URL("../module/item/template-item-sheet.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/items/template-item-sheet.hbs", import.meta.url), "utf8");
const actorSheet = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");

test("template blocks present identity, destinations, contextual settings, instructions, and contents in order", () => {
  const title = template.indexOf("template-block-title-field");
  const destinations = template.indexOf("template-block-destinations");
  const specific = template.indexOf("template-block-specific-fields");
  const instructions = template.indexOf("template-block-instructions-field");
  const entries = template.indexOf("template-entry-list");
  assert.ok(title >= 0 && title < destinations);
  assert.ok(destinations < specific);
  assert.ok(specific < instructions);
  assert.ok(instructions < entries);
  assert.match(template, /data-field="destinationGroup"[\s\S]+DestinationGroupHint/);
  assert.match(template, /data-field="containerName"[\s\S]+DestinationContainerHint/);
  assert.match(template, /data-field="instructions"/);
});

test("block creation exposes one selection kind and no longer persists a cosmetic target", () => {
  const prompt = sheet.slice(sheet.indexOf("_promptTemplateBlockConfiguration()"), sheet.indexOf("async _onToggleBlock"));
  assert.match(prompt, /value="selection"/);
  assert.doesNotMatch(prompt, /selection:items|selection:packages|selection:templates|selectionTarget/);
  assert.doesNotMatch(prompt, /template-block-title/);
  assert.match(sheet, /const block = \{\s*\.\.\.this\._createTemplateBlock\(config\.type\),\s*collapsed: false/);
  assert.match(sheet, /data-field="title"[\s\S]+?trigger\("focus"\)/);
});

test("creation and later configuration route through the same entry editor", () => {
  assert.match(sheet, /_onEditEntry[\s\S]+?_configureEntryDraft\(entry, \{ mode: "edit", block \}\)/);
  assert.match(sheet, /_buildTemplateDropEntry[\s\S]+?_configureEntryDraft\(entry, \{ mode: "create", sourceItem: item, block \}\)/);
  assert.match(sheet, /_editPackageLocalEntry[\s\S]+?_configureEntryDraft\(entry, \{ mode: "edit", block \}\)/);
  assert.match(sheet, /_configureEntryDraft[\s\S]+?draft\.kind === "attribute"[\s\S]+?draft\.kind === "group"[\s\S]+?draft\.kind === "template"/);
  assert.doesNotMatch(sheet, /_(?:promptEquipmentEntry|promptLevelledEntry|promptAdvantageEntry|editAttributeEntry|editItemEntry|editGroupEntry|editTemplateEntry)\s*\(/);
});

test("money blocks configure unit prices and structured payment rules", () => {
  assert.match(sheet, /MoneyUnitPriceHint/);
  assert.match(sheet, /entry\.moneyCost = Math\.max\(0/);
  assert.match(template, /data-field="paymentRules\.categories"/);
  assert.match(template, /data-field="paymentRules\.modes"/);
  assert.match(template, /data-field="paymentRules\.locations"/);
  assert.match(template, /configure-template-shared-budget-payment/);
});

test("entry configuration exposes availability, character requirements, and quantity limits", () => {
  assert.match(sheet, /template-entry-availability-fields/);
  assert.match(sheet, /data-requirement-field="condition"/);
  assert.match(sheet, /data-requirement-field="itemType"/);
  assert.match(sheet, /data-requirement-field="minimumLevel"/);
  assert.match(sheet, /entry\.minimumQuantity/);
  assert.match(sheet, /entry\.maximumQuantity/);
  assert.match(actorSheet, /_getTemplateEntryAvailability/);
  assert.match(actorSheet, /_templateEntryQuantity[\s\S]+?minimumQuantity[\s\S]+?maximumQuantity/);
});

test("plain block instructions are escaped and shown separately from the mechanical rule", () => {
  assert.match(actorSheet, /const blockInstructions = block \? String\(block\.instructions \|\| ""\)\.trim\(\) : ""/);
  assert.match(actorSheet, /esc\(blockInstructions\)\.replace/);
  assert.match(actorSheet, /template-flow-instructions/);
  assert.match(actorSheet, /template-flow-rule/);
});
