import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEffectPathSelection, buildAttributeEffectPathOptions, buildDamageResistanceEffectPath, findEffectPathOption } from "../module/apps/effect-path-picker.mjs";

test("oferece somente camadas de atributo processadas pelo motor", () => {
  const options = buildAttributeEffectPathOptions().flatMap(group => group.options);
  assert.ok(options.some(option => option.path === "system.attributes.dx.passive" && option.operation === "ADD"));
   assert.ok(options.some(option => option.path === "system.attributes.dodge.override" && option.operation === "OVERRIDE"));
  assert.ok(options.some(option => option.path === "system.attributes.thrust_damage.passive" && option.operation === "ADD"));
  assert.ok(options.some(option => option.path === "system.attributes.swing_damage_alt.override" && option.operation === "OVERRIDE"));
  assert.ok(options.every(option => /\.(passive|temp|override)$/.test(option.path)));
  assert.equal(findEffectPathOption("system.attributes.touch.temp")?.label, "Tato — Bônus temporário");
  assert.equal(findEffectPathOption("system.attributes.dx.final"), null);
});

test("gera caminhos de RD conforme duração e operação", () => {
  assert.equal(buildDamageResistanceEffectPath({ location: "torso", damageType: "base" }), "system.combat.dr_passive_mods.torso.base");
  assert.equal(buildDamageResistanceEffectPath({ location: "head", damageType: "cort", durationMode: "combat" }), "system.combat.dr_temp_mods.head.cort");
  assert.equal(buildDamageResistanceEffectPath({ location: "arm_l", damageType: "qmd", operation: "OVERRIDE" }), "system.combat.dr_overrides.arm_l.qmd");
});

test("aplica caminho e operação notificando o formulário", () => {
  const events = [];
  class FakeEvent { constructor(type, init) { this.type = type; this.bubbles = init.bubbles; } }
  const pathInput = { value: "", ownerDocument: { defaultView: { Event: FakeEvent } }, dispatchEvent: event => events.push(`path:${event.type}`) };
  const operationInput = { value: "ADD", dispatchEvent: event => events.push(`operation:${event.type}`) };
  applyEffectPathSelection({ pathInput, operationInput, path: "system.attributes.st.override", operation: "OVERRIDE" });
  assert.equal(pathInput.value, "system.attributes.st.override");
  assert.equal(operationInput.value, "OVERRIDE");
  assert.deepEqual(events, ["path:input", "path:change", "operation:change"]);
});

test("o diálogo força dropdown escuro e usa altura ajustada ao conteúdo", () => {
  const css = readFileSync(new URL("../styles/item-sheet.css", import.meta.url), "utf8");
  assert.match(css, /\.gum-effect-path-picker-window \{[^}]*height: auto !important;/);
  assert.match(css, /\.effect-path-dr-grid select \{[^}]*color-scheme: dark;/);
  assert.match(css, /\.effect-path-dr-grid select option \{[^}]*color: #f4f1ea;[^}]*background-color: #17191f;/);
});