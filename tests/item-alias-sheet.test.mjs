import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const template = readFileSync(new URL("../templates/items/item-sheet.hbs", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../module/item/gurps-item-sheet.js", import.meta.url), "utf8");
const schema = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));

test("item aliases use an array in the shared item model", () => {
  assert.deepEqual(schema.Item.templates.base.aliases, []);
});

test("description tab exposes accessible editable alias chips", () => {
  assert.match(template, /data-tab="description"[\s\S]*?item-aliases-section/);
  assert.match(template, /<details class="item-aliases-section"/);
  assert.match(template, /class="item-aliases-summary"/);
  assert.match(template, /\{\{itemAliasCount\}\}/);
  assert.match(template, /class="item-alias-input"/);
  assert.match(template, /class="edit-item-alias"/);
  assert.match(template, /class="remove-item-alias"/);
  assert.match(sheet, /html\.on\("keydown", "\.item-alias-input"/);
  assert.match(sheet, /this\._aliasesExpanded = event\.currentTarget\.open/);
  assert.match(sheet, /context\.itemAliasCount = context\.itemAliases\.length/);
  assert.match(sheet, /"system\.aliases": normalizeItemAliases\(aliases\)/);
});
