import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../templates/actors/characters.hbs", import.meta.url), "utf8");
const actorSheet = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");

function templateSection(start, end) {
  return template.slice(template.indexOf(start), template.indexOf(end, template.indexOf(start)));
}

test("spell and power support records share a compact two-column grid", () => {
  const spellSection = templateSection('{{#if spellSupportCount}}', "{{!-- LISTA DE MAGIAS");
  const powerSection = templateSection('{{#if powerSupportCount}}', "{{!-- LISTA DE PODERES");

  assert.match(spellSection, /support-card-grid--spell/);
  assert.match(spellSection, /{{#each castingAbilities}}[\s\S]+{{#each spellReserves}}/);
  assert.match(powerSection, /support-card-grid--power/);
  assert.match(powerSection, /{{#each powerSources}}[\s\S]+{{#each powerReserves}}/);

  for (const section of [spellSection, powerSection]) {
    assert.match(section, /support-link-card/);
    assert.match(section, /support-reserve-card support-card--category-start/);
    assert.match(section, /adjust-energy-reserve energy-reserve-adjust[^>]+data-adjustment="-1"/);
    assert.match(section, /adjust-energy-reserve energy-reserve-adjust[^>]+data-adjustment="1"/);
     
    assert.match(section, /edit-energy-reserve gum-action-menu__item/);
    assert.match(section, /delete-energy-reserve gum-action-menu__item is-danger/);
    assert.doesNotMatch(section, /<details/);
  }

  assert.match(styles, /\.support-card-grid \{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.support-reserve-card\.is-first-reserve \{ grid-column:1;/);
  assert.match(styles, /\.support-card-grid\.is-compact-pair \.support-reserve-card\.is-first-reserve \{ grid-column:auto;/);
});

test("the Add menus expose primary item, link, and reserve actions", () => {
  const spellToolbar = templateSection('class="spell-search-input"', '{{#if spellSupportCount}}');
  const powerToolbar = templateSection('class="power-search-input"', '{{#if powerSupportCount}}');

  assert.match(spellToolbar, /create-primary-item" data-type="spell"/);
  assert.match(spellToolbar, /add-casting-ability/);
  assert.match(spellToolbar, /add-energy-reserve" data-reserve-type="spell"/);
  assert.match(powerToolbar, /create-primary-item" data-type="power"/);
  assert.match(powerToolbar, /add-power-source/);
  assert.match(powerToolbar, /add-energy-reserve" data-reserve-type="power"/);

  assert.match(actorSheet, /click", "\.create-primary-item", \(ev\) => this\._onCreatePrimaryItem\(ev\)/);
  assert.match(actorSheet, /createEmbeddedDocuments\("Item", \[\{ name, type \}\]\)/);
});

test("support compact-pair state is enabled only for one link and one reserve", () => {
  assert.match(actorSheet, /spellSupportCompactPair = context\.castingAbilities\.length === 1 && context\.spellReserveCount === 1/);
  assert.match(actorSheet, /powerSupportCompactPair = context\.powerSources\.length === 1 && context\.powerReserveCount === 1/);
});

test("reserve buttons update current and legacy value within zero and maximum", () => {
  const listenerSection = actorSheet.slice(actorSheet.indexOf("RESERVAS DE ENERGIA"), actorSheet.indexOf("HABILIDADES DE CONJURAÇÃO"));
  const adjustHandler = actorSheet.slice(actorSheet.indexOf("async _onAdjustEnergyReserve"), actorSheet.indexOf("async _promptEnergyReserveData"));

  assert.match(listenerSection, /click", "\.adjust-energy-reserve"/);
  assert.match(adjustHandler, /reserve\.current \?\? reserve\.value \?\? 0/);
  assert.match(adjustHandler, /Math\.max\(0, Math\.min\(max, current \+ adjustment\)\)/);
  assert.match(adjustHandler, /`\$\{pathBase\}\.current`/);
  assert.match(adjustHandler, /`\$\{pathBase\}\.value`/);
});