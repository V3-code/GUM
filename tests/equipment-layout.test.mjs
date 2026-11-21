import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../templates/actors/characters.hbs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");
const actorSheet = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");

test("character tabs follow the requested workflow", () => {
  const nav = template.slice(template.indexOf('<nav class="sheet-tabs tabs"'), template.indexOf("</nav>"));
  const order = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, [
    "combat", "skills", "characteristics", "social", "spells",
    "powers", "equipment", "biography", "conditions", "modifiers"
  ]);
  assert.match(styles, /\.container-section-header \{\s+gap: 20px;/);
  assert.match(styles, /\.gum\.sheet\.actor \.container-section-header \{[\s\S]*?border: none;/);
  assert.doesNotMatch(styles, /\.sheet-tabs \.item i \{ font-size:/);
});

test("equipment containers expose weight, capacity and drop zones", () => {
  assert.match(template, /\{\{localize "GUM\.Inventory\.Weight"\}\}: \{\{this\.container\.system\.total_weight\}\} kg/);
  assert.match(template, /container-capacity-meter/);
  assert.match(template, /aria-valuenow="\{\{this\.container\.system\.container_progress_value\}\}"/);
  assert.match(template, /aria-valuemax="\{\{this\.container\.system\.container_max_weight_value\}\}"/);
  assert.match(template, /aria-valuetext="\{\{this\.container\.system\.container_aria_value_text\}\}"/);
  assert.doesNotMatch(template, /aria-valuenow="\{\{this\.container\.system\.container_current_weight(?:_value)?\}\}"/);
  assert.equal((template.match(/\{\{#if \(gt this\.container\.system\.container_max_weight_value 0\)\}\}\r?\n\s*<div class="container-capacity-meter/g) || []).length, 3);
  assert.equal((template.match(/\{\{localize "GUM\.Inventory\.NoCapacityLimit"\}\}/g) || []).length, 3);
  assert.match(actorSheet, /s\.container_current_weight_value = currentWeight/);
  assert.match(actorSheet, /s\.container_max_weight_value = maxWeight/);
  assert.match(actorSheet, /s\.container_progress_value = maxWeight > 0 \? Math\.min\(currentWeight, maxWeight\) : 0/);
  assert.match(actorSheet, /acima da capacidade/);
  assert.match(template, /\{\{localize "GUM\.Inventory\.EmptyContainer"\}\}/);
  assert.match(template, /data-organizer-group-id="container:\{\{this\.container\._id\}\}"/);
  assert.match(template, /data-organizer-group-id="carried"/);
  assert.equal((template.match(/data-organizer-group-id="containers:(?:equipped|carried|stored)"/g) || []).length, 3);
});

test("equipment drag and drop stays silent after a successful move", () => {
  const organizer = actorSheet.slice(
    actorSheet.indexOf("this._equipmentOrganizerCleanup = attachSheetItemOrganizer"),
    actorSheet.indexOf("// Alternar Modo de Visualização de Perícias")
  );
  assert.match(organizer, /updateEmbeddedDocuments\('Item'/);
  assert.doesNotMatch(organizer, /ui\.notifications\.info/);
});

test("equipment browser filters regions, exposes counts and searches container contents", () => {
  for (const region of ["equipped", "carried", "stored"]) {
    assert.match(template, new RegExp(`data-equipment-filter="${region}"`));
    assert.match(template, new RegExp(`data-equipment-region="${region}"`));
  }
  assert.match(template, /data-equipment-filter="all"/);
  assert.match(template, /equipmentCounts\.all/);
  assert.match(template, /equipment-search-input/);
  assert.ok(template.indexOf('class="equipment-browser"') < template.indexOf('class="money-sources-panel'));
  assert.match(template, /equipmentView\.filter "all"/);
  assert.match(template, /unless equipmentView\.showEquipped/);
  assert.match(actorSheet, /this\._equipmentViewState \?\?= \{ filter: "all", query: "" \}/);
  assert.match(actorSheet, /context\.equipmentView = \{/);
  assert.match(actorSheet, /inventoryLocation = system\.stored === true \|\| system\.location === "stored"/);
  assert.match(actorSheet, /context\.showMoneySources =/);
  assert.match(actorSheet, /moneyPanel\.hidden = filter === "all" && !hasQuery \? false : visibleMoneySources === 0/);
  assert.match(template, /data-money-location="\{\{this\.system\.inventoryLocation\}\}"/);
  assert.match(template, /unless showMoneySources/);
  assert.match(actorSheet, /container-children-list/);
  assert.match(actorSheet, /classList\.toggle\("is-searching"/);
  assert.doesNotMatch(template, /unless this\.container\.system\.is_container_collapsed/);
  assert.doesNotMatch(actorSheet, /if \(hasQuery\) region\.open = true/);
  assert.match(styles, /data-search-active="true"\]:not\(\[open\]\) > \.list-content \{ display:block !important; \}/);
  assert.match(styles, /\.container-children-list\.is-collapsed\.is-searching \{ display:flex; \}/);
  assert.doesNotMatch(styles, /\.encumbrance-inline::after/);
});
