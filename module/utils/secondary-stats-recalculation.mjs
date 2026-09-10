import { addBasicDamageModifier } from "./basic-damage.mjs";

const hasOverride = attribute => attribute?.override !== null && attribute?.override !== undefined;
const number = value => Number(value) || 0;

export const formatBasicDamageDiceCount = diceCount => `${Math.max(0, Math.floor(Number(diceCount) || 0))}d6`;

/** Uses the same prepared value displayed by the sheet, with safe fallbacks for unprepared test/data contexts. */
export function getPreparedPrimaryAttributeValue(attribute) {
  for (const candidate of [attribute?.final, attribute?.final_computed, attribute?.value]) {
    if (candidate !== null && candidate !== undefined && candidate !== "" && Number.isFinite(Number(candidate))) {
      return Number(candidate);
    }
  }
  return 0;
}

function primaryReason(label, attribute, preparedValue) {
  const base = number(attribute?.value);
  const difference = preparedValue - base;
  if (Math.abs(difference) < 1e-9) return `${label} final ${preparedValue}`;
  const sign = difference >= 0 ? "+" : "";
  return `${label} final ${preparedValue} (base ${base}, adicionais ${sign}${difference})`;
}

export function secondaryStatValuesEqual(left, right, precision = null) {
  if (typeof left === "number" && typeof right === "number") {
    const tolerance = precision === null ? 1e-9 : (0.5 * (10 ** -precision));
    return Math.abs(left - right) < tolerance;
  }
  return String(left ?? "") === String(right ?? "");
}

function estimatedFinal(attribute, proposedBase, { pool = false } = {}) {
  if (!attribute || hasOverride(attribute)) return attribute?.final;
  return number(proposedBase) + number(attribute.mod) + number(attribute.passive) + number(attribute.temp);
}

