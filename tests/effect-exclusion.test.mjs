import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exclusionPeers, normalizeEffectExclusionGroups, replacedDirectEffectIds } from "../module/utils/effect-exclusion.mjs";

const config = readFileSync(new URL("../module/apps/effect-exclusion-config.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/apps/effect-exclusion-config.hbs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");

test("grupos são simétricos e recusam um efeito em dois grupos", () => {
  const groups = [{ id: "maneuvers", name: "Manobras", effectUuids: ["Item.A", "Item.B"] }];
  assert.deepEqual([...exclusionPeers(groups, "Item.A")], ["Item.B"]);
  assert.deepEqual([...exclusionPeers(groups, "Item.B")], ["Item.A"]);
  assert.throws(() => normalizeEffectExclusionGroups([...groups, { effectUuids: ["Item.B", "Item.C"] }]));
});

test("a limpeza só seleciona aplicações diretas dos outros membros", () => {
  const peers = new Set(["Item.B"]);
  const effect = (id, effectUuid, stackingDomain) => ({ id, flags: { gum: { effectUuid, stackingDomain } } });
  const effects = [effect("old", "Item.B", "direct"), effect("self", "Item.A", "direct"),
    effect("condition", "Item.B", "condition"), effect("managed", "Item.B", "managed"),
    { id: "foreign", flags: {} }];
  assert.deepEqual(replacedDirectEffectIds(effects, peers), ["old"]);
});

test("a configuração aceita UUID e arrastar/soltar com itens visuais", () => {
  assert.match(config, /TextEditor\.getDragEventData/);
  assert.match(config, /data-effect-uuid/);
  assert.match(config, /Este Item Efeito já pertence a outro grupo/);
  assert.match(template, /data-effect-dropzone/);
  assert.match(template, /effect-exclusion-item/);
  assert.match(styles, /\.effect-exclusion-dropzone\.is-dragover/);
  assert.match(styles, /\.effect-exclusion-items \{ display: grid/);
});

test("cada grupo pode ser recolhido sem remover seus itens", () => {
  assert.match(config, /data-toggle-group/);
  assert.match(config, /_setGroupCollapsed/);
  assert.match(template, /group\.collapsed/);
  assert.match(styles, /\.effect-exclusion-row\.is-collapsed/);
  assert.match(styles, /\.is-collapsed \.effect-exclusion-items \{ display: none/);
});
