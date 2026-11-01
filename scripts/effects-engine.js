import { normalizeChatRoll } from "../module/utils/roll-request-data.mjs";
import { recipientUserIdsForActor } from "../module/utils/test-request-targets.mjs";
import { findConfiguredStatus } from "../module/utils/status-catalog.mjs";
import {
    equipmentIntegrityCurrentUpdate,
    equipmentIntegrityRecord,
    equipmentLinkedReserve,
    equipmentReserveBalanceUpdate
} from "../module/utils/equipment-resolution.mjs";
import {
    isActorContextAvailable,
    isMissingSyntheticActorContextError
} from "../module/utils/condition-actor-context.mjs";
import {
    getEffectTestChatPrivacy,
    getAttributeRollMessageOptions,
    normalizeAttributeChatVisibility,
    normalizeEffectTestChatVisibility
} from "../module/utils/effect-chat-visibility.mjs";
import { normalizeRequestedAttributeKey } from "../module/utils/requested-attributes.mjs";
import {
    collectConditionOwners,
    INSTANT_EFFECT_ACTION_TYPES,
    matchesStackedEffect,
    normalizeEffectStackingMode,
    PERSISTENT_EFFECT_ACTION_TYPES,
    resolveEffectStackingDomain
} from "../module/utils/effect-stacking.mjs";
import { isEffectItemBridgeApplicationActive } from "../module/integrations/active-effect-bridge.mjs";
import { normalizeRollModifierCompositionMode } from "../module/utils/roll-modifier-composition.mjs";
import { normalizeEffectDamageAction, rollEffectDamageAction } from "../module/services/effect-damage-roll-service.mjs";

/**
 * O "Motor de Efeitos" central do sistema. (Versão 5.0 - Rollback Controlado)
 * Lida com tipos de efeitos separados:
 * - 'attribute'/'flag'/'roll_modifier': Cria ActiveEffects para mecânica e duração.
 * - 'status': Usa toggleStatusEffect para controlar ícones no token.
 * - 'resource_change', 'damage_roll', 'macro', 'chat': Executam ações pontuais.
 */

import {
    normalizeEffectValueMode,
    resolveEffectValueMetadata
} from "../module/utils/effect-value-scaling.mjs";
import {
    isBasicDamageOverridePath,
    resolveBasicDamageOverride
} from "../module/utils/basic-damage.mjs";
import {
    hasConditionalValueExpression,
    resolveConditionalValue
} from "../module/utils/effect-value-expression.mjs";

const normalizeLookupKey = (value) => value
    ?.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const getActiveEffectChangeType = (operation) => {
    return operation === "OVERRIDE" ? "override" : "add";
};

const buildActiveEffectChange = ({ key, operation, value }) => {
    const change = {
        key,
        value
    };
    if (CONST.ACTIVE_EFFECT_CHANGE_TYPES) {
        change.type = getActiveEffectChangeType(operation);
    } else {
        change.mode = operation === "OVERRIDE" ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE : CONST.ACTIVE_EFFECT_MODES.ADD;
    }
    return change;
};

const resolveRollBaseValue = (actor, rollAttribute) => {
    if (!actor || !rollAttribute) return null;
    const normalizedKey = normalizeLookupKey(rollAttribute);
    const normalizedAttributeKey = normalizeRequestedAttributeKey(rollAttribute);
    if (!normalizedKey || !normalizedAttributeKey) return null;

    const attributes = actor.system?.attributes || {};
    const attrKey = Object.keys(attributes).find((key) => normalizeLookupKey(key) === normalizeLookupKey(normalizedAttributeKey));
    if (attrKey) {
        const attr = attributes[attrKey];
        const value = (attr?.override !== null && attr?.override !== undefined)
            ? attr?.override
            : (attr?.final ?? attr?.value);
        if (value !== undefined && value !== null && !Number.isNaN(Number(value))) {
            return Number(value);
        }
    }

    const skills = actor.items?.filter((item) => item.type === "skill") || [];
    const matchedSkill = skills.find((skill) => normalizeLookupKey(skill.name) === normalizedKey);
    if (matchedSkill) {
        const nhValue = matchedSkill.system?.final_nh;
        if (nhValue !== undefined && nhValue !== null && !Number.isNaN(Number(nhValue))) {
            return Number(nhValue);
        }
    }

    if (!Number.isNaN(parseInt(rollAttribute))) return parseInt(rollAttribute);
    return null;
};

const evaluateNumericModifier = (rawValue, { actor = null, gameRef = game } = {}) => {
    if (rawValue === null || rawValue === undefined) return 0;
    if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;
    const source = String(rawValue).trim();
    if (!source) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(source)) return Number(source) || 0;

    try {
        const evaluated = Function("actor", "game", `return (${source});`)(actor, gameRef);
        const numeric = Number(evaluated);
        return Number.isFinite(numeric) ? numeric : 0;
    } catch (error) {
        console.warn("GUM | Falha ao avaliar modificador numérico de chat:", error);
        return 0;
    }
};


const isEffectDurationPermanent = (duration = {}) => {
    if (!duration || typeof duration !== "object") return false;
    if (duration._uiMode === "permanent") return true;
    return duration.isPermanent === true;
};

const normalizeEffectDurationFlags = (duration = {}) => {
    const normalized = foundry.utils.duplicate(duration || {});
    if (isEffectDurationPermanent(normalized)) {
        normalized.isPermanent = true;
        normalized.inCombat = false;
        normalized._uiMode = "permanent";
    }
    return normalized;
};

const normalizeTokenIconPolicy = (value) => {
    const normalized = (value ?? "").toString().trim().toLowerCase();

    if (["always", "always_show", "show", "on", "true", "1", "sempre"].includes(normalized)) return "always";
    if (["never", "never_show", "hide", "off", "false", "0", "nunca"].includes(normalized)) return "never";
    if (["auto", "automatic", "automático", "automatico", "default", "padrão", "padrao"].includes(normalized)) return "auto";

    return "auto";
};

const shouldShowTokenIcon = (effectSystem = {}, duration = {}) => {
    const policy = normalizeTokenIconPolicy(effectSystem.tokenIconPolicy);
    if (policy === "always") return true;
    if (policy === "never") return false;
    return !isEffectDurationPermanent(duration);
};

const getActiveEffectShowIconMode = (effectSystem = {}, duration = {}) => {
    return shouldShowTokenIcon(effectSystem, duration) ? 2 : 0;
};


const resolveTokenIconImage = (effectItem, effectSystem = {}, duration = {}) => {
    if (!shouldShowTokenIcon(effectSystem, duration)) return null;
    return effectItem?.img ?? null;
};


