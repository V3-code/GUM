import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("roll modifier browser selects the configured-source record without id collisions", async () => {
  let selected;
  const context = vm.createContext({
    FormApplication: class {},
    ui: { notifications: { warn() {} } }
  });
  const source = fs.readFileSync("module/apps/gm-modifier-browser.js", "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export class ", "class ");
  vm.runInContext(`${source}\nthis.Browser = GMModifierBrowser;`, context);
  const browser = new context.Browser({ onSelect: value => { selected = value; } });
  browser.allModifiers = [
    { id: "same-id", selectionKey: "rollModifierSelection-0", uuid: "Compendium.gum.gm_modifiers.Item.same-id" },
    { id: "same-id", selectionKey: "rollModifierSelection-1", uuid: "Compendium.world.roll-modifiers.Item.same-id" }
  ];

  await browser._updateObject(null, { "rollModifierSelection-1": true });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].uuid, "Compendium.world.roll-modifiers.Item.same-id");
});

test("roll prompt and actor import consume the centralized roll modifier purpose", () => {
  const prompt = fs.readFileSync("module/apps/roll-prompt.js", "utf8");
  const actorSheet = fs.readFileSync("module/actor/gurps-actor-sheet.js", "utf8");
  assert.match(prompt, /contentSourceService\.getDocuments\("rollModifiers"\)/);
  assert.match(actorSheet, /contentSourceService\.getDocuments\("rollModifiers"\)/);
  assert.doesNotMatch(prompt, /game\.packs\.get\("gum\.gm_modifiers"\)/);
  assert.doesNotMatch(actorSheet, /game\.packs\.get\("gum\.gm_modifiers"\)/);
  assert.match(actorSheet, /setFlag\("gum", "useDefaultModifiers", checked\)/);
  assert.match(prompt, /getFlag\("gum", "useDefaultModifiers"\)/);
  assert.match(prompt, /if \(useDefaults\)[\s\S]*?getDocuments\("rollModifiers"\)/);
});
