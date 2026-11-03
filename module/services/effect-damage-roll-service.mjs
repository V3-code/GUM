import { resolveAttackDamageDisplay } from "../utils/attack-damage-display.mjs";
import { formatDamageNature, resolveDamageNature } from "../utils/damage-nature.mjs";
import { normalizeGurpsDamageExpression } from "../utils/damage-normalization.js";
import { applyRollPrivacy } from "../utils/roll-privacy.mjs";
import { getEffectTestChatPrivacy, normalizeEffectTestChatVisibility } from "../utils/effect-chat-visibility.mjs";
import { resolveConditionalValue } from "../utils/effect-value-expression.mjs";

const COMPONENTS = Object.freeze([
  { key: "main", prefix: "damage", packageKey: "main", labelKey: "GUM.Damage.Roll.Standard" },
  { key: "followUp", prefix: "damage_follow_up", packageKey: "followUp", labelKey: "GUM.Damage.Roll.FollowUp" },
  { key: "fragmentation", prefix: "damage_fragmentation", packageKey: "fragmentation", labelKey: "GUM.Damage.Roll.Fragmentation" }
]);

const positiveDivisor = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const appendFormula = (base, addition) => {
  const formula = String(base ?? "").replace(/\s+/g, "").trim();
  const extra = String(addition ?? "").replace(/\s+/g, "").trim();
  if (!extra) return formula;
  return `${formula}${/^[+\-]/.test(extra) ? extra : `+${extra}`}`;
};

const normalizeOptionalDamageDice = formula => {
  const raw = String(formula ?? "").trim();
  if (!raw || !globalThis.game?.settings?.get?.("gum", "normalizeGurpsDamageDice")) return raw;
  return normalizeGurpsDamageExpression(raw)?.formula || raw;
};

const resolveFormula = (formula, actor) => {
  let resolved = String(formula ?? "").trim();
  if (!resolved) return "";
  resolved = String(resolveConditionalValue(resolved, { actor }) ?? "").trim();
  resolved = resolveAttackDamageDisplay(resolved, actor?.system?.attributes || {});
  return normalizeOptionalDamageDice(resolved);
};

const componentFromAction = (action, definition, actor) => {
  const prefix = definition.prefix;
  const natureRaw = String(action?.[`${prefix}_nature`] ?? "").trim();
  return {
    ...definition,
    formula: resolveFormula(action?.[`${prefix}_formula`], actor),
    type: String(action?.[`${prefix}_type`] ?? "").trim(),
    nature: natureRaw ? resolveDamageNature(natureRaw) : null,
    armorDivisor: positiveDivisor(action?.[`${prefix}_armor_divisor`])
  };
};

export function normalizeEffectDamageAction(action = {}) {
  const normalized = {
    damage_formula: String(action.damage_formula ?? "1d6").trim() || "1d6",
    damage_type: String(action.damage_type ?? "cont").trim(),
    damage_nature: String(action.damage_nature ?? "").trim(),
    damage_armor_divisor: positiveDivisor(action.damage_armor_divisor),
    damage_follow_up_formula: String(action.damage_follow_up_formula ?? "").trim(),
    damage_follow_up_type: String(action.damage_follow_up_type ?? "").trim(),
    damage_follow_up_nature: String(action.damage_follow_up_nature ?? "").trim(),
    damage_follow_up_armor_divisor: positiveDivisor(action.damage_follow_up_armor_divisor),
    damage_fragmentation_formula: String(action.damage_fragmentation_formula ?? "").trim(),
    damage_fragmentation_type: String(action.damage_fragmentation_type ?? "").trim(),
    damage_fragmentation_nature: String(action.damage_fragmentation_nature ?? "").trim(),
    damage_fragmentation_armor_divisor: positiveDivisor(action.damage_fragmentation_armor_divisor),
    damage_show_prompt: action.damage_show_prompt === true,
    roll_visibility: normalizeEffectTestChatVisibility(action.roll_visibility)
  };
  return normalized;
}

const targetTokenUuid = target => {
  const document = target?.document;
  const documentName = document?.documentName ?? document?.constructor?.documentName;
  if (documentName === "Token") return document.uuid ?? null;
  return target?.uuid?.startsWith?.("Scene.") ? target.uuid : null;
};

const escaped = value => {
  const escape = globalThis.foundry?.utils?.escapeHTML;
  return escape ? escape(String(value ?? "")) : String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
};

const diceHtml = roll => roll.dice
  .flatMap(die => die.results)
  .map(result => `<span class="die-damage">${escaped(result.result)}</span>`)
  .join("");

const formulaLabel = component => {
  const divisor = component.armorDivisor !== 1 ? `(${component.armorDivisor})` : "";
  const nature = component.nature ? ` [${formatDamageNature(component.nature)}]` : "";
  return `${component.formula}${divisor} ${component.type}${nature}`.trim();
};

async function promptForAdjustments(sourceName, components) {
  const { GurpsDamageRollPrompt } = await import("../apps/damage-roll-prompt.js");
  const byKey = Object.fromEntries(components.map(component => [component.key, component]));
  return GurpsDamageRollPrompt.prompt({
    sourceName,
    main: {
      formula: byKey.main.formula,
      displayFormula: byKey.main.formula,
      summaryFormula: components.map(formulaLabel).join(" • "),
      type: byKey.main.type,
      natureDisplay: byKey.main.nature ? formatDamageNature(byKey.main.nature) : "",
      armorDivisor: byKey.main.armorDivisor
    },
    followUp: byKey.followUp ? {
      formula: byKey.followUp.formula,
      displayFormula: byKey.followUp.formula,
      type: byKey.followUp.type,
      natureDisplay: byKey.followUp.nature ? formatDamageNature(byKey.followUp.nature) : "",
      armorDivisor: byKey.followUp.armorDivisor
    } : {},
    fragmentation: byKey.fragmentation ? {
      formula: byKey.fragmentation.formula,
      displayFormula: byKey.fragmentation.formula,
      type: byKey.fragmentation.type,
      natureDisplay: byKey.fragmentation.nature ? formatDamageNature(byKey.fragmentation.nature) : "",
      armorDivisor: byKey.fragmentation.armorDivisor
    } : {}
  });
}

