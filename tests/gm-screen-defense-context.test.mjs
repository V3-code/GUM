import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolveDefenseRollType } from "../module/utils/defense-roll-type.mjs";

const gmScreen = fs.readFileSync(new URL("../module/apps/gm-screen.js", import.meta.url), "utf8");

test("normalizes explicit and legacy localized defense labels", () => {
  assert.equal(resolveDefenseRollType("parry", "anything"), "parry");
  assert.equal(resolveDefenseRollType("", "Aparar"), "parry");
  assert.equal(resolveDefenseRollType(null, "Bloqueio"), "block");
  assert.equal(resolveDefenseRollType(undefined, "Esquiva"), "dodge");
  assert.equal(resolveDefenseRollType(null, "Defense"), null);
});

test("GM Screen forwards explicit defense and attack types to prompt and quick rolls", () => {
  assert.match(gmScreen, /data-defense-type="dodge"/);
  assert.match(gmScreen, /data-defense-type="parry"/);
  assert.match(gmScreen, /data-defense-type="block"/);
  assert.match(gmScreen, /defenseType:\s*el\.data\('defenseType'\)/);
  assert.match(gmScreen, /attackType:\s*el\.data\('attackType'\)/);
  assert.match(gmScreen, /const defenseType = rollType === 'defense'[\s\S]*?resolveDefenseRollType/);
  assert.match(gmScreen, /promptRollData = \{[\s\S]*?defenseType,[\s\S]*?defenseBonusIncluded/);
  assert.match(gmScreen, /const preparedRollData = await prepareAmmunitionRollData\(actor, promptRollData\)/);
  assert.match(gmScreen, /performGURPSRoll\(actor, \{ \.\.\.preparedRollData/);
});