const applyFoundryRollModePrivacy = (chatData, rollMode = game?.settings?.get?.("core", "rollMode")) => {
    const mode = rollMode || "publicroll";
    if (mode === "gmroll") {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (mode === "blindroll") {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
        chatData.blind = true;
    } else if (mode === "selfroll") {
        chatData.whisper = [game.user.id];
    }
    return chatData;
};

const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const DEFAULT_EFFECT_ACTION = {
    id: "",
    label: "",
    type: "attribute",
    path: "system.attributes.st.passive",
    operation: "ADD",
    value: "1",
    attribute_chat_visibility: "public",
    key: "",
    flag_value: "",
    chat_text: "",
    has_roll: false,
    roll_label: "Rolar Teste",
    roll_attribute: "ht",
    roll_modifier: "0",
    roll_modifier_label: "",
    roll_skip_allowed: false,
    roll_skip_label: "",
    roll_modifier_value: "0",
    roll_modifier_cap: "",
    roll_modifier_context: "all",
    roll_modifier_source_item_ids: "",
    roll_modifier_source_attack_ids: "",
    roll_modifier_composition_group: "",
    roll_modifier_composition_mode: "sum",
    roll_modifier_composition_priority: 0,
    roll_modifier_entries: [],
    modifier_value: "0",
    modifier_value_mode: "fixed",
    modifier_cap: "",
    modifier_application_side: "self",
    modifier_nh_display_mode: "roll_only",
    skill_scope: "all",
    ability_kind: "skill",
    skill_targets: "",
    skill_attribute: "dx",
    ability_sources: "",
    ability_groups: "",
    ability_sheet_groups: "",
    ability_schools: "",
    ability_classes: "",
    combat_scope: "all",
    combat_source_item_ids: "",
    combat_source_attack_ids: "",
    combat_attack_enabled: true,
    combat_attack_value: "0",
    combat_attack_value_mode: "fixed",
    combat_parry_enabled: false,
    combat_parry_value: "0",
    combat_parry_value_mode: "fixed",
    combat_block_enabled: false,
    combat_block_value: "0",
    combat_block_value_mode: "fixed",
    combat_recalculate_parry: false,
    combat_recalculate_block: false,
    combat_damage_enabled: false,
    combat_damage_operation: "fixed",
    combat_damage_value: "0",
    combat_damage_cap: "",
    combat_damage_value_mode: "fixed",
    combat_damage_changes: [],
    roll_visibility: "owners",
    whisperMode: "public",
    category: "hp",
    name: "",
    chat_notice: true,
    confirm_prompt: false,
    variable_value: false,
    max: "0",
    source: "",
    hidden: false,
    exists_policy: "ignore",
    statusId: ""
};

// Regra explícita de prioridade do ícone carrier.
// Menor número = maior prioridade.
const CARRIER_ACTION_PRIORITY = {
    attribute: 1,
    roll_modifier: 2,
    skill_modifier: 2,
    combat_modifier: 2,
    flag: 3,
    status: 4
};

// Aplicações que precisam consultar uma cópia já existente são serializadas.
// Isso evita que duas aplicações simultâneas de "único" ou "renovar" leiam o
// mesmo estado antigo e criem duplicatas antes que a outra termine.
let nonStackingApplicationQueue = Promise.resolve();

const normalizeRollModifierEntryValue = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
        const asNumber = Number(raw);
        return Number.isFinite(asNumber) ? asNumber : 0;
    }
    return raw;
};

const normalizeRollModifierApplicationSide = (value) => {
    const raw = (value ?? "self").toString().trim().toLowerCase();
    if (["vs_targeter", "vs_target", "target", "against_targeter"].includes(raw)) return "vs_targeter";
    return "self";
};

const normalizeControlledCsv = (value) => {
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values.flatMap(entry => String(entry ?? "").split(",")).map(entry => entry.trim()).filter(Boolean))].join(", ");
};

