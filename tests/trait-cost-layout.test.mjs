import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('../templates/items/item-sheet.hbs', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/item-sheet.css', import.meta.url), 'utf8');
const sheetScript = readFileSync(new URL('../module/item/gurps-item-sheet.js', import.meta.url), 'utf8');

test('advantage and disadvantage cost controls share one dashboard section', () => {
  const start = template.indexOf('data-trait-cost-editor');
  const end = template.indexOf('Mecânica e Contexto', start);
  assert.ok(start >= 0 && end > start);
  const block = template.slice(start, end);

  for (const field of [
    'system.can_level',
    'system.round_down',
    'system.multiplicative_modifiers',
    'system.points',
    'system.points_per_level',
    'system.level',
    'system.cost_multiplier'
  ]) assert.match(block, new RegExp(field.replace('.', '\\.')));

  assert.match(block, /Custo Final/);
  assert.doesNotMatch(template, /Nível e Pontos/);
});

test('power composition and acquisition share one cost workspace', () => {
  const start = template.indexOf('data-power-cost-editor');
  const end = template.indexOf('GUM.SpellPower.Execution', start);
  assert.ok(start >= 0 && end > start);
  const block = template.slice(start, end);
  for (const field of [
    'system.points', 'system.can_level', 'system.level', 'system.points_per_level',
    'system.cost_multiplier', 'system.round_down', 'system.multiplicative_modifiers',
    'system.cost_paid', 'system.alternative_cost_mode', 'system.alternative_cost_divisor',
    'system.alternative_points'
  ]) assert.match(block, new RegExp(field.replace('.', '\\.')));
  assert.match(block, /calculatedCost\.integralPoints/);
  assert.match(block, /calculatedCost\.finalPoints/);
  assert.doesNotMatch(template, /GUM\.SpellPower\.CostCalculation/);
});

test('modifier pricing fields and options use the dedicated dashboard', () => {
  const start = template.indexOf('data-modifier-cost-editor');
  const end = template.indexOf('Referência e Contexto', start);
  assert.ok(start >= 0 && end > start);
  const block = template.slice(start, end);

  assert.match(block, /Cálculo do Modificador/);
  assert.match(block, /modifier-cost-input/);
  assert.match(block, /modifier-affects-select/);
  assert.match(block, /modifier-level-input/);
  assert.match(block, /modifier-use-trait-level/);
  assert.match(block, /modifier-ignore-level/);
  assert.match(template, /Referência e Contexto/);
});

test('cost-dependent inputs have render-time visual state handlers', () => {
  assert.match(sheetScript, /updateTraitCostLevelState/);
  assert.match(sheetScript, /trait-cost-level-dependent/);
  assert.match(sheetScript, /updateModifierCostState/);
  assert.match(sheetScript, /\^\(\?:x\|×\)/);
  assert.match(sheetScript, /disableOwnLevel = ignoresLevel \|\| useTraitLevel/);
});

test('cost workspaces provide responsive grids and a distinct result card', () => {
  assert.match(styles, /\.characteristic-cost-grid/);
  assert.match(styles, /\.characteristic-cost-result-card/);
  assert.match(styles, /\.modifier-cost-core-grid/);
  assert.match(styles, /\.modifier-cost-options/);
  assert.match(styles, /\.is-cost-disabled/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /\.characteristic-cost-result small[\s\S]*?white-space: pre-line/);
  assert.match(styles, /\.power-alternative-fields \{[\s\S]*?grid-template-columns: minmax\(180px, 1\.35fr\) minmax\(105px, 0\.55fr\) minmax\(135px, 0\.8fr\)/);
  assert.match(styles, /\.power-alternative-fields > \.skill-dashboard-card \{[\s\S]*?min-height: 68px/);
});

test('the favorite and organization row stays compact and gives organization more room', () => {
  assert.match(template, /class="characteristic-top-grid"[\s\S]*?characteristic-favorite-card[\s\S]*?characteristic-organization-card/);
  assert.match(styles, /characteristic-top-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(150px, 0\.55fr\) minmax\(260px, 1fr\)/);
  assert.match(styles, /characteristic-top-grid[\s\S]*?> \.characteristic-favorite-card,[\s\S]*?> \.characteristic-organization-card\s*\{[\s\S]*?min-height:\s*64px/);
});
