import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rollPrompt = read("module/apps/roll-prompt.js");
const damagePrompt = read("module/apps/damage-roll-prompt.js");
const rollTemplate = read("templates/apps/roll-prompt.hbs");
const damageTemplate = read("templates/apps/damage-roll-prompt.hbs");
const main = read("scripts/main.js");
const actorSheet = read("module/actor/gurps-actor-sheet.js");
const gmScreen = read("module/apps/gm-screen.js");
const effectDamage = read("module/services/effect-damage-roll-service.mjs");

test("test and damage prompts initialize local privacy without changing the core setting", () => {
  for (const source of [rollPrompt, damagePrompt]) {
    assert.match(source, /getCurrentRollPrivacyMode\(\)/);
    assert.match(source, /this\.rollMode = normalizeRollPrivacyMode/);
    assert.match(source, /\.roll-privacy-btn/);
    assert.doesNotMatch(source, /game\.settings\.set\(\s*["']core["']/);
  }
  assert.match(rollPrompt, /rollMode: this\.rollMode/);
  assert.match(damagePrompt, /rollMode: this\.rollMode/);
});

test("both prompts expose the same accessible four-mode selector", () => {
  for (const template of [rollTemplate, damageTemplate]) {
    assert.match(template, /class="roll-privacy-selector"/);
    assert.match(template, /aria-label="\{\{localize 'GUM\.RollPrivacy\.Label'\}\}"/);
    assert.match(template, /aria-pressed=/);
    assert.match(template, /data-roll-mode="\{\{this\.mode\}\}"/);
  }
});

test("temporary privacy reaches every prompted test and damage chat path", () => {
  assert.match(main, /applyCurrentRollPrivacy\([\s\S]*?rollMode: extraOptions\.rollMode/);
  assert.match(main, /rolls\s*\n\s*\}, \{ rollMode: promptResult\.rollMode \}\)/);
  assert.match(actorSheet, /rollMode: promptResult\.rollMode/g);
  assert.match(gmScreen, /rollMode: promptResult\.rollMode/);
  assert.match(effectDamage, /promptedRollMode = result\.rollMode/);
  assert.match(effectDamage, /applyRollPrivacy\(chatData, promptedRollMode\)/);
});