const normalizeEffectAction = (action = {}) => {
    const configuredRollVisibility = action?.roll_visibility
        ?? (action?.whisperMode === "blind" ? "target" : action?.whisperMode === "gm" ? "owners" : action?.whisperMode);
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_EFFECT_ACTION), action || {}, { inplace: false, overwrite: true });
    next.attribute_chat_visibility = normalizeAttributeChatVisibility(next.attribute_chat_visibility);
    next.roll_visibility = normalizeEffectTestChatVisibility(configuredRollVisibility);
    Object.assign(next, normalizeEffectDamageAction(next));
    if (!Array.isArray(next.roll_modifier_entries) || next.roll_modifier_entries.length === 0) {
        next.roll_modifier_entries = [{
            label: "",
            value: normalizeRollModifierEntryValue(next.roll_modifier_value),
            value_mode: normalizeEffectValueMode(next.roll_modifier_value_mode ?? next.value_mode),
            cap: next.roll_modifier_cap ?? "",
            contexts: next.roll_modifier_context ?? "all",
            application_side: normalizeRollModifierApplicationSide(next.roll_modifier_application_side),
            target_kind: (next.roll_modifier_target_kind || "any").toString().trim() || "any",
            target_mode: (next.roll_modifier_target_mode || "all").toString().trim() || "all",
            target_values: (next.roll_modifier_target_values || "").toString().trim(),
            source_item_ids: (next.roll_modifier_source_item_ids || "").toString().trim(),
            source_attack_ids: (next.roll_modifier_source_attack_ids || "").toString().trim(),
            composition_group: (next.roll_modifier_composition_group || "").toString().trim(),
            composition_mode: normalizeRollModifierCompositionMode(next.roll_modifier_composition_mode),
            composition_priority: Number(next.roll_modifier_composition_priority) || 0,
            roll_tags: (next.roll_modifier_roll_tags || "").toString().trim(),
            roll_tag_match: next.roll_modifier_roll_tag_match === "all" ? "all" : "any",
            nh_display_mode: String(next.roll_modifier_composition_group || "").trim() ? "roll_only" : (next.roll_modifier_nh_display_mode || "roll_only").toString().trim() || "roll_only"
        }];
    }
    next.roll_modifier_entries = next.roll_modifier_entries.map((entry) => ({
        label: (entry?.label || "").toString().trim(),
        value: normalizeRollModifierEntryValue(entry?.value),
        value_mode: normalizeEffectValueMode(entry?.value_mode),
        cap: (entry?.cap ?? entry?.nh_cap ?? "").toString().trim(),
        contexts: (entry?.contexts || "all").toString().trim() || "all",
        application_side: normalizeRollModifierApplicationSide(entry?.application_side ?? entry?.applicationSide ?? next.roll_modifier_application_side),
        target_kind: (entry?.target_kind || "any").toString().trim() || "any",
        target_mode: (entry?.target_mode || "all").toString().trim() || "all",
        target_values: (entry?.target_values || "").toString().trim(),
        source_item_ids: (entry?.source_item_ids || "").toString().trim(),
        source_attack_ids: (entry?.source_attack_ids || "").toString().trim(),
        composition_group: (entry?.composition_group || "").toString().trim(),
        composition_mode: normalizeRollModifierCompositionMode(entry?.composition_mode),
        composition_priority: Number(entry?.composition_priority) || 0,
        ability_sources: normalizeControlledCsv(entry?.ability_sources),
        ability_groups: normalizeControlledCsv(entry?.ability_groups),
        ability_sheet_groups: normalizeControlledCsv(entry?.ability_sheet_groups),
        ability_schools: normalizeControlledCsv(entry?.ability_schools),
        ability_classes: normalizeControlledCsv(entry?.ability_classes),
         roll_tags: Array.isArray(entry?.roll_tags) ? entry.roll_tags.join(",") : (entry?.roll_tags || "").toString().trim(),
        roll_tag_match: entry?.roll_tag_match === "all" ? "all" : "any",
        nh_display_mode: (entry?.roll_tags?.length || String(entry?.roll_tags || "").trim() || String(entry?.composition_group || "").trim()) ? "roll_only" : (entry?.nh_display_mode || "roll_only").toString().trim() || "roll_only"
    }));
    next.roll_modifier_value = next.roll_modifier_entries[0]?.value ?? 0;
    next.roll_modifier_cap = next.roll_modifier_entries[0]?.cap ?? "";
    next.roll_modifier_source_item_ids = next.roll_modifier_entries[0]?.source_item_ids ?? "";
    next.roll_modifier_source_attack_ids = next.roll_modifier_entries[0]?.source_attack_ids ?? "";
    next.roll_modifier_application_side = next.roll_modifier_entries[0]?.application_side ?? "self";
    next.roll_modifier_composition_group = next.roll_modifier_entries[0]?.composition_group ?? "";
    next.roll_modifier_composition_mode = next.roll_modifier_entries[0]?.composition_mode ?? "sum";
    next.roll_modifier_composition_priority = next.roll_modifier_entries[0]?.composition_priority ?? 0;
    next.modifier_value = normalizeRollModifierEntryValue(next.modifier_value);
    next.modifier_value_mode = normalizeEffectValueMode(next.modifier_value_mode);
    next.modifier_application_side = normalizeRollModifierApplicationSide(next.modifier_application_side);
    next.ability_kind = ["skill", "spell", "power", "all"].includes(next.ability_kind) ? next.ability_kind : "skill";
    next.skill_scope = ["all", "specific", "attribute", "classification"].includes(next.skill_scope) ? next.skill_scope : "all";
    next.skill_targets = normalizeControlledCsv(next.skill_targets);
    next.skill_attribute = String(next.skill_attribute || "dx").trim().toLowerCase();
    next.ability_sources = normalizeControlledCsv(next.ability_sources);
    next.ability_groups = normalizeControlledCsv(next.ability_groups);
    next.ability_sheet_groups = normalizeControlledCsv(next.ability_sheet_groups);
    next.ability_schools = normalizeControlledCsv(next.ability_schools);
    next.ability_classes = normalizeControlledCsv(next.ability_classes);
    next.combat_scope = ["all", "melee", "ranged", "specific"].includes(next.combat_scope) ? next.combat_scope : "all";
    next.combat_source_item_ids = normalizeControlledCsv(next.combat_source_item_ids);
    next.combat_source_attack_ids = normalizeControlledCsv(next.combat_source_attack_ids);
    for (const key of ["combat_attack_enabled", "combat_parry_enabled", "combat_block_enabled", "combat_recalculate_parry", "combat_recalculate_block", "combat_damage_enabled"]) next[key] = next[key] === true;
    for (const key of ["combat_attack_value", "combat_parry_value", "combat_block_value", "combat_damage_value"]) next[key] = normalizeRollModifierEntryValue(next[key]);
    next.combat_damage_cap = String(next.combat_damage_cap ?? "").trim();
    for (const key of ["combat_attack_value_mode", "combat_parry_value_mode", "combat_block_value_mode", "combat_damage_value_mode"]) next[key] = normalizeEffectValueMode(next[key]);
    next.combat_damage_operation = ["fixed", "per_die", "extra_dice", "override"].includes(next.combat_damage_operation) ? next.combat_damage_operation : "fixed";
    const rawDamageChanges = Array.isArray(next.combat_damage_changes) ? next.combat_damage_changes : [];
    next.combat_damage_changes = (rawDamageChanges.length ? rawDamageChanges : [{
        component: "main", property: "formula", operation: next.combat_damage_operation,
        value: next.combat_damage_value, value_mode: next.combat_damage_value_mode, cap: next.combat_damage_cap
    }]).map(change => {
        const legacyProperty = ["formula", "type", "armor_divisor", "nature"].includes(change?.property) ? change.property : "formula";
        const isFormulaChange = legacyProperty === "formula";
        return {
            component: ["main", "follow_up", "fragmentation"].includes(change?.component) ? change.component : "main",
            operation: isFormulaChange && ["fixed", "per_die", "extra_dice", "override"].includes(change?.operation) ? change.operation : "fixed",
            value: isFormulaChange ? normalizeRollModifierEntryValue(change?.value) : 0,
            value_mode: isFormulaChange ? normalizeEffectValueMode(change?.value_mode) : "fixed",
            cap: isFormulaChange ? String(change?.cap ?? "").trim() : "",
            replace_armor_divisor: String(change?.replace_armor_divisor ?? (legacyProperty === "armor_divisor" ? change?.value : "")).trim(),
            replace_type: String(change?.replace_type ?? (legacyProperty === "type" ? change?.value : "")).trim(),
            replace_nature: String(change?.replace_nature ?? (legacyProperty === "nature" ? change?.value : "")).trim()
        };
    });
    return next;
};

const buildFallbackActionLabel = (action = {}) => {
    switch (action.type) {
        case "attribute":
            return "Modificador de Atributo";
        case "roll_modifier":
            return "Modificador de Rolagem";
        case "skill_modifier":
            return "Modificador de Habilidades";
        case "combat_modifier":
            return "Modificar Modo de Combate";
        case "status":
            return `Status: ${action.statusId || "indefinido"}`;
        case "resource_change":
            return "Alteração de Recurso";
        case "resource_create":
            return "Criar Recurso";
        case "damage_roll":
            return "Rolar Dano";
        case "flag":
            return "Flag";
        case "macro":
            return "Macro";
        case "chat":
            return "Mensagem de Chat";
        default:
            return "Ação";
    }
};

export const getEffectActions = (effectSystem = {}) => {
    if (Array.isArray(effectSystem?.actions)) return effectSystem.actions.map((action, index) => ({ ...normalizeEffectAction(action), id: String(action?.id || `legacy-action-${index + 1}`) }));
    return [{ ...normalizeEffectAction(effectSystem), id: String(effectSystem?.id || "legacy-action-1") }];
};

const selectCarrierActionIndex = (actions = []) => {
    const persistent = actions
        .map((action, index) => ({ action, index }))
        .filter(({ action }) => ["attribute", "flag", "roll_modifier", "skill_modifier", "combat_modifier", "status"].includes(action.type));
    if (!persistent.length) return null;

    persistent.sort((a, b) => {
        const pa = CARRIER_ACTION_PRIORITY[a.action.type] ?? 9999;
        const pb = CARRIER_ACTION_PRIORITY[b.action.type] ?? 9999;
        if (pa !== pb) return pa - pb;
        return a.index - b.index;
    });
    return persistent[0].index;
};

