import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildRollPurposePickerContent } from "../module/apps/roll-purpose-picker.mjs";
import { getGroupedRollPurposes, getPurposeLabels, searchRollPurposes } from "../module/utils/roll-purposes.mjs";
import { getGroupedRollTags } from "../module/utils/roll-tags.mjs";

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const en = readJson("../lang/en.json");
const pt = readJson("../lang/pt-BR.json");

const effectSources = [
  "../templates/items/effect-sheet.hbs",
  "../templates/apps/effect-browser.hbs",
  "../scripts/apps/effect-sheet.js",
  "../module/apps/context-picker.mjs",
  "../module/apps/roll-purpose-picker.mjs",
  "../module/apps/effect-path-picker.mjs",
  "../module/apps/effect-browser.js"
].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("todas as chaves estáticas do item Efeito existem em inglês e português", () => {
  const keys = new Set(effectSources.flatMap(source => [...source.matchAll(/GUM\.[A-Za-z0-9_.]+/g)].map(match => match[0])));
  const dynamicPrefixes = ["GUM.EffectSheet.Application.", "GUM.EffectSheet.Context.", "GUM.EffectSheet.Composition.", "GUM.EffectSheet.ActionType.", "GUM.EffectSheet.Resource.", "GUM.EffectSheet.ChatVisibility."];
  for (const key of keys) {
    if (dynamicPrefixes.includes(key)) continue;
    assert.ok(key in en, `chave ausente em en.json: ${key}`);
    assert.ok(key in pt, `chave ausente em pt-BR.json: ${key}`);
  }
});

test("catálogo e busca de finalidades respeitam o idioma ativo", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      localize: key => en[key] ?? key,
      format: (key, data = {}) => (en[key] ?? key).replace(/\{([^}]+)\}/g, (_match, name) => data[name] ?? "")
    }
  };
  try {
    assert.deepEqual(getPurposeLabels(["resist_poison"]), ["Poison Resistance"]);
    assert.equal(searchRollPurposes("poison")[0]?.id, "resist_poison");
    const groups = getGroupedRollPurposes("ht", ["resist_poison"]);
    assert.equal(groups.find(group => group.id === "resistances")?.label, "Physical Resistances");
    const html = buildRollPurposePickerContent({ selectedIds: ["resist_poison"], attributeKey: "ht", idPrefix: "i18n" });
    assert.match(html, /Test context/);
    assert.match(html, /Poison Resistance/);
    assert.doesNotMatch(html, /Contexto do teste|Resistência a Veneno/);
    const tags = getGroupedRollTags(["resistance.poison"]);
    assert.equal(tags.find(group => group.id === "physical_resistance")?.label, "Physical Resistances");
    assert.equal(tags.flatMap(group => group.tags).find(tag => tag.id === "resistance.poison")?.label, "Poison");
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});