/** Builds a side-effect-free snapshot of every value handled by the sidebar recalculate action. */
export function buildSecondaryStatsRecalculationPlan(system, getBasicDamageFromST, { considerBasicSpeedFixedModifier = false } = {}) {
  const attrs = system?.attributes || {};
  const st = getPreparedPrimaryAttributeValue(attrs.st);
  const dx = getPreparedPrimaryAttributeValue(attrs.dx);
  const ht = getPreparedPrimaryAttributeValue(attrs.ht);
  const per = getPreparedPrimaryAttributeValue(attrs.per);
  const sourceReasons = {
    st: primaryReason("ST", attrs.st, st),
    dx: primaryReason("DX", attrs.dx, dx),
    ht: primaryReason("HT", attrs.ht, ht),
    per: primaryReason("Per", attrs.per, per)
  };
  const speed = Math.round((((dx + ht) / 4) + Number.EPSILON) * 100) / 100;
  const derivedSpeed = speed + (considerBasicSpeedFixedModifier ? number(attrs.basic_speed?.mod) : 0);
  const speedFinal = estimatedFinal(attrs.basic_speed, speed);
  const damage = getBasicDamageFromST(st);

  const definitions = [
    ["hp-max", "resources", "PV Máximo", "system.attributes.hp.max", attrs.hp?.max, st, `Calculado a partir de ${sourceReasons.st}`, ["st"], { pool: true }],
    ["fp-max", "resources", "PF Máximo", "system.attributes.fp.max", attrs.fp?.max, ht, `Calculado a partir de ${sourceReasons.ht}`, ["ht"], { pool: true }],
    ["lifting-st", "physical", "ST de Levantamento", "system.attributes.lifting_st.value", attrs.lifting_st?.value, st, `Calculada a partir de ${sourceReasons.st}`, ["st"]],
    ["basic-speed", "movement", "Velocidade Básica", "system.attributes.basic_speed.value", attrs.basic_speed?.value, speed, `Calculada a partir de ${sourceReasons.dx} e ${sourceReasons.ht}`, ["dx", "ht"], { precision: 2 }],
    ["basic-move", "movement", "Deslocamento Básico", "system.attributes.basic_move.value", attrs.basic_move?.value, Math.floor(derivedSpeed), considerBasicSpeedFixedModifier ? "Calculado a partir da Velocidade Básica com seu modificador fixo" : "Calculado a partir da nova Velocidade Básica", ["basic-speed"]],
    ["dodge", "movement", "Esquiva-base", "system.attributes.dodge.value", attrs.dodge?.value, Math.floor(derivedSpeed) + 3, considerBasicSpeedFixedModifier ? "Calculada pela Velocidade Básica com seu modificador fixo" : "Calculada pela mesma Velocidade Básica proposta", ["basic-speed"], { dodge: true }],
    ["vision", "senses", "Visão", "system.attributes.vision.value", attrs.vision?.value, per, `Calculada a partir de ${sourceReasons.per}`, ["per"]],
    ["hearing", "senses", "Audição", "system.attributes.hearing.value", attrs.hearing?.value, per, `Calculada a partir de ${sourceReasons.per}`, ["per"]],
    ["tastesmell", "senses", "Paladar/Olfato", "system.attributes.tastesmell.value", attrs.tastesmell?.value, per, `Calculado a partir de ${sourceReasons.per}`, ["per"]],
    ["touch", "senses", "Tato", "system.attributes.touch.value", attrs.touch?.value, per, `Calculado a partir de ${sourceReasons.per}`, ["per"]],
    ["thrust-damage", "damage", "Golpe de Ponta", "system.attributes.thrust_damage.value", attrs.thrust_damage?.value ?? attrs.thrust_damage, damage.thrust, `Calculado pela tabela de dano para ${sourceReasons.st}`, ["st"], { damage: true }],
    ["swing-damage", "damage", "Golpe em Balanço", "system.attributes.swing_damage.value", attrs.swing_damage?.value ?? attrs.swing_damage, damage.swing, `Calculado pela tabela de dano para ${sourceReasons.st}`, ["st"], { damage: true }]
  ];

  return definitions.map(([id, group, label, path, currentValue, proposedValue, reason, dependencies, options = {}]) => {
    const attributeKey = path.match(/^system\.attributes\.([^.]+)/)?.[1];
    const attribute = attrs[attributeKey];
    const protectedByOverride = hasOverride(attribute);
    const removeImportedFixed = options.dodge && attrs.dodge?.gcs_imported_fixed !== null
      && attrs.dodge?.gcs_imported_fixed !== undefined && attrs.dodge?.gcs_imported_fixed !== "";
    const changed = !protectedByOverride && (!secondaryStatValuesEqual(currentValue, proposedValue, options.precision) || removeImportedFixed);
    let proposedFinal = estimatedFinal(attribute, proposedValue, { pool: options.pool });
    if (options.damage) proposedFinal = hasOverride(attribute) ? attribute.final : addBasicDamageModifier(proposedValue, number(attribute?.mod) + number(attribute?.passive) + number(attribute?.temp));
    if (options.dodge) proposedFinal = Math.floor(number(speedFinal)) + 3 + number(attribute?.mod) + number(attribute?.passive) + number(attribute?.temp);
    const currentFinal = attribute?.final ?? attribute?.final_computed;
    const warnings = [];
    if (options.pool && proposedValue < number(attribute?.value)) warnings.push("O novo máximo é inferior ao valor atual; o valor atual será preservado.");
    if (removeImportedFixed && !protectedByOverride) warnings.push("A seleção também removerá o valor fixo importado da Esquiva.");
    return {
      id, group, label, path, currentValue, proposedValue, currentFinal, proposedFinal,
      changed, visible: changed || protectedByOverride, selectedByDefault: changed, protectedByOverride, removeImportedFixed,
      reason: protectedByOverride ? "Protegido por override" : reason, dependencies, warnings,
      modifierTotal: attribute ? number(attribute.mod) + number(attribute.passive) + number(attribute.temp) : null
    };
  });
}

export function buildSecondaryStatsUpdateData(plan, selectedIds) {
  const selected = new Set(selectedIds || []);
  const updateData = {};
  for (const entry of plan || []) {
    if (!selected.has(entry.id) || !entry.changed || entry.protectedByOverride) continue;
    updateData[entry.path] = entry.proposedValue;
    if (entry.id === "dodge" && entry.removeImportedFixed) {
      updateData["system.attributes.dodge.-=gcs_imported_fixed"] = null;
    }
  }
  return updateData;
}