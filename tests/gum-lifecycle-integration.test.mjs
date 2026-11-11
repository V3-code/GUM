import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the primary GUM flows publish their lifecycle hooks", async () => {
  const [main, effects, damageApplication, effectDamage, stateEffects] = await Promise.all([
    readFile(new URL("../scripts/main.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/effects-engine.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/apps/damage-application.js", import.meta.url), "utf8"),
    readFile(new URL("../module/services/effect-damage-roll-service.mjs", import.meta.url), "utf8"),
    readFile(new URL("../module/services/state-effect-service.js", import.meta.url), "utf8")
  ]);

  assert.match(main, /GUM_API_HOOKS\.ROLL_COMPLETED/);
  assert.match(main, /GUM_API_HOOKS\.DAMAGE_ROLLED/);
  assert.match(main, /GUM_API_HOOKS\.EFFECT_REMOVED/);
  assert.match(main, /GUM_API_HOOKS\.EFFECT_STATE_CHANGED/);
  assert.match(main, /GUM_API_HOOKS\.CONDITION_STATE_CHANGED/);
  assert.match(main, /GUM_API_HOOKS\.ITEM_USE_COMPLETED/);
  assert.match(effects, /GUM_API_HOOKS\.EFFECT_APPLIED/);
  assert.match(effects, /activeEffects: persistentEffects/);
  assert.match(effects, /activeEffectUuids: persistentEffects/);
  assert.match(effects, /isLifecycleCarrier = baseLifecycleCarrierIndex/);
  assert.match(damageApplication, /GUM_API_HOOKS\.DAMAGE_APPLIED/);
  assert.match(effectDamage, /GUM_API_HOOKS\.DAMAGE_ROLLED/);
  assert.match(stateEffects, /GUM_API_HOOKS\.STATE_EFFECT_GROUP_CHANGED/);
});

test("effect lifecycle hooks expose source, transition, and target anchors", async () => {
  const [main, effects] = await Promise.all([
    readFile(new URL("../scripts/main.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/effects-engine.js", import.meta.url), "utf8")
  ]);
  assert.match(effects, /source: context\.source \|\| context\.eventData\?\.source/);
  assert.match(effects, /eventData: context\.eventData \|\| null/);
  assert.match(main, /transition: "removed"/);
  assert.match(main, /transition: active \? "enabled" : "disabled"/);
  assert.match(main, /targetActor: actor/);
});

test("item use remains observable even without configured use-event effects", async () => {
  const main = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(sourceItem\) \{\s*try \{\s*await applyUseEventEffects\(sourceItem, actor, "activate"/s);
  assert.match(main, /const report = \{\s*trigger: normalizedTrigger,\s*effectCount: effectsList\.length,/s);
});

test("damage application reuses the authoritative application event id", async () => {
  const damageApplication = await readFile(new URL("../scripts/apps/damage-application.js", import.meta.url), "utf8");
  assert.match(damageApplication, /eventId: eventData\.eventId/);
  assert.match(damageApplication, /result:\s*\{\s*event: eventData,/s);
});