export async function applySingleEffect(effectItem, targets, context = {}) {
    if (!effectItem || targets.length === 0) return;
    if (!await isEffectItemBridgeApplicationActive(context)) return;
    targets = targets.filter(target => isActorContextAvailable(target?.actor));
    if (targets.length === 0) return;

    const effectSystem = effectItem.system;
    const stackingMode = normalizeEffectStackingMode(effectSystem);
    const stackingDomain = resolveEffectStackingDomain(context);
    const effectiveStackingMode = stackingDomain === "managed" ? "stack" : stackingMode;
    const applicationId = context.applicationId || foundry.utils.randomID();

    if (effectiveStackingMode !== "stack" && context._stackingQueueAcquired !== true) {
        const previous = nonStackingApplicationQueue.catch(() => undefined);
        let releaseQueue;
        const gate = new Promise(resolve => { releaseQueue = resolve; });
        nonStackingApplicationQueue = previous.then(() => gate);
        await previous;
        try {
            return await applySingleEffect(effectItem, targets, {
                ...context,
                applicationId,
                _stackingQueueAcquired: true
            });
        } finally {
            releaseQueue();
        }
    }

    const allActions = getEffectActions(effectSystem);
    const selectedActionIds = Array.isArray(context.actionIds) ? new Set(context.actionIds.map(String)) : null;
    const actionEntries = allActions
        .map((action, actionIndex) => ({ action, actionIndex }))
        .filter(({ action }) => !selectedActionIds || selectedActionIds.has(action.id));
    const actions = actionEntries.map(({ action }) => action);
    if (!actions.length) return;
    const conditionFlags = context.conditionId
        ? { conditionEffect: true, conditionId: context.conditionId, conditionIds: [context.conditionId] }
        : {};
    const evaluateEffectValue = async (value, actor) => {
        if (typeof value !== "string") {
            return { value, roll: null, formula: null };
        }

        let resolvedValue = value;
        try {
            resolvedValue = resolveConditionalValue(value, { actor });
        } catch (error) {
            console.warn(`GUM | Não foi possível avaliar a condição do efeito "${effectItem.name}":`, error);
            return { value: 0, roll: null, formula: null };
        }

        if (typeof resolvedValue !== "string") {
            return { value: resolvedValue, roll: null, formula: null };
        }

        const trimmed = resolvedValue.trim();
        if (trimmed === "") {
            return { value: 0, roll: null, formula: null };
        }

        // ✅ Suporte a notação de dados com sinal, ex: 1d6, -1d6, 2d4+1.
        try {
            const roll = new Roll(trimmed, actor?.getRollData?.() || {});
            await roll.evaluate();
            return { value: roll.total, roll, formula: trimmed };
        } catch (rollError) {
            // Fallback para expressões JS legadas.
            try {
                return { value: new Function("actor", "game", `return (${trimmed});`)(actor, game), roll: null, formula: null };
            } catch (error) {
                console.warn(`GUM | Não foi possível avaliar o valor do efeito "${effectItem.name}":`, error);
                return { value, roll: null, formula: null };
            }
        }
    };
    const persistentTypes = PERSISTENT_EFFECT_ACTION_TYPES;
    const instantTypes = INSTANT_EFFECT_ACTION_TYPES;

    const buildCommonActiveEffectData = (targetActor, actionIndex = 0, actionConditionFlags = conditionFlags) => {
        const gumDuration = normalizeEffectDurationFlags(context.durationOverride || effectSystem.duration || {});
        const startMode = gumDuration.startMode || "apply";
        const endMode = gumDuration.endMode || "turnEnd";
        const shouldDelayStart = gumDuration.inCombat && startMode === "nextTurnStart";
        const pendingCombat = gumDuration.inCombat && !game.combat;
        gumDuration.startMode = startMode;
        gumDuration.endMode = endMode;
        if (shouldDelayStart) gumDuration.pendingStart = true;
        if (pendingCombat) gumDuration.pendingCombat = true;

        const activeEffectData = {
            name: effectItem.name,
            img: null,
            showIcon: 0,
            origin: context.origin ? context.origin.uuid : (context.actor ? context.actor.uuid : null),
            changes: [],
            statuses: [],
            duration: {
                startTime: null,
                seconds: null,
                combat: null,
                rounds: null,
                turns: null,
                startRound: null,
                startTurn: null
            },
            flags: {
                gum: {
                    effectUuid: effectItem.uuid,
                    applicationId,
                    stackingDomain,
                    stackingMode,
                    source: context.source || null,
                    originItemId: context.originItemId ?? null,
                    stateEffectGroupId: context.stateEffectGroupId ?? null,
                    stateEffectLinkId: context.stateEffectLinkId ?? null,
                    stateEffectActivationId: context.stateEffectActivationId ?? null,
                    conditionActivationMode: context.conditionActivationMode ?? null,
                    statusBindingRuleUuid: context.statusBindingRuleUuid ?? null,
                    statusBindingStatusId: context.statusBindingStatusId ?? null,
                    duration: gumDuration,
                    ...actionConditionFlags,
                    ...(context.gumFlags || {})
                }
            },
            disabled: pendingCombat || shouldDelayStart
        };

 if (!isEffectDurationPermanent(gumDuration)) {
            const value = parseInt(gumDuration.value) || 1;
            const unit = gumDuration.unit;
            const usesCombatDuration = gumDuration.inCombat && game.combat;
            if (!usesCombatDuration) {
                if (unit === "turns") activeEffectData.duration.turns = value;
                else if (unit === "seconds") activeEffectData.duration.seconds = value;
                else if (unit === "rounds") activeEffectData.duration.rounds = value;
                else if (unit === "minutes") activeEffectData.duration.seconds = value * 60;
                else if (unit === "hours") activeEffectData.duration.seconds = value * 60 * 60;
                else if (unit === "days") activeEffectData.duration.seconds = value * 60 * 60 * 24;
            }

            if (usesCombatDuration) activeEffectData.duration.combat = game.combat.id;
            if (!pendingCombat && !shouldDelayStart) {
                activeEffectData.duration.startRound = game.combat?.round ?? null;
                activeEffectData.duration.startTurn = game.combat?.turn ?? null;
                activeEffectData.duration.startTime = game.time?.worldTime ?? null;
            }
        }

        const fallbackCoreStatusId = `${effectItem.name.slugify({ strict: true })}-a${actionIndex + 1}`;
        return { activeEffectData, targetActor, gumDuration, fallbackCoreStatusId };
    };

    const baseIconCarrierIndex = selectCarrierActionIndex(actions);

    for (const [selectedActionIndex, { action, actionIndex }] of actionEntries.entries()) {
        if (!persistentTypes.has(action.type) && !instantTypes.has(action.type)) {
            console.warn(`[GUM] Tipo de ação de efeito "${action.type}" não reconhecido.`);
            continue;
        }

        try {
            if (persistentTypes.has(action.type)) {
                if (context.skipPersistentEffects) continue;
                if (action.type === "status" && !findConfiguredStatus(action.statusId, CONFIG.statusEffects)) {
                    throw new Error(`Status configurado não encontrado: "${action.statusId || "vazio"}".`);
                }
                for (const targetToken of targets) {
                    const targetActor = targetToken.actor;
                    if (!isActorContextAvailable(targetActor)) continue;
                    const matchingEffects = effectiveStackingMode === "stack"
                        ? []
                        : Array.from(targetActor?.effects || []).filter(effect => matchesStackedEffect(effect, {
                            effectUuid: effectItem.uuid,
                            action,
                            actionIndex,
                            domain: stackingDomain
                        }));
                    if (effectiveStackingMode === "unique" && matchingEffects.length) {
                        const [primaryEffect, ...duplicateEffects] = matchingEffects;
                        if (stackingDomain === "condition") {
                            const previousOwners = collectConditionOwners(primaryEffect);
                            const conditionIds = [...new Set(matchingEffects
                                .flatMap(effect => collectConditionOwners(effect, context.conditionId)))];
                            if (conditionIds.length !== previousOwners.length || duplicateEffects.length) {
                                await primaryEffect.update({
                                    "flags.gum.conditionIds": conditionIds,
                                    "flags.gum.conditionId": conditionIds[0]
                                });
                            }
                        }
                        const duplicateIds = duplicateEffects.map(effect => effect.id).filter(Boolean);
                        if (duplicateIds.length) {
                            await targetActor.deleteEmbeddedDocuments("ActiveEffect", duplicateIds);
                        }
                        continue;
                    }
                    const refreshConditionIds = effectiveStackingMode === "refresh" && stackingDomain === "condition"
                        ? [...new Set(matchingEffects.flatMap(effect => collectConditionOwners(effect, context.conditionId)))]
                        : null;
                    const actionConditionFlags = refreshConditionIds?.length
                        ? { conditionEffect: true, conditionId: refreshConditionIds[0], conditionIds: refreshConditionIds }
                        : conditionFlags;
                    const { activeEffectData, gumDuration, fallbackCoreStatusId } = buildCommonActiveEffectData(targetActor, actionIndex, actionConditionFlags);
                    activeEffectData.name = (action.label || "").trim() || buildFallbackActionLabel(action) || effectItem.name;
                    activeEffectData.flags.gum.actionIndex = actionIndex;                    
                    activeEffectData.flags.gum.actionId = action.id;
                    activeEffectData.flags.gum.actionType = action.type;
                    activeEffectData.flags.gum.actionLabel = (action.label || "").trim();
                    const isIconCarrier = shouldShowTokenIcon(effectSystem, gumDuration) && baseIconCarrierIndex === selectedActionIndex;
                    if (isIconCarrier) {
                        activeEffectData.img = resolveTokenIconImage(effectItem, effectSystem, gumDuration);
                        activeEffectData.showIcon = getActiveEffectShowIconMode(effectSystem, gumDuration);
                    }

                    if (action.type === "attribute") {
                        if (!action.path) throw new Error("Ação de atributo sem caminho.");
                        const isDamageFormulaOverride = action.operation === "OVERRIDE"
                            && isBasicDamageOverridePath(action.path);
                        let evaluated;
                        if (isDamageFormulaOverride) {
                            let selectedFormula = action.value;
                            try {
                                selectedFormula = resolveConditionalValue(action.value, { actor: targetActor });
                            } catch (error) {
                                console.warn(`GUM | Não foi possível avaliar a condição do dano básico em "${effectItem.name}":`, error);
                                selectedFormula = "0";
                            }
                            evaluated = { value: resolveBasicDamageOverride(selectedFormula), roll: null, formula: null };
                        } else {
                            evaluated = await evaluateEffectValue(action.value, targetActor);
                        }
                        // Damage overrides describe the future damage roll. They must neither
                        // roll on effect application nor be numerically scaled by origin level.
                        const resolvedValue = resolveEffectValueMetadata(
                            evaluated.value,
                            isDamageFormulaOverride ? "fixed" : action.value_mode,
                            context.origin
                        );
                        activeEffectData.changes.push(buildActiveEffectChange({
                            key: action.path,
                            operation: action.operation,
                            value: resolvedValue.effectiveValue                            
                        }));
                        activeEffectData.flags.gum.valueScaling = resolvedValue;
                        const messageOptions = getAttributeRollMessageOptions({
                            visibility: action.attribute_chat_visibility,
                            actor: targetActor,
                            users: game.users,
                            generation: game.release?.generation
                        });
                        if (evaluated.roll && messageOptions) {
                            await evaluated.roll.toMessage({
                                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                                flavor: `${effectItem.name} • ${action.label || "Modificador de Atributo"} (${evaluated.formula})`,
                                ...messageOptions.messageData
                            }, messageOptions.creationOptions);
                        }
                    }

                    if (action.type === "flag") {
                        if (!action.key) throw new Error("Ação de flag sem chave.");
                        const valueToSet = action.flag_value === "true" ? true : action.flag_value === "false" ? false : action.flag_value;
                        foundry.utils.setProperty(activeEffectData.flags, `gum.${action.key}`, valueToSet);
                    }

                    if (action.type === "roll_modifier") {
                    const canonicalEntries = Array.isArray(action.roll_modifier_entries) && action.roll_modifier_entries.length
                            ? action.roll_modifier_entries
                            : [{
                                value: action.roll_modifier_value ?? 0,
                                value_mode: action.roll_modifier_value_mode ?? action.value_mode,
                                cap: action.roll_modifier_cap ?? "",
                                contexts: action.roll_modifier_context ?? "all",
                                application_side: action.roll_modifier_application_side ?? "self",
                                target_kind: action.roll_modifier_target_kind ?? "any",
                                target_mode: action.roll_modifier_target_mode ?? "all",
                                target_values: action.roll_modifier_target_values ?? "",
                                source_item_ids: action.roll_modifier_source_item_ids ?? "",
                                source_attack_ids: action.roll_modifier_source_attack_ids ?? "",
                                composition_group: action.roll_modifier_composition_group ?? "",
                                composition_mode: action.roll_modifier_composition_mode ?? "sum",
                                composition_priority: Number(action.roll_modifier_composition_priority) || 0,
                                roll_tags: action.roll_modifier_roll_tags ?? "",
                                roll_tag_match: action.roll_modifier_roll_tag_match ?? "any",
                                nh_display_mode: action.roll_modifier_nh_display_mode ?? "roll_only"
                            }];
                        const entries = canonicalEntries.map((entry) => {
                            const scaling = resolveEffectValueMetadata(entry.value, entry.value_mode, context.origin);
                            const deferValueEvaluation = hasConditionalValueExpression(entry.value);
                            return {
                                ...foundry.utils.deepClone(entry),
                                value: deferValueEvaluation ? entry.value : scaling.effectiveValue,
                                value_mode: scaling.valueMode,
                                base_value: scaling.baseValue,
                                origin_level: scaling.originLevel,
                                origin_item_id: scaling.originItemId,
                                origin_item_uuid: scaling.originItemUuid,
                                defer_value_evaluation: deferValueEvaluation
                            };
                        });
                        activeEffectData.flags.gum.rollModifier = {
                            entries,
                            value: entries[0]?.value ?? 0,
                            cap: entries[0]?.cap ?? "",
                            context: entries[0]?.contexts ?? "all",
                            applicationSide: entries[0]?.application_side ?? "self"
                        };
                    }

                    if (action.type === "skill_modifier" || action.type === "combat_modifier") {
                        const scaleEntry = (entry) => {
                            const scaling = resolveEffectValueMetadata(entry.value, entry.value_mode, context.origin);
                            const deferValueEvaluation = hasConditionalValueExpression(entry.value);
                            return {
                                ...entry,
                                value: deferValueEvaluation ? entry.value : scaling.effectiveValue,
                                value_mode: scaling.valueMode,
                                base_value: scaling.baseValue,
                                origin_level: scaling.originLevel,
                                origin_item_id: scaling.originItemId,
                                origin_item_uuid: scaling.originItemUuid,
                                defer_value_evaluation: deferValueEvaluation
                            };
                        };
                        const application_side = action.modifier_application_side || "self";
                        const requestedNhDisplayMode = action.modifier_nh_display_mode || "roll_only";
                        const containsDiceFormula = (value) => /(?:^|[^\w])\d*d\d+(?:[^\w]|$)/i.test(String(value ?? ""));
                        const resolveNhDisplayMode = (value) => application_side === "vs_targeter" || containsDiceFormula(value)
                            ? "roll_only"
                            : requestedNhDisplayMode;
                        const entries = [];

                        if (action.type === "skill_modifier") {
                            const abilityKinds = action.ability_kind === "all"
                                ? ["skill", "spell", "power"]
                                : [action.ability_kind || "skill"];
                            const contexts = abilityKinds
                                .map(kind => action.skill_scope === "attribute" ? `${kind}_${action.skill_attribute || "dx"}` : kind)
                                .join(",");
                            entries.push(scaleEntry({
                                label: action.label || "",
                                value: action.modifier_value,
                                value_mode: action.modifier_value_mode,
                                cap: action.modifier_cap || "",
                                contexts,
                                application_side,
                                target_values: action.skill_scope === "specific" ? action.skill_targets || "" : "",
                                source_item_ids: "",
                                source_attack_ids: "",
                                ability_sources: action.skill_scope === "classification" ? action.ability_sources || "" : "",
                                ability_groups: action.skill_scope === "classification" ? action.ability_groups || "" : "",
                                ability_sheet_groups: action.skill_scope === "classification" ? action.ability_sheet_groups || "" : "",
                                ability_schools: action.skill_scope === "classification" ? action.ability_schools || "" : "",
                                ability_classes: action.skill_scope === "classification" ? action.ability_classes || "" : "",
                                ability_roll_only: true,
                                skill_roll_only: (action.ability_kind || "skill") === "skill",
                                nh_display_mode: resolveNhDisplayMode(action.modifier_value)
                            }));
                        } else {
                            const attackContext = action.combat_scope === "melee" ? "attack_melee" : action.combat_scope === "ranged" ? "attack_ranged" : "attack";
                            const specificCombatScope = action.combat_scope === "specific";
                            const common = {
                                label: action.label || "",
                                cap: action.modifier_cap || "",
                                application_side,
                                source_item_ids: specificCombatScope ? action.combat_source_item_ids || "" : "",
                                source_attack_ids: specificCombatScope ? action.combat_source_attack_ids || "" : ""
                            };
                            if (action.combat_attack_enabled) entries.push(scaleEntry({ ...common, value: action.combat_attack_value, value_mode: action.combat_attack_value_mode, contexts: attackContext, nh_display_mode: resolveNhDisplayMode(action.combat_attack_value) }));
                            if (action.combat_parry_enabled) entries.push(scaleEntry({ ...common, value: action.combat_parry_value, value_mode: action.combat_parry_value_mode, contexts: "defense_parry", nh_display_mode: resolveNhDisplayMode(action.combat_parry_value) }));
                            if (action.combat_block_enabled) entries.push(scaleEntry({ ...common, value: action.combat_block_value, value_mode: action.combat_block_value_mode, contexts: "defense_block", nh_display_mode: resolveNhDisplayMode(action.combat_block_value) }));

                            const combatEntries = [];
                            if (action.combat_recalculate_parry || action.combat_recalculate_block || action.combat_damage_enabled) {
                                const damageScaling = resolveEffectValueMetadata(action.combat_damage_value, action.combat_damage_value_mode, context.origin);
                                const damageIsFormula = ["extra_dice", "override"].includes(action.combat_damage_operation)
                                    && !/^[+-]?\d+(?:\.\d+)?$/.test(String(action.combat_damage_value ?? "").trim());
                                const deferredDamage = hasConditionalValueExpression(action.combat_damage_value) || damageIsFormula;
                                const damageChanges = action.combat_damage_changes.map(change => {
                                    const scaling = resolveEffectValueMetadata(change.value, change.value_mode, context.origin);
                                    const defer = hasConditionalValueExpression(change.value) || (["extra_dice", "override"].includes(change.operation) && !/^[+-]?\d+(?:\.\d+)?$/.test(String(change.value ?? "").trim()));
                                    return { ...change, value: defer ? change.value : scaling.effectiveValue, value_mode: scaling.valueMode, origin_level: scaling.originLevel, defer_value_evaluation: defer };
                                });
                                combatEntries.push({
                                    source_item_ids: specificCombatScope ? action.combat_source_item_ids || "" : "",
                                    source_attack_ids: specificCombatScope ? action.combat_source_attack_ids || "" : "",
                                    attack_context: attackContext,
                                    application_side,
                                    recalculate_parry: action.combat_recalculate_parry === true,
                                    recalculate_block: action.combat_recalculate_block === true,
                                    attack_value: entries.find((entry) => entry.contexts === attackContext)?.value ?? 0,
                                    attack_value_mode: entries.find((entry) => entry.contexts === attackContext)?.value_mode ?? "fixed",
                                    attack_origin_level: entries.find((entry) => entry.contexts === attackContext)?.origin_level ?? 1,
                                    attack_defer_value_evaluation: entries.find((entry) => entry.contexts === attackContext)?.defer_value_evaluation === true,
                                    attack_nh_display_mode: entries.find((entry) => entry.contexts === attackContext)?.nh_display_mode ?? "roll_only",
                                    damage_enabled: action.combat_damage_enabled === true,
                                    damage_operation: action.combat_damage_operation || "fixed",
                                    damage_value: deferredDamage ? action.combat_damage_value : damageScaling.effectiveValue,
                                    damage_cap: action.combat_damage_cap || "",
                                    damage_value_mode: damageScaling.valueMode,
                                    origin_level: damageScaling.originLevel,
                                    defer_value_evaluation: deferredDamage
                                    ,damage_changes: damageChanges
                                });
                            }
                            if (combatEntries.length) activeEffectData.flags.gum.combatModifier = { entries: combatEntries };
                        }
                        if (entries.length) activeEffectData.flags.gum.rollModifier = { entries, value: entries[0].value, cap: entries[0].cap, context: entries[0].contexts, applicationSide: entries[0].application_side };
                    }

                    if (isIconCarrier && action.type !== "status") {
                        activeEffectData.statuses.push(fallbackCoreStatusId);
                        foundry.utils.setProperty(activeEffectData, "flags.core.statusId", fallbackCoreStatusId);
                    }
                    if (action.type === "status" && action.statusId) {
                        const statusEffect = findConfiguredStatus(action.statusId, CONFIG.statusEffects);
                        activeEffectData.img = statusEffect?.icon ?? statusEffect?.img ?? activeEffectData.img;
                        activeEffectData.showIcon = getActiveEffectShowIconMode(effectSystem, gumDuration);
                        activeEffectData.statuses.push(action.statusId);
                        foundry.utils.setProperty(activeEffectData, "flags.core.statusId", action.statusId);
                    }
                    if (effectSystem.attachedStatusId && isIconCarrier && action.type !== "status") {
                        const attachedStatus = findConfiguredStatus(effectSystem.attachedStatusId, CONFIG.statusEffects);
                        if (attachedStatus) {
                            activeEffectData.statuses.push(effectSystem.attachedStatusId);
                        } else {
                            console.warn(`[GUM] Status anexado configurado não encontrado: "${effectSystem.attachedStatusId}".`);
                        }
                    }
                    activeEffectData.statuses = [...new Set(activeEffectData.statuses.filter(Boolean))];

                    if (!isActorContextAvailable(targetActor)) continue;
                    try {
                        if (effectiveStackingMode === "refresh" && matchingEffects.length) {
                            const [primaryEffect, ...duplicateEffects] = matchingEffects;
                            await primaryEffect.update(activeEffectData, { diff: false, recursive: false });
                            const duplicateIds = duplicateEffects.map(effect => effect.id).filter(Boolean);
                            if (duplicateIds.length) {
                                await targetActor.deleteEmbeddedDocuments("ActiveEffect", duplicateIds);
                            }
                        } else {
                            await targetActor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                        }
                    } catch (error) {
                        if (isMissingSyntheticActorContextError(error, targetActor)) continue;
                        throw error;
                    }
                    if (isActorContextAvailable(targetActor)) targetActor.sheet?.render?.(false);
                }
                continue;
            }

            if (action.type === "resource_change") {
                if (context.skipInstantEffects) continue;
                let valueToChange = action.value;

                if (action.confirm_prompt) {
                    const confirmed = await Dialog.confirm({
                        title: "Confirmar Alteração de Recurso",
                        content: `<div class="gum-resource-change-dialog__content"><p>Deseja aplicar o efeito <strong>"${escapeHtml(effectItem.name)}"</strong>?</p></div>`,
                        yes: () => true,
                        no: () => false,
                        defaultYes: true,
                        options: {
                            classes: ["dialog", "gum", "gum-dialog", "gum-resource-change-dialog"]
                        }
                    });
                    if (!confirmed) continue;
                }
                if (action.variable_value) {
                    const newAmount = await new Promise(resolve => {
                        new Dialog({
                            title: "Definir Alteração de Recurso",
                            content: `
                                <div class="gum-resource-change-dialog__content">
                                    <p class="gum-resource-change-dialog__prompt">Qual o valor para <strong>"${escapeHtml(effectItem.name)}"</strong>?</p>
                                    <div class="gum-resource-change-dialog__field">
                                        <label for="gum-resource-change-amount">Valor</label>
                                        <input id="gum-resource-change-amount" type="text" name="amount" value="${escapeHtml(valueToChange)}" autocomplete="off"/>
                                    </div>
                                </div>
                            `,
                            buttons: { apply: { icon: '<i class="fas fa-check"></i>', label: "Aplicar", callback: (html) => resolve(html.find('input[name=\"amount\"]').val()) } },
                            default: "apply",
                            close: () => resolve(null)
                        }, {
                            classes: ["dialog", "gum", "gum-dialog", "gum-resource-change-dialog"],
                            width: 380
                        }).render(true);
                    });
                    if (newAmount === null) continue;
                    valueToChange = newAmount;
                }

                const targetDependentValue = hasConditionalValueExpression(valueToChange);
                const sharedEvaluation = targetDependentValue
                    ? null
                    : await evaluateEffectValue(valueToChange, targets[0]?.actor ?? context.actor);

                for (const targetToken of targets) {
                    const targetActor = targetToken.actor;
                    const { value: evaluatedValue } = sharedEvaluation ?? await evaluateEffectValue(valueToChange, targetActor);
                    const finalValue = Number(evaluatedValue) || 0;
                    let updatePath = "";
                    let updateObject = null;

                    switch (action.category) {
                        case "hp": updatePath = "system.attributes.hp.value"; break;
                        case "fp": updatePath = "system.attributes.fp.value"; break;
                        case "energy_reserve": {
                            const reserveKey = Object.keys(targetActor.system.spell_reserves || {}).find(k => targetActor.system.spell_reserves[k].name === action.name) || Object.keys(targetActor.system.power_reserves || {}).find(k => targetActor.system.power_reserves[k].name === action.name);
                            if (reserveKey) updatePath = targetActor.system.spell_reserves?.[reserveKey] ? `system.spell_reserves.${reserveKey}.current` : `system.power_reserves.${reserveKey}.current`;
                            if (!reserveKey) {
                                const linked = targetActor.items.filter(item => item.type === "equipment")
                                    .map(item => ({ item, reserve: equipmentLinkedReserve(item, item.system?.equipmentResolution) }))
                                    .find(({ reserve }) => reserve && ["spell", "power"].includes(reserve.type) && reserve.name === action.name);
                                if (linked) {
                                    const next = Math.max(0, Math.min(linked.reserve.max, linked.reserve.current + finalValue));
                                    updateObject = linked.item.update(equipmentReserveBalanceUpdate(linked.item, next, linked.item.system?.equipmentResolution));
                                }
                            }
                            break;
                        }
                        case "combat_tracker": {
                            const trackerKey = Object.keys(targetActor.system.combat.combat_meters || {}).find(k => targetActor.system.combat.combat_meters[k].name === action.name);
                            if (trackerKey) updatePath = `system.combat.combat_meters.${trackerKey}.current`;
                            if (!trackerKey) {
                                const linked = targetActor.items.filter(item => item.type === "equipment")
                                    .map(item => ({ item, reserve: equipmentLinkedReserve(item, item.system?.equipmentResolution) }))
                                    .find(({ reserve }) => reserve?.type === "combat" && reserve.name === action.name);
                                if (linked) {
                                    const next = Math.max(0, Math.min(linked.reserve.max, linked.reserve.current + finalValue));
                                    updateObject = linked.item.update(equipmentReserveBalanceUpdate(linked.item, next, linked.item.system?.equipmentResolution));
                                }
                                if (!linked) {
                                    const integrity = targetActor.items.filter(item => item.type === "equipment")
                                        .map(item => ({ item, record: equipmentIntegrityRecord(item, item.system?.equipmentResolution) }))
                                        .find(({ record }) => record?.name === action.name);
                                    if (integrity) {
                                        const next = Math.max(0, Math.min(integrity.record.max, integrity.record.current + finalValue));
                                        updateObject = integrity.item.update(equipmentIntegrityCurrentUpdate(integrity.item, next, integrity.item.system?.equipmentResolution));
                                    }
                                }
                            }
                            break;
                        }
                        case "item_quantity": {
                            const itemToUpdate = targetActor.items.find(i => i.name === action.name);
                            if (itemToUpdate) {
                                const newQuantity = (itemToUpdate.system.quantity || 0) + finalValue;
                                updateObject = itemToUpdate.update({ "system.quantity": newQuantity });
                            }
                            break;
                        }
                        default:
                            break;
                    }

                    if (updateObject) await updateObject;
                    else if (updatePath) {
                        const currentValue = foundry.utils.getProperty(targetActor, updatePath) || 0;
                        await targetActor.update({ [updatePath]: currentValue + finalValue });
                    }
                    if (action.chat_notice) {
                        const chatData = applyFoundryRollModePrivacy({
                            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                            content: `<strong>${escapeHtml(effectItem.name)}:</strong> ${finalValue >= 0 ? "+" : ""}${finalValue} aplicado em ${escapeHtml(action.name || action.category)}.`
                        });
                        ChatMessage.create(chatData);
                    }
                }
                continue;
            }

             if (action.type === "resource_create") {
                if (context.skipInstantEffects) continue;
                const resourceName = (action.name || "").toString().trim();
                if (!resourceName) {
                    ui.notifications.warn(`[GUM] Ação Criar Recurso de "${effectItem.name}" sem nome definido.`);
                    continue;
                }

                const existsPolicy = action.exists_policy || "ignore";

                for (const targetToken of targets) {
                    const targetActor = targetToken.actor;
                    const { value: initialValue } = await evaluateEffectValue(action.value ?? 0, targetActor);
                    const { value: maxValue } = await evaluateEffectValue(action.max ?? action.value ?? 0, targetActor);
                    const current = Number(initialValue) || 0;
                    const max = Number(maxValue) || 0;
                    let collectionPath = null;
                    const resourceData = { name: resourceName, current, max, value: current };

                    if (action.category === "spell_reserve") {
                        collectionPath = "system.spell_reserves";
                        resourceData.source = action.source || effectItem.name;
                    } else if (action.category === "power_reserve") {
                        collectionPath = "system.power_reserves";
                        resourceData.source = action.source || effectItem.name;
                    } else if (action.category === "combat_tracker") {
                        collectionPath = "system.combat.combat_meters";
                        resourceData.hidden = Boolean(action.hidden);
                    }

                    if (!collectionPath) {
                        ui.notifications.warn(`[GUM] Categoria de criação de recurso "${action.category}" não reconhecida.`);
                        continue;
                    }

                    const collection = foundry.utils.getProperty(targetActor, collectionPath) || {};
                    const existingEntry = Object.entries(collection).find(([, entry]) => entry?.name === resourceName);
                    if (existingEntry) {
                        const [existingKey, existing] = existingEntry;
                        const basePath = `${collectionPath}.${existingKey}`;
                        if (existsPolicy === "ignore") {
                            if (action.chat_notice) {
                                ChatMessage.create(applyFoundryRollModePrivacy({
                                    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                                    content: `<strong>${escapeHtml(effectItem.name)}:</strong> ${escapeHtml(resourceName)} já existe e foi mantido.`
                                }));
                            }
                            continue;
                        }
                        if (existsPolicy === "replace") {
                            await targetActor.update({ [basePath]: resourceData });
                        } else if (existsPolicy === "sum_max") {
                            const nextMax = (Number(existing.max ?? existing.value ?? 0) || 0) + max;
                            await targetActor.update({ [`${basePath}.max`]: nextMax });
                        } else if (existsPolicy === "update_max") {
                            await targetActor.update({ [`${basePath}.max`]: max });
                        } else if (existsPolicy === "restore") {
                            const resolvedMax = Number(existing.max ?? max) || max;
                            await targetActor.update({ [`${basePath}.current`]: resolvedMax, [`${basePath}.value`]: resolvedMax });
                        }
                    } else {
                        await targetActor.update({ [`${collectionPath}.${foundry.utils.randomID()}`]: resourceData });
                    }

                    if (action.chat_notice) {
                        ChatMessage.create(applyFoundryRollModePrivacy({
                            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                            content: `<strong>${escapeHtml(effectItem.name)}:</strong> recurso ${escapeHtml(resourceName)} criado/atualizado (${current}/${max}).`
                        }));
                    }
                }
                continue;
            }

            if (action.type === "damage_roll") {
                if (context.skipInstantEffects) continue;
                for (const target of targets) {
                    if (!target?.actor) continue;
                    await rollEffectDamageAction({ action, effectItem, target, context });
                }
                continue;
            }

            if (action.type === "macro") {
                if (context.skipInstantEffects) continue;
                if (!action.value) continue;
                const macro = game.macros.getName(action.value);
                if (macro) macro.execute({ actor: context.actor, origin: context.origin, targets });
                else ui.notifications.warn(`[GUM] Macro "${action.value}" não encontrada.`);
                continue;
            }

            if (action.type === "chat") {
                if (context.skipInstantEffects) continue;
                if (!action.chat_text) continue;
                for (const target of targets) {
                    const targetActor = target.actor;
                    const chatBody = action.chat_text.replace(/{actor.name}/g, targetActor.name);
                    const content = `<div class="gurps-effect-chat-card"><div class="gum-effect-chat-header"><i class="fas fa-comment-dots"></i><span>Mensagem de Efeito</span><span class="gum-effect-chat-target">${targetActor.name}</span></div><div class="gum-effect-chat-body">${chatBody}</div></div>`;
                    const chatData = { speaker: ChatMessage.getSpeaker({ actor: targetActor }), content };
                    if (action.has_roll) {
                        const normalized = normalizeChatRoll(action);
                        const recipients = recipientUserIdsForActor(targetActor, Array.from(game.users || []));
                        const privacy = getEffectTestChatPrivacy({ visibility: normalized.visibility, actor: targetActor, users: Array.from(game.users || []) });
                        if (privacy.whisper.length) chatData.whisper = privacy.whisper;
                        if (privacy.blind) chatData.blind = true;
                        const { createSingleRollRequestMessage } = await import("../module/services/roll-request-service.js");
                        await createSingleRollRequestMessage({ title: normalized.label, description: chatBody, origin: { type: "effect-chat", effectUuid: effectItem.uuid, effectName: effectItem.name }, targets: [{ targetKey: targetActor.uuid, actorUuid: targetActor.uuid, tokenUuid: null, actorName: targetActor.name, actorImg: targetActor.img, recipientUserIds: recipients }], test: normalized.test, skip: normalized.skip, consequence: { type: "chat-record" }, delivery: { rollMode: privacy.mode, visibility: normalized.visibility } }, chatData);
                    } else {
                        if (action.whisperMode === "gm") chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                        else if (action.whisperMode === "blind") chatData.blind = true;
                        ChatMessage.create(chatData);
                    }
                }
            }
        } catch (error) {
            if (targets.some(target => isMissingSyntheticActorContextError(error, target?.actor))) continue;
            console.error(`GUM | Falha ao aplicar ação "${action.type}" do efeito "${effectItem.name}":`, error);
            ui.notifications.warn(`Efeito "${effectItem.name}": uma ação "${action.type}" falhou e foi ignorada.`);
        }
    }
}
