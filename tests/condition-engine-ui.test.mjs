import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("editor de condição expõe fase e persistência por efeito vinculado", async () => {
  const template = await readFile(new URL("../templates/items/condition-sheet.hbs", import.meta.url), "utf8");
  const sheet = await readFile(new URL("../scripts/apps/condition-sheet.js", import.meta.url), "utf8");
  const builder = await readFile(new URL("../scripts/apps/effect-builder.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles/item-sheet.css", import.meta.url), "utf8");
  assert.match(template, /system\.effects\.\{\{effect\.index\}\}\.phase/);
  assert.match(template, /system\.effects\.\{\{effect\.index\}\}\.uuid/);
  assert.match(template, /value="turnStart"/);
  assert.match(template, /system\.effects\.\{\{effect\.index\}\}\.removeOnConditionEnd/);
  assert.match(template, /condition-effect-link-settings/);
  assert.match(template, /condition-effect-link-controls/);
  assert.match(sheet, /removeOnConditionEnd:\s*link\.removeOnConditionEnd !== false/);
  assert.match(sheet, /width:\s*720/);
  assert.match(template, /condition-effect-dropzone/);
  assert.match(sheet, /Item\.fromDropData\(data\)/);
  assert.match(sheet, /effect\.type !== "effect"/);
  assert.match(sheet, /phase:\s*"always"/);
  assert.match(sheet, /removeOnConditionEnd:\s*true/);
  assert.match(sheet, /normalizeConditionEffectLinks\(this\.item\.system\.effects\)/);
  assert.match(sheet, /async _updateObject\(event, formData\)/);
  assert.match(builder, /normalizeConditionEffectLinks\(this\.parentItem\.system\.effects\)/);
  assert.match(builder, /existingUuids\.has\(effectItem\.uuid\)/);
  assert.match(styles, /condition-sheet \.effects-line\.effects-line-passive\s*\{[^}]*grid-template-columns:\s*minmax\(220px, 1\.05fr\) minmax\(310px, 1\.2fr\) 42px/s);
  assert.match(styles, /condition-effect-link-settings\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(styles, /condition-effect-link-settings\s*\{[^}]*grid-template-columns:\s*minmax\(200px, 280px\);[^}]*justify-items:\s*center;/s);
  assert.doesNotMatch(styles, /condition-effect-link-settings\s*\{[^}]*grid-row:\s*2;/s);
});

test("editor de barreira oferece resultados críticos exatos", async () => {
  const template = await readFile(new URL("../templates/items/effect-sheet.hbs", import.meta.url), "utf8");
  assert.match(template, /value="critical-failure"/);
  assert.match(template, /value="critical-success"/);
});

test("criação de recurso mantém as explicações em tooltips sem parágrafos que deformem os campos", async () => {
  const template = await readFile(new URL("../templates/items/effect-sheet.hbs", import.meta.url), "utf8");
  assert.match(template, /name="system\.actions\.\{\{action\.index\}\}\.value"[^>]*title="\{\{localize 'GUM\.EffectSheet\.EvaluatedOnCreate'\}\}"/);
  assert.match(template, /name="system\.actions\.\{\{action\.index\}\}\.max"[^>]*title="\{\{localize 'GUM\.EffectSheet\.SameInitialExpressionHint'\}\}"/);
  assert.doesNotMatch(template, /<p class="effect-premium-field-hint">\{\{localize "GUM\.EffectSheet\.(?:EvaluatedOnCreate|SameInitialExpressionHint)"\}\}<\/p>/);
});

test("motor captura alterações genéricas de recurso antes de processar condições", async () => {
  const main = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
  assert.match(main, /Hooks\.on\("preUpdateActor"[\s\S]*captureActorResourceChanges/);
  assert.match(main, /options\.gumResourceChangeEvents[\s\S]*processConditions\(actor, resourceEvent\)/);
  assert.match(main, /processConditions\(actor, options\.gumEventData \?\? null\)/);
  assert.match(main, /Hooks\.on\("preUpdateItem"[\s\S]*captureItemResourceChanges/);
});

test("motor encaminha eventos estruturados de rolagem, combate e ActiveEffect", async () => {
  const main = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");
  assert.match(main, /buildDefenseRollConditionEvent\(\{/);
  assert.match(main, /phase:\s*"turn_start"/);
  assert.match(main, /reason:\s*"turnStart"/);
  assert.match(main, /phase:\s*"turn_end"/);
  assert.match(main, /buildActiveEffectConditionEvent\(\{/);
  assert.match(main, /gumSkipConditionProcessing/);
});
