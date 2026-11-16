/** Canonical trait pricing. No Foundry dependency and no legacy calculation mode. */
const costDisplay = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 10, useGrouping: false });
const displayCost = value => costDisplay.format(Object.is(value, -0) ? 0 : value).replace(/^-/, '−');
const signedCost = (value, suffix = '') => `${value > 0 ? '+' : value < 0 ? '−' : ''}${displayCost(Math.abs(value))}${suffix}`;
function number(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Número de custo inválido: ${value}`);
  return result;
}

export function parseTraitAdjustment(raw = '0%') {
  const text = String(raw).trim().replace(',', '.').replace('×', 'x');
  const match = text.match(/^(x)?\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%)?$/i);
  if (!match) throw new Error(`Modificador de custo inválido: ${text}`);
  const value = Number(match[2]);
  if (match[1] && value < 0) throw new Error(`Multiplicador inválido: ${text}`);
  return { operation: match[1] ? 'multiply' : match[3] ? 'percent' : 'points',
    value: match[1] && match[3] ? value / 100 : value };
}

function leaves(modifiers, result = []) {
  for (const mod of Object.values(modifiers || {})) {
    if (mod.disabled) continue;
    if (Array.isArray(mod.children)) leaves(mod.children, result);
    else result.push(mod);
  }
  return result;
}

export function calculateTraitCost(system = {}) {
  let base = number(system.points);
  let perLevel = system.can_level ? number(system.points_per_level) : 0;
  const level = system.can_level ? number(system.level) : 0;
  if (level < 0) throw new Error('Nível de custo inválido');
  const configuredMultiplier = number(system.cost_multiplier, 1);
  let multiplier = configuredMultiplier;
  const scopes = { base: { enhancement: 0, limitation: 0 }, levels: { enhancement: 0, limitation: 0 } };
  const breakdown = [];
  for (const mod of leaves(system.modifiers)) {
    const parsed = parseTraitAdjustment(mod.cost);
    const affects = mod.affects || 'total';
    if (!['total', 'base_only', 'levels_only'].includes(affects)) throw new Error(`escopo de custo inválido: ${affects}`);
    const ownLevel = mod.use_level_from_trait ? (system.can_level ? level : 0) : number(mod.level);
    const scale = mod.cost_ignores_level || ownLevel <= 0 ? 1 : Math.max(1, ownLevel);
    const value = parsed.value * scale;
    breakdown.push({ name: mod.name || '', operation: parsed.operation, value, affects });
    if (parsed.operation === 'points') {
      if (affects === 'levels_only') { if (system.can_level) perLevel += value; }
      else base += value;
    } else if (parsed.operation === 'multiply') multiplier *= value;
    else {
      const key = value < 0 ? 'limitation' : 'enhancement';
      if (affects !== 'levels_only') scopes.base[key] += value;
      if (affects !== 'base_only') scopes.levels[key] += value;
    }
  }
  const factor = ({ enhancement, limitation }) => system.multiplicative_modifiers
    ? (1 + enhancement / 100) * (1 + Math.max(-80, limitation) / 100)
    : 1 + Math.max(-80, enhancement + limitation) / 100;
  const baseFactor = factor(scopes.base), levelFactor = factor(scopes.levels);
  const baseComponent = base * baseFactor;
  const levelsComponent = perLevel * level * levelFactor;
  const subtotal = baseComponent + levelsComponent;
  const raw = subtotal * multiplier;
  if (!Number.isFinite(raw)) throw new Error('Resultado de custo inválido');
  // Remove only floating-point noise at integer boundaries, not actual fractions.
  const nearest = Math.round(raw);
  const roundedInput = Math.abs(raw - nearest) <= Number.EPSILON * Math.max(1, Math.abs(raw)) * 8 ? nearest : raw;
  const finalPoints = system.round_down ? Math.floor(roundedInput) : Math.ceil(roundedInput);
  const composition = system.can_level
    ? `Composição: base ${displayCost(baseComponent)} · ${displayCost(level)} ${level === 1 ? 'nível' : 'níveis'} ${displayCost(levelsComponent)}`
    : `Composição: base ${displayCost(baseComponent)}`;
  const scope = (operation, affects) => operation === 'points' || affects === 'base_only' || !system.can_level ? 'base'
    : affects === 'levels_only' ? 'níveis' : 'base e níveis';
  const scopedAdjustments = new Map();
  const adjustments = [];
  for (const entry of breakdown) {
    if (entry.operation === 'multiply') {
      adjustments.push(`subtotal ×${displayCost(entry.value)}`);
      continue;
    }
    const target = scope(entry.operation, entry.affects);
    const values = scopedAdjustments.get(target) || [];
    values.push(signedCost(entry.value, entry.operation === 'percent' ? '%' : ' pts'));
    scopedAdjustments.set(target, values);
  }
  adjustments.unshift(...[...scopedAdjustments].map(([target, values]) => `${target} (${values.join(' · ')})`));
  if (configuredMultiplier !== 1) adjustments.push(`subtotal ×${displayCost(configuredMultiplier)}`);
  const adjustmentLine = adjustments.length ? `Ajustes: ${adjustments.join(' · ')}` : '';
  const roundingLine = roundedInput === finalPoints
    ? '' : `Arredondamento: ${displayCost(roundedInput)} → ${displayCost(finalPoints)}`;
  const description = [composition, adjustmentLine, roundingLine].filter(Boolean).join('\n');

  return { finalPoints, raw, breakdown, description };
}

export function calculateItemTraitCost(item) {
  const system = item?.system || {};
  const integral = calculateTraitCost(system);
  if (item?.type !== 'power') return integral;

  const acquisitionMode = system.cost_paid === 'alternative' ? 'alternative' : 'full';
  if (acquisitionMode === 'full') return {
    ...integral,
    integralPoints: integral.finalPoints,
    integralRaw: integral.raw,
    alternativePoints: null,
    alternativeMode: system.alternative_cost_mode === 'automatic' ? 'automatic' : 'manual',
    acquisitionMode,
    acquisitionDescription: `Aquisição integral: ${displayCost(integral.finalPoints)} pontos`
  };

  const alternativeMode = system.alternative_cost_mode === 'automatic' ? 'automatic' : 'manual';
  const divisor = number(system.alternative_cost_divisor, 5);
  if (alternativeMode === 'automatic' && divisor <= 0) throw new Error('Divisor do custo alternativo deve ser maior que zero');

  const alternativePoints = alternativeMode === 'automatic'
    ? (integral.finalPoints >= 0 ? Math.ceil(integral.finalPoints / divisor) : Math.floor(integral.finalPoints / divisor))
    : number(system.alternative_points);
  const finalPoints = alternativePoints;
  const acquisitionDescription = alternativeMode === 'automatic'
    ? `Aquisição alternativa: ${displayCost(integral.finalPoints)} ÷ ${displayCost(divisor)} = ${displayCost(alternativePoints)}`
    : `Aquisição alternativa: ${displayCost(alternativePoints)} pontos definidos manualmente`;

  return {
    ...integral,
    raw: finalPoints,
    finalPoints,
    integralPoints: integral.finalPoints,
    integralRaw: integral.raw,
    alternativePoints,
    alternativeMode,
    acquisitionMode,
    acquisitionDescription
  };
}

export function traitCostInput(system) {
  return Object.fromEntries(['points', 'points_per_level', 'level', 'can_level', 'round_down',
    'cost_multiplier', 'multiplicative_modifiers', 'modifiers'].map(key => [key, system[key]]));
}

export function importGCSModifier(mod) {
  const cost = mod.cost_adj ?? '0%';
  parseTraitAdjustment(cost);
  return { name: mod.name || 'Modificador', cost, level: number(mod.levels),
    affects: mod.affects || 'total', use_level_from_trait: Boolean(mod.use_level_from_trait),
    cost_ignores_level: Boolean(mod.cost_ignores_level), disabled: Boolean(mod.disabled),
    ref: mod.reference || '', description: mod.local_notes || mod.notes || '' };
}

export function importGCSTraitCost(trait, inherited = []) {
  const cr = { 0: 1, 6: 2, 7: 1.83, 8: 1.67, 9: 1.5, 10: 1.33, 11: 1.17, 12: 1, 13: .83, 14: .67, 15: .5 };
  if (!(number(trait.cr) in cr)) throw new Error(`Autocontrole não suportado: ${trait.cr}`);
  if (trait.frequency) throw new Error(`Frequência de custo não suportada: ${trait.frequency}`);
  const modifiers = Object.fromEntries(leaves([...inherited, ...(trait.modifiers || [])])
    .map((mod, index) => [`gcs${index}`, importGCSModifier(mod)]));
  return { points: number(trait.base_points), points_per_level: number(trait.points_per_level),
    can_level: Boolean(trait.can_level), level: number(trait.levels),
    round_down: Boolean(trait.round_down), multiplicative_modifiers: Boolean(trait._multiplicativeModifiers), cost_multiplier: cr[number(trait.cr)],
    modifiers };
}