const applyPromptResult = (components, result) => components.map(component => {
  const promptPrefix = component.key === "main" ? "main" : component.key;
  const promptedType = component.key === "main" ? component.type : result?.[`${promptPrefix}Type`];
  return {
    ...component,
    formula: normalizeOptionalDamageDice(appendFormula(component.formula, result?.[`${promptPrefix}Additional`])),
    type: promptedType || component.type,
    nature: result?.[`${promptPrefix}Nature`] || component.nature,
    armorDivisor: positiveDivisor(result?.[`${promptPrefix}ArmorDivisor`] ?? component.armorDivisor)
  };
});

export async function rollEffectDamageAction({ action = {}, effectItem, target } = {}) {
  const actor = target?.actor ?? null;
  const normalized = normalizeEffectDamageAction(action);
  const sourceName = String(action.label || effectItem?.name || "Rolagem de Dano").trim();
  let components = COMPONENTS.map(definition => componentFromAction(normalized, definition, actor))
    .filter(component => component.key === "main" || component.formula);
  if (!components[0]?.formula) throw new Error("A ação Rolar Dano precisa de uma fórmula de dano principal.");

  let promptedRollMode = null;
  if (normalized.damage_show_prompt) {
    const result = await promptForAdjustments(sourceName, components);
    if (!result) return null;
    promptedRollMode = result.rollMode;
    components = applyPromptResult(components, result);
  }

  const rolled = [];
  for (const component of components) {
    const roll = new Roll(component.formula, actor?.getRollData?.() || {});
    await roll.evaluate();
    rolled.push({ ...component, roll });
  }

  const main = rolled.find(component => component.key === "main");
  const damagePackage = {
    attackerId: null,
    attackerName: effectItem?.name || sourceName,
    sourceName,
    sourceItemId: effectItem?.id || null,
    sourceItemUuid: effectItem?.uuid || null,
    sourceAttackId: action.id || null,
    sourceAttackType: "effect-damage",
    targetActorUuid: actor?.uuid || null,
    targetTokenUuid: targetTokenUuid(target),
    main: {
      total: main.roll.total,
      type: main.type,
      nature: main.nature,
      armorDivisor: main.armorDivisor
    },
    onDamageEffects: {},
    generalConditions: {}
  };
  for (const component of rolled.filter(entry => entry.key !== "main")) {
    damagePackage[component.packageKey] = {
      total: component.roll.total,
      type: component.type,
      nature: component.nature,
      armorDivisor: component.armorDivisor
    };
  }

  const extraBlocks = rolled.filter(component => component.key !== "main").map(component => `
    <div class="extra-damage-block">
      <div class="extra-damage-label">${escaped(game.i18n.localize(component.labelKey))}</div>
      <div class="extra-damage-roll"><div class="extra-total">
        <span class="damage-value">${escaped(component.roll.total)}</span>
        <span class="damage-type">${escaped(component.type)}</span>
      </div></div>
    </div>`).join("");
  const encodedPackage = escaped(JSON.stringify(damagePackage));
  const targetLabel = actor?.name ? `<span class="formula-pill"><i class="fas fa-crosshairs" aria-hidden="true"></i> ${escaped(actor.name)}</span>` : "";
  const content = `
    <div class="gurps-damage-card gum-effect-damage-card">
      <header class="card-header"><h3>${escaped(sourceName)}</h3></header>
      <div class="card-formula-container"><span class="formula-pill">${escaped(rolled.map(formulaLabel).join(" • "))}</span>${targetLabel}</div>
      <div class="card-content"><div class="card-main-flex">
        <div class="roll-column"><span class="column-label">${escaped(game.i18n.localize("GUM.RollCard.Dice"))}</span><div class="individual-dice-damage">${diceHtml(main.roll) || '<span class="die-damage">–</span>'}</div></div>
        <div class="column-separator"></div>
        <div class="target-column"><span class="column-label">${escaped(game.i18n.localize("GUM.RollCard.TotalDamage"))}</span><div class="damage-total"><span class="damage-value">${escaped(main.roll.total)}</span><span class="damage-type">${escaped(main.type)}</span></div></div>
      </div></div>
      ${extraBlocks ? `<footer class="card-footer">${extraBlocks}</footer>` : ""}
      <footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${encodedPackage}'><i class="fas fa-crosshairs"></i> ${escaped(game.i18n.localize("GUM.RollCard.ApplyToTarget"))}</button></footer>
    </div>`;

  const privacy = getEffectTestChatPrivacy({ visibility: normalized.roll_visibility, actor, users: Array.from(game.users || []) });
  let chatData = {
    user: game.user.id,
    speaker: { alias: effectItem?.name || sourceName },
    content,
    rolls: rolled.map(component => component.roll),
    flags: { gum: { effectDamage: { effectUuid: effectItem?.uuid || null, actionId: action.id || null, targetActorUuid: actor?.uuid || null } } }
  };
  if (promptedRollMode) chatData = applyRollPrivacy(chatData, promptedRollMode);
  else {
    if (privacy.whisper.length) chatData.whisper = privacy.whisper;
    if (privacy.blind) chatData.blind = true;
  }
  await ChatMessage.create(chatData);
  return { damagePackage, rolls: rolled.map(component => component.roll) };
}
