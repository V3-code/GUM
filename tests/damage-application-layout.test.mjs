import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../templates/apps/damage-application.hbs", import.meta.url), "utf8");
const source = readFileSync(new URL("../scripts/apps/damage-application.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/damage-application.css", import.meta.url), "utf8");

test("damage nature is editable beside the wounding modifier", () => {
  const calculator = template.slice(template.indexOf('<div class="footer-column calculation-summary">'));

  assert.match(calculator, /damage-nature-group[\s\S]+data-field="wounding_mod"[\s\S]+name="damage_nature"/);
  assert.match(calculator, /name="damage_nature" class="calc-input-compact"/);
  assert.doesNotMatch(calculator, /name="damage_type"/);
  assert.match(source, /natureInput\.value = formatDamageNature\(newDamage\.nature\)/);
  assert.match(source, /this\._t\("InvalidNature"\)/);
});

test("wound registration is in the right body column without an existing-wound dropdown", () => {
  const rightBodyColumn = template.slice(
    template.indexOf('<div class="body-column situational-mods-panel">'),
    template.indexOf('</main>'),
  );
  const effectsColumn = template.slice(
    template.indexOf('<div class="footer-column effects-summary">'),
    template.indexOf('<div class="footer-column calculation-summary">'),
  );

  assert.match(rightBodyColumn, /wound-registration-options[\s\S]+name="register_wound"/);
  assert.doesNotMatch(effectsColumn, /register_wound|wound-registration-options/);
  assert.doesNotMatch(template, /name="existing_wound"|Criar novo card|Somar a:/);
  assert.doesNotMatch(source, /existingWounds|existing_wound|syncCompatibleWounds/);
  assert.match(source, /querySelector\("\.effects-list-summary"\)/);
  assert.doesNotMatch(source, /querySelector\("\.effects-summary"\)/);
});

test("selecting a combat meter uses its DR in the custom hit location", () => {
  assert.match(template, /data-pool-type="{{pool\.type}}" data-dr="{{pool\.dr}}"/);
  assert.match(source, /type: "combat-meter",[\s\S]+dr: Math\.max\(0, Number\(meter\.dr\) \|\| 0\)/);
  assert.match(source, /selectedPool\?\.dataset\.poolType !== "combat-meter"/);
  assert.match(source, /customDR\.value = String\(Math\.max\(0, Number\(selectedPool\.dataset\.dr\) \|\| 0\)\)/);
  assert.match(source, /location-row\[data-location-key="custom"\][\s\S]+customLocation\?\.click\(\)/);
});

test("follow-up and fragmentation remain independent selectable damage cards", () => {
  assert.match(template, /data-damage-key="followUp"/);
  assert.match(template, /data-damage-key="fragmentation"/);
  assert.doesNotMatch(template, /follow_up_manual_choice|damage-step-status|follow-up-rule/);
  assert.doesNotMatch(source, /resolveFollowUpProtection|primaryApplication|pendingLinkedFollowUp|appliedDamageKeys/);
  const itemTemplate = readFileSync(new URL("../templates/items/item-sheet.hbs", import.meta.url), "utf8");
  assert.doesNotMatch(itemTemplate, /follow_up_damage\.(?:link_mode|on_blocked)/);
  assert.match(source, /const effectiveDR = ignoreDR \? 0 : Math\.floor\(selectedLocationDR \/ armorDivisor\)/);
  assert.match(source, /if \(shouldClose\) this\.close\(\)/);
});

test("wounding modifier rows span the full panel so values align on the far right", () => {
  assert.match(styles, /\.damage-application-dialog \.wounding-row\s*\{\s*display: block;/);
  assert.match(styles, /\.damage-application-dialog \.wounding-row label\.custom-radio\s*\{[^}]+grid-template-columns: 16px minmax\(0, 1fr\) auto;/);
});

test("damage application translations cover both languages, including wounding names", () => {
  const english = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const portuguese = JSON.parse(readFileSync(new URL("../lang/pt-BR.json", import.meta.url), "utf8"));
  const referenced = new Set([...template.matchAll(/GUM\.DamageApplication\.[A-Za-z0-9.]+/g)].map(match => match[0]));
  for (const match of source.matchAll(/this\._[tf]\("([A-Za-z0-9.]+)"/g)) referenced.add(`GUM.DamageApplication.${match[1]}`);
  for (const abrev of ["qmd", "cor", "tox", "fat", "cont", "cort", "perf", "pi", "pi-", "pi+", "pi++"]) {
    referenced.add(`GUM.DamageApplication.Wounding.${abrev}`);
    referenced.add(`GUM.DamageApplication.WoundingAbbreviation.${abrev}`);
  }
  for (const key of referenced) {
    assert.ok(english[key], `missing English key ${key}`);
    assert.ok(portuguese[key], `missing Portuguese key ${key}`);
  }
});

test("visible damage abbreviations follow the active language without changing mechanical keys", () => {
  const english = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const portuguese = JSON.parse(readFileSync(new URL("../lang/pt-BR.json", import.meta.url), "utf8"));
  assert.deepEqual(
    ["cont", "cort", "perf", "qmd"].map(key => english[`GUM.DamageApplication.WoundingAbbreviation.${key}`]),
    ["cr", "cut", "imp", "burn"]
  );
  assert.deepEqual(
    ["cont", "cort", "perf", "qmd"].map(key => portuguese[`GUM.DamageApplication.WoundingAbbreviation.${key}`]),
    ["cont", "cort", "perf", "qmd"]
  );
  assert.match(template, /data-abrev="{{this\.abrev}}"[\s\S]+\({{this\.displayAbrev}}\)/);
  assert.match(source, /this\._woundingAbbreviation\(selectedRow\.dataset\.abrev\)/);
});
