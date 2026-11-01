import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sheet = readFileSync(new URL("../module/item/template-item-sheet.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/items/template-item-sheet.hbs", import.meta.url), "utf8");
const actorSheet = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/template-experience.css", import.meta.url), "utf8");

test("template blocks group basic data, application organization, specific data, and contents in order", () => {
  const basic = template.indexOf("GUM.Template.BasicData");
  const title = template.indexOf("template-block-title-field");
  const instructions = template.indexOf("template-block-instructions-field");
  const organization = template.indexOf("GUM.Template.ApplicationOrganization");
  const destinations = template.indexOf("template-block-destinations");
  const specificHeading = template.indexOf("GUM.Template.SpecificData");
  const specific = template.indexOf("template-block-specific-fields");
  const entries = template.indexOf("template-entry-list");
  assert.ok(basic >= 0 && basic < title);
  assert.ok(title < instructions);
  assert.ok(instructions < organization);
  assert.ok(organization < destinations);
  assert.ok(destinations < specificHeading);
  assert.ok(specificHeading < specific);
  assert.ok(specific < entries);
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

test("template drops use the namespaced TextEditor and a single native drop path", () => {
  assert.match(sheet, /const TextEditorImpl = foundry\?\.applications\?\.ux\?\.TextEditor/);
  assert.match(sheet, /const data = TextEditorImpl\.getDragEventData\(event\)/);
  assert.doesNotMatch(sheet, /const data = TextEditor\.getDragEventData\(event\)/);
  assert.doesNotMatch(sheet, /html\.on\("drop", "\.template-dropzone"/);
  assert.match(sheet, /dragDrop: \[\{ dragSelector: null, dropSelector: "\.template-dropzone" \}\]/);
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

test("equipment configuration follows the identity, quantity, value, behavior, destination, and rule sequence", () => {
  const editor = sheet.slice(sheet.indexOf("    _configureItemEntryDraft("), sheet.indexOf("    _createPackageAttributeEntry("));
  const fields = ["entry-name", "entry-qty", "entry-min-quantity", "entry-max-quantity", "entry-level",
    "entry-points-cost", "entry-money-cost", "entry-quantity-locked", "entry-selection-quantity",
    "template-entry-destination-section", "template-entry-rule-fields"];
  let previous = -1;
  for (const field of fields) {
    const current = editor.indexOf(field);
    assert.ok(current > previous, `${field} should follow the previous equipment field`);
    previous = current;
  }
  assert.match(editor, /isMoney \|\| isEquipment[\s\S]+?entry\.moneyCost/);
});

test("every entry editor uses consistent visual sections and responsive vertical space", () => {
  const rules = sheet.slice(sheet.indexOf("    _renderChoiceRuleFields("), sheet.indexOf("    _readChoiceRuleFields("));
  const referenced = sheet.slice(sheet.indexOf("    _configureTemplateEntryDraft("), sheet.indexOf("    _configureGroupEntryDraft("));
  const group = sheet.slice(sheet.indexOf("    _configureGroupEntryDraft("), sheet.indexOf("    _configureItemEntryDraft("));
  const item = sheet.slice(sheet.indexOf("    _configureItemEntryDraft("), sheet.indexOf("    _createPackageAttributeEntry("));
  const attribute = sheet.slice(sheet.indexOf("    _createPackageAttributeEntry("), sheet.indexOf("    async _editPackageLocalEntry("));
  assert.match(rules, /template-dialog-section-title[^\n]+AvailabilityAndRequirements/);
  assert.match(referenced, /template-dialog-section-title[^\n]+ModelData/);
  assert.match(group, /template-dialog-section-title[^\n]+PackageData/);
  assert.match(item, /template-dialog-section-title[^\n]+BasicData/);
  assert.match(item, /template-dialog-section-title[^\n]+QuantityAndValues/);
  assert.match(item, /EquipmentDestination[^\n]+ItemDestination/);
  assert.match(attribute, /template-dialog-section-title[^\n]+AttributeConfiguration/);
  for (const editor of [referenced, group, item, attribute]) {
    assert.match(editor, /height: Math\.min\(/);
    assert.match(editor, /resizable: true/);
  }
  assert.match(styles, /\.template-dialog-section-title \{/);
  assert.match(styles, /\.template-sectioned-dialog \{/);
});

test("subgroups start empty and follow basic data, blocks, then availability", () => {
  const addGroup = sheet.slice(sheet.indexOf("    async _onAddGroup("), sheet.indexOf("    _createTemplateBlock("));
  const group = sheet.slice(sheet.indexOf("    _configureGroupEntryDraft("), sheet.indexOf("    _configureItemEntryDraft("));
  const packageBlocks = sheet.slice(sheet.indexOf("    _renderPackageBlocks("), sheet.indexOf("    _activatePackageEditor("));
  assert.match(addGroup, /subBlocks: \[\]/);
  assert.doesNotMatch(group, /if \(!blocks\.length\)/);
  assert.match(group, /template-package-instructions[\s\S]+?<textarea id="group-notes"/);
  assert.ok(group.indexOf("PackageData") < group.indexOf("template-package-section-title"));
  assert.ok(group.indexOf("template-package-section-title") < group.indexOf("template-package-rule-fields"));
  assert.ok(packageBlocks.indexOf("BasicData") < packageBlocks.indexOf("BlockInstructions"));
  assert.ok(packageBlocks.indexOf("BlockInstructions") < packageBlocks.indexOf("ApplicationOrganization"));
  assert.ok(packageBlocks.indexOf("ApplicationOrganization") < packageBlocks.indexOf("SpecificData"));
  assert.match(styles, /\.template-block-field-section \{[^}]*linear-gradient[^}]*rgba\(170,58,52,\.52\)/);
  assert.match(styles, /\.template-package-block-section \{[^}]*linear-gradient[^}]*rgba\(170,58,52,\.52\)/);
  assert.match(styles, /\.template-package-instructions textarea \{[^}]*background: var\(--tpl-field\) !important[^}]*border: 1px solid transparent !important/);
});

test("the unavailability explanation is last and requirement delete buttons are visually borderless", () => {
  const rules = sheet.slice(sheet.indexOf("_renderChoiceRuleFields"), sheet.indexOf("_readChoiceRuleFields"));
  assert.ok(rules.indexOf("template-unavailable-reason") > rules.indexOf("template-structured-requirements"));
  assert.match(styles, /\.template-remove-requirement \{[^}]*background: transparent !important;[^}]*border: 0 !important;[^}]*box-shadow: none !important;/);
});

test("the structured requirement list replaces legacy fields while retaining migration support", () => {
  assert.doesNotMatch(sheet, /id="\$\{prefix\}-requires"|id="\$\{prefix\}-excludes"/);
  assert.match(sheet, /\["requiresNames", "require"\]/);
  assert.match(sheet, /\["excludesNames", "exclude"\]/);
  assert.match(sheet, /delete entry\.requiresNames/);
  assert.match(sheet, /\["group", "Package"\]/);
  assert.match(sheet, /\["template", "ReferencedModel"\]/);
  assert.match(sheet, /\["attribute", "Attributes"\]/);
});

test("plain block instructions are escaped and shown separately from the mechanical rule", () => {
  assert.match(actorSheet, /const blockInstructions = block \? String\(block\.instructions \|\| ""\)\.trim\(\) : ""/);
  assert.match(actorSheet, /esc\(blockInstructions\)\.replace/);
  assert.match(actorSheet, /template-flow-instructions/);
  assert.match(actorSheet, /template-flow-rule/);
});
