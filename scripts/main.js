import { calculateItemTraitCost } from "../module/utils/trait-cost.mjs";
// ================================================================== //
//  1. IMPORTAÇÕES 
// ================================================================== //

import { ModifierBrowser } from "../module/apps/modifier-browser.js";
import { ConditionBrowser } from "../module/apps/condition-browser.js";
import { EffectBrowser } from "../module/apps/effect-browser.js";
import { GurpsActorSheet } from "../module/actor/gurps-actor-sheet.js";
import "../scripts/journal-pdf.js";
import { GurpsItemSheet } from "../module/item/gurps-item-sheet.js";
import { MoneySourceSheet } from "../module/item/money-source-sheet.js";
import { TemplateItemSheet } from "../module/item/template-item-sheet.js";
import { migrateLegacyStatusBindingSource, migrateRetiredBundledSources, registerSystemSettings, retireLegacyStatusBindingSources } from "../module/settings.js";
import { GumPreviewDialog } from "../module/apps/preview-dialog.js";
import DamageApplicationWindow from './apps/damage-application.js';
import { ConditionSheet } from "./apps/condition-sheet.js";
import { EffectSheet } from './apps/effect-sheet.js';
import { TriggerSheet } from './apps/trigger-sheet.js';
import { applySingleEffect, getEffectActions } from './effects-engine.js';
import { isPersistentEffectAction, normalizeEffectStackingMode } from '../module/utils/effect-stacking.mjs';
import { buildActorEffectTarget, buildActorEffectTargets, getActorEvaluationKey, isActorContextAvailable, isMissingSyntheticActorContextError } from '../module/utils/condition-actor-context.mjs';
import { captureActorResourceChanges } from '../module/utils/actor-resource-change.mjs';
import {
    buildActiveEffectConditionEvent,
    buildCombatConditionEvent,
    buildDefenseRollConditionEvent,
    buildRegionConditionEvent,
    buildSceneDarknessConditionEvent,
    buildWorldTimeConditionEvent,
    collectRegionConditionTransitions
} from '../module/utils/condition-event-data.mjs';
import { captureItemResourceChanges } from '../module/utils/item-resource-change.mjs';
import { PASSIVE_CONDITION_CONFIG_SETTING, normalizePassiveConditionConfiguration, preparePassiveConditionCreateData, resolvePassiveConditionConfiguration } from '../module/utils/passive-condition-sync.mjs';
import { ConditionEventDeduper, normalizeConditionEffectLinks, shouldExecuteConditionEffectLink } from '../module/utils/condition-effect-link.mjs';
import { reconcileAllStateEffects, removeAllStateEffectsForItem, setStateEffectGroupActive, syncItemStateEffects } from '../module/services/state-effect-service.js';
import { GUM } from '../module/config.js';
import { installItemCompendiumExportSourceCompatibility } from '../module/utils/foundry-item-compat.mjs';
import { WORLD_STATUS_SETTING, buildWorldStatusBindingRules, buildWorldStatusPresentationPlan, collectWorldStatusActors, localizeBaseStatuses, normalizeWorldStatusConfiguration, resolveWorldStatusRows } from '../module/utils/world-status-config.mjs';
import { importCharacterFromJson, importFromGCS, invalidateHybridItemIndex } from "../module/apps/importers.js";
import { GumGMScreen } from "../module/apps/gm-screen.js";
import { GurpsRollPrompt } from "../module/apps/roll-prompt.js";
import { GurpsDamageRollPrompt } from "../module/apps/damage-roll-prompt.js";
import { prepareAmmunitionRollData } from "../module/apps/ammunition-preparation.mjs";
import { ammunitionAvailableUses, availableAmmunition, applyAmmunition, ammunitionRollModifier, calculateRapidFireHits, numericRateOfFire, reconcileAmmunitionModifier } from "../module/utils/ammunition.mjs";
import { getPurposeLabels, matchesRollTags, resolveRollMetadata, shouldIncludeInPermanentNh } from "../module/utils/roll-purposes.mjs";
import { getBodyProfile } from "../module/config/body-profiles.js";
import { calculateDamageResistance, mergeDamageResistance, parseDamageResistanceEffectPath } from "../module/utils/damage-resistance.mjs";
import { buildEffectiveBodyLocations } from "../module/utils/damage-resistance-locations.mjs";
import { openTestRequestLauncher } from "../module/apps/test-request-launcher.js";
import { activateTestRequestChatListeners, registerTestRequestSocket } from "../module/services/test-request-service.js";
import { activateRollRequestChatListeners, executeRollRequest, registerRollRequestSocket } from "../module/services/roll-request-service.js";
import { evaluateBarrierConsequence, isMatchingDamageResistance, normalizeResistanceRoll, normalizeRollRequest } from "../module/utils/roll-request-data.mjs";import { evaluateGurpsRollResult } from "../module/utils/gurps-roll-result.mjs";
import { registerContextMenuCompatibilityHooks } from "../module/utils/context-menu-compatibility.mjs";
import { resolveCharacterImage } from "../module/utils/character-image.mjs";
import { shouldRefreshGMScreenForActor } from "../module/utils/gm-screen-refresh.mjs";
import { appendResistanceRequestResult, renderPendingResistanceRequest } from "../module/utils/roll-request-view.mjs";
import { isUserAuthorizedForTarget } from "../module/utils/test-request-targets.mjs";
import { resolveDamageApplicationTarget } from "../module/utils/damage-application-target.mjs";
import { getResistanceChatPrivacy } from "../module/utils/effect-chat-visibility.mjs";
import { showDiceForMessageLessRoll } from "../module/utils/dice-so-nice.mjs";
import { applyRollPrivacy, getCurrentRollPrivacyMode } from "../module/utils/roll-privacy.mjs";
import { BASIC_DAMAGE_KEYS, getBasicDamageFormula, normalizeBasicDamageData, prepareBasicDamageAttributes } from "../module/utils/basic-damage.mjs";
import { normalizeGurpsDamageExpression } from "../module/utils/damage-normalization.js";
import { evaluateJavaScriptNumericExpression, resolveConditionalValue } from "../module/utils/effect-value-expression.mjs";
import { evaluateModifierRollFormulaSync, hasModifierRollFormula } from "../module/utils/modifier-roll-formula.mjs";
import { resolveAttackDamageDisplay } from "../module/utils/attack-damage-display.mjs";
import { formatDamageNature, resolveDamageNature } from "../module/utils/damage-nature.mjs";
import { canUserCreateActors } from "../module/utils/actor-creation-permission.mjs";
import { resolveRollReference } from "../module/utils/roll-reference-resolver.mjs";
import { CONTENT_SOURCE_PURPOSES, contentSourceService } from "../module/services/content-source-service.mjs";
import { applyMagicConsumptionTrigger, prepareMagicConsumptionSession } from "../module/services/magic-consumption-service.mjs";
import { ContentSourceConfig } from "../module/apps/content-source-config.js";
import { WorldStatusConfig } from "../module/apps/world-status-config.js";
import { installGumApi } from "../module/api/gum-api.mjs";
import { GUM_API_HOOKS, emitGumLifecycleHook, resolveGumSourceToken } from "../module/api/gum-hooks.mjs";
import { registerGumRegionEffectBehavior, registerMonksActiveTilesEffectAction } from "../module/integrations/scene-effect-integration.mjs";
import { registerDynamicEffectRegionHooks } from "../module/services/dynamic-effect-region-service.mjs";
import {
    activateEffectItemBridgeCarrier,
    cleanupEffectItemBridgeCarrier,
    deactivateEffectItemBridgeCarrier,
    ensureEffectItemBridge,
    isEffectItemBridgeCarrier,
    synchronizeWorldEffectItemBridges
} from "../module/integrations/active-effect-bridge.mjs";
import { getRequestedAttributeOption, normalizeRequestedAttributeKey } from "../module/utils/requested-attributes.mjs";
import { matchesAbilityClassificationFilters, matchesAbilityRollContext, resolveAbilityRollContext } from "../module/utils/ability-roll-context.mjs";

import { getSkillDisplayName, setDirectoryEntryLabel } from "../module/utils/skill-display-name.mjs";
import { installGumChatCommandInterceptor, normalizeGumLookup, resolveGumCommandActor, splitSkillModifier } from "../module/utils/gum-chat-command.mjs";
import { buildEquipmentConsumptionUpdate, resolveEquipment } from "../module/utils/equipment-resolution.mjs";
import { applyEquipmentDefenseBonus, collectActiveEquipmentDefenseBonuses, evaluateDecisiveDefenseBonus } from "../module/utils/equipment-defense-bonus.mjs";
import { collectActiveEquipmentGrantedEffects, EQUIPMENT_GRANTED_EFFECT_SOURCE, hasEquipmentGrantRelevantChange, matchesEquipmentGrantedEffectScope } from "../module/utils/equipment-granted-effects.mjs";
import { collectActiveEquipmentOwnerModifiers, equipmentAttributeBonus, equipmentSkillBonus } from "../module/utils/equipment-owner-modifiers.mjs";
import { composeRollModifiers, getRollModifierCompositionOrigin } from "../module/utils/roll-modifier-composition.mjs";
import { registerHexOccupancyCanvasHooks } from "../module/canvas/hex-occupancy-overlay.js";
import { registerHexOccupancyCanvasLayer } from "../module/canvas/hex-occupancy-layer.mjs";
import { registerMovementRulerIntegration } from "../module/canvas/movement-ruler.mjs";
import { registerDistanceRulerIntegration } from "../module/canvas/distance-ruler.mjs";
import { PHYSICAL_FEAT_ATTRIBUTE_KEYS, prepareBasicLiftAttribute, preparePhysicalFeatAttributes } from "../module/utils/physical-feats.mjs";

registerMonksActiveTilesEffectAction();
registerDynamicEffectRegionHooks();

const { Actors: ActorsCollection, Items: ItemsCollection } = foundry.documents.collections;

async function syncEquipmentModifierGrantedEffects(item) {
    const actor = item?.parent;
    if (!actor || item.type !== "equipment") return;

    const existing = Array.from(actor.effects || []).filter(effect =>
        foundry.utils.getProperty(effect, "flags.gum.originItemId") === item.id
        && foundry.utils.getProperty(effect, "flags.gum.source") === EQUIPMENT_GRANTED_EFFECT_SOURCE
    );
    if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id));

    const sourceSystem = item._source?.system || item.system;
    const resolution = resolveEquipment(sourceSystem);
    const grants = collectActiveEquipmentGrantedEffects(sourceSystem, resolution);
    if (!grants.length) return;

    const targets = buildActorEffectTargets(actor);
    for (const grant of grants) {
        const effectItem = await fromUuid(grant.effectUuid).catch(() => null);
        if (!effectItem) {
            console.warn(`GUM | Efeito concedido não encontrado: ${grant.effectUuid}`);
            continue;
        }
        try {
            const actionIds = grant.domain === "source_attack"
                ? getEffectActions(effectItem.system)
                    .filter(action => ["roll_modifier", "combat_modifier"].includes(action.type))
                    .map(action => action.id)
                : null;
            if (grant.domain === "source_attack" && !actionIds.length) {
                console.warn(`GUM | Efeito de ataque "${grant.label}" não possui ações de rolagem ou combate compatíveis.`);
                continue;
            }
            await applySingleEffect(effectItem, targets, {
                actor,
                origin: item,
                source: EQUIPMENT_GRANTED_EFFECT_SOURCE,
                stackingDomain: "managed",
                originItemId: item.id,
                skipInstantEffects: true,
                durationOverride: { isPermanent: true, inCombat: false, _uiMode: "permanent" },
                actionIds,
                gumFlags: { equipmentGrant: {
                    domain: grant.domain,
                    originItemId: item.id,
                    attackType: grant.attackType,
                    selectorField: grant.selectorField,
                    selectorValue: grant.selectorValue,
                    sourceModifierId: grant.sourceModifierId,
                    sourceFeatureId: grant.featureId
                }}
            });
        } catch (error) {
            console.error(`GUM | Falha ao aplicar efeito concedido "${grant.label}":`, error);
        }
    }
}

async function reconcileEquipmentModifierGrantedEffects() {
    if (!game.user?.isGM) return;
    for (const actor of game.actors || []) {
        for (const item of actor.items || []) {
            if (item.type !== "equipment") continue;
            const sourceSystem = item._source?.system || item.system;
            const grants = collectActiveEquipmentGrantedEffects(sourceSystem);
            const existing = Array.from(actor.effects || []).filter(effect =>
                foundry.utils.getProperty(effect, "flags.gum.originItemId") === item.id
                && foundry.utils.getProperty(effect, "flags.gum.source") === EQUIPMENT_GRANTED_EFFECT_SOURCE
            );
            const expectedIds = new Set(grants.map(grant => String(grant.featureId)));
            const existingIds = new Set(existing.map(effect => String(foundry.utils.getProperty(effect, "flags.gum.equipmentGrant.sourceFeatureId") || "")));
            const setsMatch = expectedIds.size === existingIds.size
                && [...expectedIds].every(id => existingIds.has(id))
                && !existingIds.has("");
            if (!setsMatch) await syncEquipmentModifierGrantedEffects(item);
        }
    }
}

function _matchesCombatModifierEntry(entry, item, attack, attackType) {
    if (!_matchesRollModifierItemFilter(entry, item)) return false;
    if (!_matchesRollModifierAttackFilter(entry, attack)) return false;
    const context = String(entry?.attack_context || "attack");
    if (context === "attack_melee" && attackType !== "melee") return false;
    if (context === "attack_ranged" && attackType !== "ranged") return false;
    return true;
}

function _collectCombatModifierEntries(actor, item, attack, attackType) {
    const entries = [];
    for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
        if (effect?.disabled || effect?.isSuppressed) continue;
        if (!matchesEquipmentGrantedEffectScope(effect, item, attack, attackType)) continue;
        const data = foundry.utils.getProperty(effect, "flags.gum.combatModifier");
        for (const entry of data?.entries || []) {
            if (_resolveRollModifierApplicationSide(entry, data) !== "self") continue;
            if (_matchesCombatModifierEntry(entry, item, attack, attackType)) entries.push({ entry, evaluationActor: actor });
        }
    }
    return entries;
}

function _collectTargetCombatModifierEntries(actor, item, attack, attackType, rollData = {}) {
    const entries = [];
    const targets = _resolveCounterTargetsForRoll(rollData);
    if (targets.length !== 1) return entries;
    for (const targetToken of targets) {
        const targetActor = targetToken?.actor;
        if (!targetActor || targetActor === actor) continue;
        for (const effect of Array.from(targetActor.appliedEffects ?? targetActor.effects ?? [])) {
            if (effect?.disabled || effect?.isSuppressed) continue;
            if (!matchesEquipmentGrantedEffectScope(effect, item, attack, attackType)) continue;
            const data = foundry.utils.getProperty(effect, "flags.gum.combatModifier");
            for (const entry of data?.entries || []) {
                if (_resolveRollModifierApplicationSide(entry, data) !== "vs_targeter") continue;
                if (_matchesCombatModifierEntry(entry, item, attack, attackType)) entries.push({ entry, evaluationActor: targetActor });
            }
        }
    }
    return entries;
}

function _resolveConditionalDamageValue(actor, entry, rollData) {
    let selected = entry?.damage_value ?? 0;
    try {
        selected = resolveConditionalValue(selected, { actor, rollData });
    } catch (error) {
        console.warn("GUM | Falha ao avaliar modificador condicional de dano:", error);
        return 0;
    }
    if (entry?.defer_value_evaluation && entry?.damage_value_mode === "per_origin_level") {
        const level = Math.max(1, Number(entry.origin_level) || 1);
        if (/^[+-]?\d+(?:\.\d+)?$/.test(String(selected).trim())) return Number(selected) * level;
        if (["extra_dice", "override"].includes(entry.damage_operation)) {
            return Array.from({ length: level }, () => `(${selected})`).join("+");
        }
    }
    return selected;
}

function _evaluateCombatAttackValue(actor, entry, rollData = {}) {
    return _evaluateModifierEntryValue(actor, {
        value: entry?.attack_value ?? 0,
        value_mode: entry?.attack_value_mode,
        origin_level: entry?.attack_origin_level,
        defer_value_evaluation: entry?.attack_defer_value_evaluation
    }, rollData, { allowDice: false });
}

function _applyFormulaDamageChange(formula, evaluationActor, damageActor, entry, change, rollData) {
    const rawValue = _resolveConditionalDamageValue(evaluationActor, { ...entry, ...change, damage_value: change.value, damage_operation: change.operation, damage_value_mode: change.value_mode }, rollData);
    const rawCap = _evaluateModifierValue(evaluationActor, change.cap, rollData, { allowDice: false });
    const damageCap = Number.isFinite(rawCap) && rawCap > 0 ? Math.abs(rawCap) : null;
    if (change.operation === "override") {
        const replacement = resolveAttackDamageDisplay(String(rawValue || "0"), damageActor?.system?.attributes || {});
        return damageCap ? `{(${replacement}),${damageCap}}kl` : replacement;
    }
    if (change.operation === "extra_dice") {
        if (!String(rawValue).trim() || String(rawValue).trim() === "0") return formula;
        const addition = damageCap ? `{(${rawValue}),${damageCap}}kl` : `(${rawValue})`;
        return `(${formula})+${addition}`;
    }
    const numeric = _evaluateModifierValue(evaluationActor, rawValue, rollData, { allowDice: false });
    if (!Number.isFinite(numeric) || numeric === 0) return formula;
    const multiplier = change.operation === "per_die"
        ? Math.max(1, Array.from(String(formula).matchAll(/(\d+)d(?:6)?/gi)).reduce((sum, match) => sum + Number(match[1] || 0), 0))
        : 1;
    const uncappedBonus = numeric * multiplier;
    const bonus = damageCap ? Math.sign(uncappedBonus) * Math.min(Math.abs(uncappedBonus), damageCap) : uncappedBonus;
    return `(${formula})${bonus >= 0 ? "+" : ""}${bonus}`;
}

export function resolveCombatDamageProfile(actor, item, attack, attackType, { includeTargeted = false, rollData = {} } = {}) {
    const profile = {
        main: { formula: attack?.damage_formula || "", type: attack?.damage_type || "", nature: attack?.damage_nature || "", armor_divisor: attack?.armor_divisor || 1 },
        follow_up: foundry.utils.deepClone(attack?.follow_up_damage || {}),
        fragmentation: foundry.utils.deepClone(attack?.fragmentation_damage || {})
    };
    profile.main.formula = resolveAttackDamageDisplay(profile.main.formula, actor?.system?.attributes || {});
    const damageRollData = { ...rollData, itemId: item?.id, itemName: item?.name, attackId: attack?.id, attackType, type: "damage" };
    const candidates = _collectCombatModifierEntries(actor, item, attack, attackType);
    if (includeTargeted) candidates.push(..._collectTargetCombatModifierEntries(actor, item, attack, attackType, damageRollData));
    for (const { entry, evaluationActor } of candidates) {
        if (!entry.damage_enabled) continue;
        const changes = entry.damage_changes?.length ? entry.damage_changes : [{ component: "main", property: "formula", operation: entry.damage_operation, value: entry.damage_value, value_mode: entry.damage_value_mode, cap: entry.damage_cap, origin_level: entry.origin_level, defer_value_evaluation: entry.defer_value_evaluation }];
        for (const rawChange of changes) {
            const legacyProperty = rawChange.property || "formula";
            const change = legacyProperty === "formula" ? rawChange : {
                ...rawChange,
                operation: "fixed",
                value: 0,
                replace_armor_divisor: rawChange.replace_armor_divisor ?? (legacyProperty === "armor_divisor" ? rawChange.value : ""),
                replace_type: rawChange.replace_type ?? (legacyProperty === "type" ? rawChange.value : ""),
                replace_nature: rawChange.replace_nature ?? (legacyProperty === "nature" ? rawChange.value : "")
            };
            const component = profile[change.component] || profile.main;
            const baseFormula = resolveAttackDamageDisplay(component.formula || "0", actor?.system?.attributes || {});
            component.formula = _applyFormulaDamageChange(baseFormula, evaluationActor, actor, entry, change, damageRollData);

            const resolveReplacement = replacement => _resolveConditionalDamageValue(evaluationActor, {
                ...entry,
                damage_value: replacement,
                damage_value_mode: "fixed",
                defer_value_evaluation: false
            }, damageRollData);
            if (String(change.replace_armor_divisor ?? "").trim()) {
                const divisor = Number(resolveReplacement(change.replace_armor_divisor));
                if (Number.isFinite(divisor) && divisor > 0) component.armor_divisor = divisor;
            }
            if (String(change.replace_type ?? "").trim()) {
                const type = String(resolveReplacement(change.replace_type) ?? "").trim();
                if (type && type !== "0") component.type = type;
            }
            if (String(change.replace_nature ?? "").trim()) {
                const nature = String(resolveReplacement(change.replace_nature) ?? "").trim();
                if (nature && nature !== "0") component.nature = resolveDamageNature(nature) || nature;
            }
        }
    }
    return profile;
}

export function resolveCombatDamageFormula(actor, item, attack, attackType, rollData = {}) {
    return resolveCombatDamageProfile(actor, item, attack, attackType, { includeTargeted: true, rollData }).main.formula;
}

async function renderSpecializedSkillNames(app, html) {
    const root = html?.[0] || html;
    if (!root?.querySelectorAll) return;

    const pack = app?.collection?.metadata ? app.collection : game.packs.get(app?.options?.collection);
    const entries = pack
        ? await pack.getIndex({ fields: ["type", "system.specialization"] })
        : Array.from(game.items?.contents || []);
    const skillsById = new Map(entries
        .filter(item => item.type === "skill" && String(item.system?.specialization || "").trim())
        .map(item => [item.id || item._id, item]));

    for (const row of root.querySelectorAll("[data-document-id], [data-entry-id]")) {
        const id = row.dataset.documentId || row.dataset.entryId;
        const skill = skillsById.get(id);
        if (!skill) continue;
        const label = row.querySelector(".entry-name, .document-name");
        setDirectoryEntryLabel(label, getSkillDisplayName(skill));
    }
}

Hooks.on("renderCompendium", renderSpecializedSkillNames);
Hooks.on("renderItemDirectory", renderSpecializedSkillNames);
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

// Foundry V13 replaced the jQuery-based hook with an HTMLElement-based hook.
// Prefer the modern hook whenever the version cannot be identified, so a missing
// release descriptor never registers the deprecated listener on current Foundry.
const foundryGeneration = Number(game.release?.generation ?? game.version?.split(".")?.[0] ?? 13);
const testRequestChatRenderHook = foundryGeneration >= 13
    ? "renderChatMessageHTML"
    : "renderChatMessage";
Hooks.on(testRequestChatRenderHook, (_message, html) => { activateTestRequestChatListeners(html); activateRollRequestChatListeners(html); });

const isCombatDuration = (duration = {}) => {
    if (!duration || typeof duration !== "object") return false;
    return duration.inCombat === true && !isEffectDurationPermanent(duration);
};

const normalizeTokenIconPolicy = (value) => {
    const normalized = (value ?? "").toString().trim().toLowerCase();

    if (["always", "always_show", "show", "on", "true", "1", "sempre"].includes(normalized)) return "always";
    if (["never", "never_show", "hide", "off", "false", "0", "nunca"].includes(normalized)) return "never";
    if (["auto", "automatic", "automático", "automatico", "default", "padrão", "padrao"].includes(normalized)) return "auto";

    return "auto";
};

const shouldShowTokenIconForSystem = (effectSystem = {}, duration = {}) => {
    const policy = normalizeTokenIconPolicy(effectSystem.tokenIconPolicy);
    if (policy === "always") return true;
    if (policy === "never") return false;
    return !isEffectDurationPermanent(duration);
};

const getActiveEffectShowIconModeForSystem = (effectSystem = {}, duration = {}) => {
    return shouldShowTokenIconForSystem(effectSystem, duration) ? 2 : 0;
};

const resolveTokenIconImageForSystem = (effectItem, effectSystem = {}, duration = {}) => {
    if (!shouldShowTokenIconForSystem(effectSystem, duration)) return null;
    const statusId = effectSystem.type === "status" ? effectSystem.statusId : effectSystem.attachedStatusId;
    if (statusId) {
        const statusEffect = CONFIG.statusEffects.find((effect) => effect.id === statusId);
        return statusEffect?.icon ?? statusEffect?.img ?? effectItem?.img ?? null;
    }
    return effectItem?.img ?? null;
};

async function migrateEffectTokenIconPolicy() {
    if (!game.user?.isGM) return;

    const migrationFlag = "effectTokenIconPolicyMigration";
    const alreadyMigrated = game.settings?.get?.("gum", migrationFlag);
    if (alreadyMigrated) return;

    const updateQueue = [];
    const collectMissingPolicyUpdates = (items) => {
        for (const item of items || []) {
            if (item?.type !== "effect") continue;
            const currentPolicy = normalizeTokenIconPolicy(item.system?.tokenIconPolicy);
            if (item.system?.tokenIconPolicy === currentPolicy) continue;
            updateQueue.push(item.update({ "system.tokenIconPolicy": currentPolicy }, { renderSheet: false }));
        }
    };

    collectMissingPolicyUpdates(game.items?.contents || []);
    for (const actor of game.actors?.contents || []) {
        collectMissingPolicyUpdates(actor.items?.contents || []);
    }

    if (updateQueue.length > 0) {
        await Promise.allSettled(updateQueue);
        console.log(`GUM | Migração de tokenIconPolicy concluída em ${updateQueue.length} item(ns) de efeito.`);
    }

    await game.settings.set("gum", migrationFlag, true);
}

async function migrateEffectActionsSchema() {
    if (!game.user?.isGM) return;

    const migrationFlag = "effectActionsSchemaMigrationV2";
    const alreadyMigrated = game.settings?.get?.("gum", migrationFlag);
    if (alreadyMigrated) return;

    const queue = [];
    const migrateItem = (item) => {
        if (item?.type !== "effect") return;
        const actions = getEffectActions(item.system || {});
        const firstAction = actions[0] || {};
        queue.push(item.update({
            "system.schemaVersion": 2,
            "system.actions": actions,
            "system.type": firstAction.type ?? item.system?.type ?? "attribute",
            "system.path": firstAction.path ?? "",
            "system.operation": firstAction.operation ?? "ADD",
            "system.value": firstAction.value ?? "",
            "system.attribute_chat_visibility": firstAction.attribute_chat_visibility ?? "public",
            "system.key": firstAction.key ?? "",
            "system.flag_value": firstAction.flag_value ?? "",
            "system.chat_text": firstAction.chat_text ?? "",
            "system.has_roll": Boolean(firstAction.has_roll),
            "system.roll_label": firstAction.roll_label ?? "Rolar Teste",
            "system.roll_attribute": firstAction.roll_attribute ?? "ht",
            "system.roll_modifier": firstAction.roll_modifier ?? "0",
            "system.roll_modifier_value": firstAction.roll_modifier_value ?? 0,
            "system.roll_modifier_cap": firstAction.roll_modifier_cap ?? "",
            "system.roll_modifier_context": firstAction.roll_modifier_context ?? "all",
            "system.roll_modifier_source_item_ids": firstAction.roll_modifier_source_item_ids ?? "",
            "system.roll_modifier_source_attack_ids": firstAction.roll_modifier_source_attack_ids ?? "",
            "system.roll_modifier_entries": firstAction.roll_modifier_entries ?? [],
            "system.roll_visibility": firstAction.roll_visibility ?? "owners",
            "system.whisperMode": firstAction.whisperMode ?? "public",
            "system.category": firstAction.category ?? "hp",
            "system.name": firstAction.name ?? "",
            "system.chat_notice": Boolean(firstAction.chat_notice),
            "system.confirm_prompt": Boolean(firstAction.confirm_prompt),
            "system.variable_value": Boolean(firstAction.variable_value),
            "system.statusId": firstAction.statusId ?? ""
        }, { renderSheet: false }));
    };

    for (const item of game.items?.contents || []) migrateItem(item);
    for (const actor of game.actors?.contents || []) {
        for (const item of actor.items?.contents || []) migrateItem(item);
    }

    if (queue.length > 0) {
        await Promise.allSettled(queue);
        console.log(`GUM | Migração de ações de efeito concluída em ${queue.length} item(ns).`);
    }

    await game.settings.set("gum", migrationFlag, true);
}

async function migrateBasicDamageSchema() {
    if (!game.user?.isGM || game.settings.get("gum", "basicDamageSchemaMigrationV1")) return;
    const updates = [];
    for (const actor of game.actors?.contents || []) {
        if (actor.type !== "character") continue;
        const update = {};
        for (const key of BASIC_DAMAGE_KEYS) {
            const current = actor._source?.system?.attributes?.[key] ?? actor.system?.attributes?.[key];
            if (current && typeof current === "object" && !Array.isArray(current)) continue;
            update[`system.attributes.${key}`] = normalizeBasicDamageData(current, key === "thrust_damage" ? "1d6-2" : key === "swing_damage" ? "1d6" : "");
        }
        if (Object.keys(update).length) updates.push(actor.update(update, { render: false }));
    }
    await Promise.allSettled(updates);
    await game.settings.set("gum", "basicDamageSchemaMigrationV1", true);
}

function getDefaultSkillRollFormula() {
    const fallback = "3d6";
    const rawFormula = game.settings?.get?.("gum", "defaultSkillRollFormula");
    const formula = (rawFormula ?? "").toString().trim() || fallback;

    try {
        new Roll(formula);
        return formula;
    } catch (_err) {
        console.warn(`GUM | Fórmula inválida em defaultSkillRollFormula (${formula}). Usando ${fallback}.`);
        return fallback;
    }
}

export function applyCurrentRollPrivacy(chatData, { force = false, rollMode = null } = {}) {
    if (!chatData || typeof chatData !== "object") return chatData;

    const hasExplicitPrivacy = chatData.whisper !== undefined || chatData.blind !== undefined || chatData.rollMode !== undefined;
    if (hasExplicitPrivacy && !force && !rollMode) return chatData;
    return applyRollPrivacy(chatData, rollMode || getCurrentRollPrivacyMode());
}
// ================================================================== //
//  ✅ CLASSE DO ATOR (GURPS ACTOR) - ATUALIZADA COM MODIFICADORES DE EQUIPAMENTO
// ================================================================== //
class GurpsActor extends Actor {
    
    prepareData() {
        super.prepareData();
        this._prepareCharacterItems(); 
    }

_prepareCharacterItems() {
        const actorData = this; 
        const attributes = actorData.system.attributes;
        const combat = actorData.system.combat;
        const normalizeEffectPath = (path) => {
            if (!path || typeof path !== "string") return path;
            let normalized = path.trim();
            if (normalized.startsWith("actor.")) {
                normalized = normalized.slice(6);
            }
            if (normalized.startsWith("data.")) {
                normalized = normalized.replace(/^data\./, "system.");
            }
            if (!normalized.startsWith("system.")
                && !normalized.startsWith("flags.")
                && !normalized.startsWith("effects.")
                && !normalized.startsWith("items.")) {
                if (normalized.startsWith("attributes.") || normalized.startsWith("combat.") || normalized.startsWith("resources.")) {
                    normalized = `system.${normalized}`;
                }
            }
            return normalized;
        };
        const getEffectChangeType = (change) => {
            if (change?.type) return change.type;
            const legacyMode = change?._source?.mode ?? change?.toObject?.()?.mode;
            if (legacyMode !== undefined) {
                switch (legacyMode) {
                    case 5:
                        return "override";
                    case 1:
                        return "multiply";
                    case 2:
                        return "add";
                    default:
                        return null;
                }
            }
            if (CONST.ACTIVE_EFFECT_CHANGE_TYPES) return null;
            switch (change?.mode) {
                case CONST.ACTIVE_EFFECT_MODES?.OVERRIDE:
                    return "override";
                case CONST.ACTIVE_EFFECT_MODES?.MULTIPLY:
                    return "multiply";
                case CONST.ACTIVE_EFFECT_MODES?.ADD:
                    return "add";
                default:
                    return null;
            }
        };

        // --- ETAPA 0: RESETAR VALORES ---
prepareBasicDamageAttributes(attributes);
const allAttributes = ['st', 'dx', 'iq', 'ht', 'vont', 'per', 'hp', 'fp', 'mt', 'basic_speed', 'basic_move', 'enhanced_move', 'lifting_st', 'dodge',
            'vision', 'hearing', 'tastesmell', 'touch', ...PHYSICAL_FEAT_ATTRIBUTE_KEYS];
        [...allAttributes, ...BASIC_DAMAGE_KEYS].forEach(attr => {
            if (attributes[attr]) {
                attributes[attr].temp = 0;
                attributes[attr].passive = 0;
                attributes[attr].override = null;
            }
        });
const activeEffects = Array.isArray(this.effects) ? this.effects : Array.from(this.effects?.values?.() || []);
        combat.dr_temp_mods = {};
        combat.dr_passive_mods = {};
        combat.dr_overrides = {};
        for (const effect of activeEffects) {
            const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
            const isPendingCombat = gumDuration.pendingCombat === true;
            const isPendingStart = gumDuration.pendingStart === true;
            if (effect?.disabled || effect?.isSuppressed || isPendingCombat || isPendingStart) continue;
            for (const change of effect?.changes || []) {
                const normalizedPath = normalizeEffectPath(change.key);
                const drChange = parseDamageResistanceEffectPath(normalizedPath);
                if (drChange) {
                    const changeType = getEffectChangeType(change);
                    const isPermanent = gumDuration._uiMode === "permanent" || gumDuration.isPermanent === true;
                    const layer = changeType === "override" || drChange.requestedLayer === "overrides"
                        ? "dr_overrides"
                        : drChange.requestedLayer === "temp_mods"
                            ? "dr_temp_mods"
                            : drChange.requestedLayer === "passive_mods"
                                ? "dr_passive_mods"
                                : isPermanent ? "dr_passive_mods" : "dr_temp_mods";
                    const targetPath = `${layer}.${drChange.location}.${drChange.damageType}`;
                    const numericValue = Number(change.value) || 0;
                    const currentValue = foundry.utils.getProperty(combat, targetPath) ?? 0;
                    foundry.utils.setProperty(combat, targetPath,
                        layer === "dr_overrides" ? numericValue : Number(currentValue) + numericValue);
                    continue;
                }
                if (!normalizedPath?.startsWith("system.attributes.")) continue;
                if (!normalizedPath.endsWith(".passive") && !normalizedPath.endsWith(".temp") && !normalizedPath.endsWith(".override")) continue;
                let value = change.value;
                if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
                    value = Number(value);
                }
                const currentVal = foundry.utils.getProperty(this, normalizedPath) ?? 0;
                const changeType = getEffectChangeType(change);
                if (changeType === "override") {
                    foundry.utils.setProperty(this, normalizedPath, value);
                } else if (changeType === "multiply") {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal * numericValue);
                } else if (changeType === "add") {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal + numericValue);
                }
            }
        }
        
        // (Removido: combat.defense_bonus = 0)

        // --- ETAPA 1: PRÉ-PROCESSAMENTO DE ITENS (MODIFICADORES DE EQUIPAMENTO) ---
        for (const item of this.items) {
            if (item.type === 'equipment') {
                const resolution = resolveEquipment(item._source?.system || item.system);
                item.system.equipmentResolution = resolution;
                item.system.effectiveWeight = resolution.weight.unitFinal;
                item.system.effectiveCost = resolution.cost.unitFinal;
                item.system.effectiveUsesMax = resolution.uses.max;
                item.system.effectiveUsesRemaining = resolution.uses.remaining;
                item.system.resolvedDescriptors = resolution.descriptors;
                item.system.melee_attacks = resolution.meleeAttacks;
                item.system.ranged_attacks = resolution.rangedAttacks;
                item.system.ammunition = resolution.ammunition;
                item.system.dr_locations = resolution.drLocations;
                for (const [path, value] of Object.entries(resolution.properties)) {
                    if (value !== undefined) item.system[path] = value;
                }
                
                // (Removido: Lógica de somar DB ao combat.defense_bonus)
            }
        }
        const activeEquipmentDefenseBonusSources = collectActiveEquipmentDefenseBonuses(this.items);
        const activeEquipmentDefenseBonus = activeEquipmentDefenseBonusSources.reduce((total, source) => total + source.bonus, 0);
        combat.active_equipment_defense_bonus = activeEquipmentDefenseBonus;
        combat.active_equipment_defense_bonus_sources = activeEquipmentDefenseBonusSources;
        const activeEquipmentOwnerModifiers = collectActiveEquipmentOwnerModifiers(this.items);

        // --- ETAPA 2: MOTOR DE CONDIÇÕES ---
const add_sub_modifiers = {};
        const set_modifiers = {};
        const resolveConditionEffect = (link) => {
            if (!link) return null;
            if (link.type) return link;
            if (link.system?.type) return link.system;
            return null;
        };
        const conditions = this.items.filter(i => i.type === "condition"); 
        
        for (const condition of conditions) {
            if (condition.system?.bindingMode === "status-link") continue;
            if (condition.getFlag("gum", "manual_override")) continue;
            let isConditionActive = false;
            try {
                isConditionActive = !condition.system.when || Function("actor", "game", "eventData", `return ( ${condition.system.when} )`)(this, game, null); 
            } catch (e) { console.warn(`GUM | Erro na regra da condição "${condition.name}":`, e); }
            
            if (isConditionActive) {
                const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
                for (const link of effects) {
                    if (link?.uuid) continue;
                    const effect = resolveConditionEffect(link);
                    if (effect?.type === 'attribute' && effect.path) {
                        const normalizedPath = normalizeEffectPath(effect.path);
                        let value = 0;
                        try {
                            value = typeof effect.value === "string" ? new Function("actor", "game", `return (${effect.value});`)(this, game) : (Number(effect.value) || 0); 
                        } catch (e) { console.warn(`GUM | Erro ao avaliar valor do efeito em "${condition.name}":`, e); }
                        
                        if (effect.operation === "SET" || effect.operation === "OVERRIDE") {
                            set_modifiers[normalizedPath] = value;
                        } else {
                            let tempPath = normalizedPath.endsWith('.passive') ? normalizedPath.replace('.passive', '.temp') : normalizedPath;
                            if (!add_sub_modifiers[tempPath]) add_sub_modifiers[tempPath] = 0;
                            if (effect.operation === "ADD") add_sub_modifiers[tempPath] += value;
                            else if (effect.operation === "SUB") add_sub_modifiers[tempPath] -= value;
                        }
                    } 
                }
            }
        }

        // --- ETAPA 3: APLICAR MODIFICADORES DE SOMA/SUBTRAÇÃO ---
        for (const path in add_sub_modifiers) {
            const currentVal = foundry.utils.getProperty(this, path) || 0; 
            foundry.utils.setProperty(this, path, currentVal + add_sub_modifiers[path]);
        }
        // Bônus de atributo concedidos por equipamento participam da mesma
        // camada passiva dos efeitos, antes dos cálculos derivados.
        for (const attr of allAttributes) {
            if (!attributes[attr]) continue;
            attributes[attr].passive = (Number(attributes[attr].passive) || 0)
                + equipmentAttributeBonus(activeEquipmentOwnerModifiers, attr);
        }

        // --- ETAPA 4: CÁLCULOS INTERMEDIÁRIOS (FINAL_COMPUTED) ---
        for (const attr of allAttributes) {
            if (attributes[attr] && !['hp', 'fp'].includes(attr)) {
                attributes[attr].final_computed = (Number(attributes[attr].value) || 0) 
                                                + (Number(attributes[attr].mod) || 0) 
                                                + (Number(attributes[attr].passive) || 0) 
                                                + (Number(attributes[attr].temp) || 0);
            }
        }
        for (const pool of ["hp", "fp"]) {
            if (attributes[pool]) {
                attributes[pool].final_computed = (Number(attributes[pool].max) || 0) 
                                                + (Number(attributes[pool].mod) || 0) 
                                                + (Number(attributes[pool].passive) || 0) 
                                                + (Number(attributes[pool].temp) || 0);
            }
        }
        // --- CÁLCULO DE SENTIDOS (Independentes, Base 10) ---
        const senses = ['vision', 'hearing', 'tastesmell', 'touch'];

        for (const sense of senses) {
            if (!attributes[sense] || typeof attributes[sense] !== "object") {
                attributes[sense] = {};
            }

            const senseData = attributes[sense];
            if (senseData.value === undefined || senseData.value === null || Number.isNaN(Number(senseData.value))) {
                senseData.value = 10;
            }

            // Se o valor for 0 ou nulo (antigo), assume 10. Se não, usa o valor do input.
            const base = Number(senseData.value) || 10;
            const mod = (Number(senseData.mod) || 0)
                + (Number(senseData.passive) || 0)
                + (Number(senseData.temp) || 0);

            senseData.final = base + mod;

            if (senseData.override !== null && senseData.override !== undefined) {
                senseData.final = senseData.override;
            }
        }

        // Carga e Levantamento
        const pendingLiftingOverride = set_modifiers["system.attributes.lifting_st.override"];
        const liftingST = pendingLiftingOverride ?? attributes.lifting_st.override ?? attributes.lifting_st.final_computed;
        const pendingBasicLiftOverride = set_modifiers["system.attributes.basic_lift.override"];
        prepareBasicLiftAttribute(attributes, { liftingStrength: liftingST });
        if (pendingBasicLiftOverride !== undefined) attributes.basic_lift.override = pendingBasicLiftOverride;
        const basicLift = prepareBasicLiftAttribute(attributes, { liftingStrength: liftingST }).final;
        
        let totalWeight = 0;
        const ignoreCarried = this.system.encumbrance.ignore_carried_weight;
        const ignoreEquipped = this.system.encumbrance.ignore_equipped_weight;
        for (let i of this.items) { 
            if ((i.type === 'equipment' || i.system.hasOwnProperty('weight'))) {
                const weight = i.system.effectiveWeight !== undefined ? i.system.effectiveWeight : (i.system.weight || 0);
                const quantity = i.system.quantity || 1;
                const loc = i.system.location;
                
                if ((loc === 'equipped' && !ignoreEquipped) || (loc === 'carried' && !ignoreCarried)) {
                    totalWeight += weight * quantity;
                }
            }
        }

        let enc = { level_name: "none", level_value: 0, penalty: 0 };
        if (totalWeight > basicLift * 6) enc = { level_name: "extraHeavy", level_value: 4, penalty: -4 };
        else if (totalWeight > basicLift * 3) enc = { level_name: "heavy", level_value: 3, penalty: -3 };
        else if (totalWeight > basicLift * 2) enc = { level_name: "medium", level_value: 2, penalty: -2 };
        else if (totalWeight > basicLift) enc = { level_name: "light", level_value: 1, penalty: -1 };
        
        foundry.utils.mergeObject(this.system.encumbrance, { 
            total_weight: Math.round(totalWeight * 100) / 100,
            level_name: enc.level_name,
            level_value: enc.level_value,
            levels: {
                none: basicLift.toFixed(2), light: (basicLift * 2).toFixed(2),
                medium: (basicLift * 3).toFixed(2), heavy: (basicLift * 6).toFixed(2),
                xheavy: (basicLift * 10).toFixed(2)
            }
        });
        const levels = this.system.encumbrance.levels;
        const maxEncumbrance = Number(levels.xheavy) || 0;
        const progressPercent = maxEncumbrance > 0
            ? Math.min(100, Math.max(0, (totalWeight / maxEncumbrance) * 100))
            : 0;

        this.system.encumbrance.max_capacity = Math.round(maxEncumbrance * 100) / 100;
        this.system.encumbrance.progress_percent = Math.round(progressPercent * 100) / 100;
this.system.encumbrance.level_data = [
  { id: 'none', max: levels.none },
  { id: 'light', max: levels.light },
  { id: 'medium', max: levels.medium },
  { id: 'heavy', max: levels.heavy },
  { id: 'extraHeavy', max: levels.xheavy }
].map((level, idx, arr) => {
  const numericMax = Number(level.max) || 0;
  const markerPercent = maxEncumbrance > 0
    ? Math.min(100, Math.max(0, (numericMax / maxEncumbrance) * 100))
    : 0;

  // Limite inferior (para texto "acima de")
  const prevMax = idx === 0 ? 0 : (Number(arr[idx - 1].max) || 0);

  const penalty = idx === 0 ? 0 : -idx; // 0, -1, -2, -3, -4

  return {
    ...level,
    marker_percent: Math.round(markerPercent * 100) / 100,

    // Campos novos (não quebram nada se não usados)
    min: Math.round(prevMax * 100) / 100,
    barrier_tooltip: `${numericMax.toFixed(2)} kg`,
    penalty,
    is_divider: idx < arr.length - 1
  };
});

this.system.encumbrance.segment_labels = this.system.encumbrance.level_data.map((level, idx, arr) => {
  const segmentStart = idx === 0 ? 0 : (Number(arr[idx - 1].max) || 0);
  const segmentEnd = Number(level.max) || 0;
  const midpoint = maxEncumbrance > 0
    ? ((segmentStart + segmentEnd) / 2 / maxEncumbrance) * 100
    : 0;

  return {
    id: level.id,
    midpoint_percent: Math.round(Math.min(100, Math.max(0, midpoint)) * 100) / 100
  };
});

        // --- DEFESAS ATIVAS ---
        const finalBasicSpeedComputed = attributes.basic_speed.final_computed;
        const importedFixedDodgeRaw = attributes.dodge.gcs_imported_fixed;
        const importedFixedDodge = Number(importedFixedDodgeRaw);
        const hasImportedFixedDodge = importedFixedDodgeRaw !== null
            && importedFixedDodgeRaw !== undefined
            && importedFixedDodgeRaw !== ""
            && Number.isFinite(importedFixedDodge);
        attributes.dodge.value = hasImportedFixedDodge
            ? importedFixedDodge
            : Math.floor(finalBasicSpeedComputed) + 3;
        attributes.dodge.final_computed = attributes.dodge.value 
                                        + enc.penalty 
                                        + (attributes.dodge.mod || 0) 
                                        + (attributes.dodge.passive || 0) 
                                        + (attributes.dodge.temp || 0);

        attributes.basic_move.final_computed = Math.floor(attributes.basic_move.final_computed * (1 - (enc.level_value * 0.2)));

        // --- ETAPA 5: APLICAR MODIFICADORES DE "SET" ---
        for (const path in set_modifiers) {
            foundry.utils.setProperty(this, path, set_modifiers[path]);
        }
        prepareBasicDamageAttributes(attributes);
        const basicMoveForFeats = attributes.basic_move.override !== null && attributes.basic_move.override !== undefined
            ? attributes.basic_move.override
            : attributes.basic_move.final_computed;
        const liftingStrengthForFeats = attributes.lifting_st.override !== null && attributes.lifting_st.override !== undefined
            ? attributes.lifting_st.override
            : attributes.lifting_st.final_computed;
        const healthForFeats = attributes.ht.override !== null && attributes.ht.override !== undefined
            ? attributes.ht.override
            : attributes.ht.final_computed;
        preparePhysicalFeatAttributes(attributes, {
            basicMove: basicMoveForFeats,
            liftingStrength: liftingStrengthForFeats,
            health: healthForFeats
        });

        // --- ETAPA 6: CÁLCULO FINALÍSSIMO ---
        for (const attr of allAttributes) {
            if (attributes[attr]) {
                const override = attributes[attr].override;
                const resolved = (override !== null && override !== undefined) ? override : attributes[attr].final_computed;
                attributes[attr].final = Number(resolved) || 0;
            }
        }
        // Equipment DB is the last additive layer so item effects and overrides
        // remain intact while the displayed/rolled Dodge includes the active DB.
        attributes.dodge.final = applyEquipmentDefenseBonus(attributes.dodge.final, activeEquipmentDefenseBonus);

        // --- ETAPA 7: CÁLCULO DE RD ---
 
        const profileId = combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);
        const effectiveBodyLocations = buildEffectiveBodyLocations({
            profile,
            additionalLocations: combat.additional_locations,
            equipment: Array.from(this.items)
        });
        const locationKeys = effectiveBodyLocations.order;
        const locationKeySet = new Set(locationKeys);
        const drFromArmor = {};

        combat.additional_locations = effectiveBodyLocations.additionalLocations;
        combat.dr_location_order = locationKeys;
        combat.dr_location_definitions = effectiveBodyLocations.definitions;
        combat.dr_location_sources = effectiveBodyLocations.sources;

        for (const key of locationKeys) {
            drFromArmor[key] = {};
        }

        for (let i of this.items) { 
            const hasArmorDR = (i.type === 'equipment')
                && i.system.location === 'equipped'
                && i.system.dr_locations;
            if (hasArmorDR) {
                const itemDrLocations = i.system.dr_locations || {};
                for (const [loc, drObject] of Object.entries(itemDrLocations)) {
                    if (loc === "all") {
                        for (const key of locationKeys) mergeDamageResistance(drFromArmor[key], drObject);
                        continue;
                    }
                    if (!locationKeySet.has(loc)) continue;
                     mergeDamageResistance(drFromArmor[loc], drObject);
                }
            }
        }

        const totalDr = {};
        const drMods = combat.dr_mods || {}; 
        const drTempMods = combat.dr_temp_mods || {};
        const drPassiveMods = combat.dr_passive_mods || {};
        const drOverrides = combat.dr_overrides || {};
        const resolveGlobalDRLayer = (layer, location) => {
            const resolved = {};
            mergeDamageResistance(resolved, layer?.all);
            mergeDamageResistance(resolved, layer?.[location]);
            return resolved;
        };
        const resolveGlobalDROverride = (layer, location) => {
            const global = layer?.all && typeof layer.all === "object" ? layer.all : {};
            const specific = layer?.[location] && typeof layer[location] === "object" ? layer[location] : {};
            return { ...global, ...specific };
        };
        const computedDr = {}; 
        for (let key of locationKeys) {
            const result = calculateDamageResistance({
                armor: drFromArmor[key],
                mod: resolveGlobalDRLayer(drMods, key),
                temp: resolveGlobalDRLayer(drTempMods, key),
                passive: resolveGlobalDRLayer(drPassiveMods, key),
                override: resolveGlobalDROverride(drOverrides, key)
            });
            computedDr[key] = result.computed;
            totalDr[key] = result.final;
        }
        combat.dr_final_computed = computedDr;
        combat.dr_locations = totalDr; 
        combat.dr_from_armor = drFromArmor;
        
          // --- ETAPA 8: CÁLCULO DE NH ---
        const evaluateRollReference = (rawReference, skillList) => {
            const source = String(rawReference ?? "").trim();
        return resolveRollReference(source || "DX", attributes, skillList);
        };

        const skills = this.items.filter(i => i.type === 'skill');
        const spellsAndPowers = this.items.filter(i => ['spell', 'power'].includes(i.type));
        const equipment = this.items.filter(i => ['melee_weapon', 'ranged_weapon', 'equipment'].includes(i.type));
        const actorActiveEffects = Array.from(this.appliedEffects ?? this.effects ?? []);

        const matchesEntryTargetForItem = (entry = {}, item = null) => {
           return _matchesRollModifierItemFilter(entry, item);
        };

        const matchesEntryContextForItem = (entry = {}, item, baseAttribute = null) => {
            return _matchesNhDisplayContextForItem(entry, item, baseAttribute);
        };

        const matchesEntryContextForAttack = (entry = {}, attackType) => {
            return _matchesNhDisplayContextForAttack(entry, attackType);
        };

        const matchesEntryContextForDefense = (entry = {}, defenseType) => {
            return _matchesNhDisplayContextForDefense(entry, defenseType);
        };

        const collectNhBonusesForItem = (item, baseAttribute = null) => {
            const bonus = { passive: 0, temp: 0 };
            for (const effect of actorActiveEffects) {
                if (!matchesEquipmentGrantedEffectScope(effect, item, null, "")) continue;
                const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
                if (!data) continue;
                const entries = Array.isArray(data.entries) && data.entries.length
                    ? data.entries
                    : [{ value: data.value, nh_display_mode: data.nh_display_mode ?? "roll_only", target_kind: data.target_kind ?? "any", target_mode: data.target_mode ?? "all", target_values: data.target_values ?? "" }];
                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                const isPermanent = gumDuration._uiMode === "permanent" || gumDuration.isPermanent === true;
                entries.forEach((entry) => {
                    if (!shouldIncludeInPermanentNh(entry)) return;
                    if (!matchesEntryTargetForItem(entry, item)) return;
                    if (!matchesEntryContextForItem(entry, item, baseAttribute)) return;
                    const value = _evaluateModifierEntryValue(this, entry, { itemId: item.id, type: item.type, itemName: item.name }, { allowDice: false });
                    if (!Number.isFinite(value) || value === 0) return;
                    if (isPermanent) bonus.passive += value;
                    else bonus.temp += value;
                });
            }
            return bonus;
        };

        const collectNhBonusesForAttack = (item, attack, attackType) => {
            const bonus = { passive: 0, temp: 0 };
            for (const effect of actorActiveEffects) {
                if (!matchesEquipmentGrantedEffectScope(effect, item, attack, attackType)) continue;
                const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
                if (!data) continue;
                const entries = Array.isArray(data.entries) && data.entries.length
                    ? data.entries
                    : [{ value: data.value, nh_display_mode: data.nh_display_mode ?? "roll_only", context: data.context ?? "all" }];
                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                const isPermanent = gumDuration._uiMode === "permanent" || gumDuration.isPermanent === true;
                entries.forEach((entry) => {
                    if (!shouldIncludeInPermanentNh(entry)) return;
                    if (!matchesEntryTargetForItem(entry, item)) return;
                    if (!_matchesRollModifierAttackFilter(entry, attack)) return;
                    if (!matchesEntryContextForAttack(entry, attackType)) return;
                    const value = _evaluateModifierEntryValue(this, entry, {
                        itemId: item.id,
                        type: item.type,
                        itemName: item.name,
                        attackId: attack?.id ?? null,
                        attackType
                    }, { allowDice: false });
                    if (!Number.isFinite(value) || value === 0) return;
                    if (isPermanent) bonus.passive += value;
                    else bonus.temp += value;
                });
            }
            return bonus;
        };

        const collectNhBonusesForDefense = (item, attack, attackType, defenseType) => {
            const bonus = { passive: 0, temp: 0 };
            for (const effect of actorActiveEffects) {
                if (!matchesEquipmentGrantedEffectScope(effect, item, attack, attackType)) continue;
                const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
                if (!data) continue;
                const entries = Array.isArray(data.entries) && data.entries.length
                    ? data.entries
                    : [{ value: data.value, nh_display_mode: data.nh_display_mode ?? "roll_only", context: data.context ?? "all" }];
                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                const isPermanent = gumDuration._uiMode === "permanent" || gumDuration.isPermanent === true;
                entries.forEach((entry) => {
                    if (!shouldIncludeInPermanentNh(entry)) return;
                    if (!matchesEntryTargetForItem(entry, item)) return;
                    if (!_matchesRollModifierAttackFilter(entry, attack)) return;
                    if (!matchesEntryContextForDefense(entry, defenseType)) return;
                    const value = _evaluateModifierEntryValue(this, entry, {
                        itemId: item.id,
                        type: "defense",
                        itemName: item.name,
                        attackId: attack?.id ?? null,
                        attackType,
                        defenseType
                    }, { allowDice: false });
                    if (!Number.isFinite(value) || value === 0) return;
                    if (isPermanent) bonus.passive += value;
                    else bonus.temp += value;
                });
            }
            return bonus;
        };
        
        const skillResolutionPasses = Math.max(2, skills.length);
        for (let pass = 0; pass < skillResolutionPasses; pass++) { 
            for (const i of skills) {
                try {
                    const attrVal = evaluateRollReference(i.system.base_attribute, skills).value;
                    const nhBase = Number(attrVal) || 0;
                    const nhLevel = Number(i.system.skill_level) || 0;
                    const nhMod = Number(i.system.nh_mod) || 0;
                    const nhBonuses = collectNhBonusesForItem(i, i.system.base_attribute);
                    const equipmentNhBonus = equipmentSkillBonus(activeEquipmentOwnerModifiers, i);
                    const nhPassive = (Number(i.system.nh_passive) || 0) + nhBonuses.passive + equipmentNhBonus;
                    const nhTemp = (Number(i.system.nh_temp) || 0) + nhBonuses.temp;
                    const nhOverride = i.system.nh_override;
                    i.system.final_nh = nhOverride !== null && nhOverride !== "" && nhOverride !== undefined
                        ? (Number(nhOverride) || 0) + equipmentNhBonus
                        : nhBase + nhLevel + nhMod + nhPassive + nhTemp;

                    const hasTreeOwnData = i.system.tree_base_attribute !== undefined
                        || i.system.tree_points_per_level !== undefined
                        || i.system.tree_skill_level !== undefined
                        || i.system.tree_nh_mod !== undefined
                        || i.system.tree_points !== undefined;
                    if (hasTreeOwnData) {
                        const treeBaseAttribute = i.system.tree_base_attribute || i.system.base_attribute;
                        const treeAttrVal = evaluateRollReference(treeBaseAttribute, skills).value;
                        const treeNhBase = Number(treeAttrVal) || 0;
                        const treeNhLevel = Number(i.system.tree_skill_level ?? i.system.skill_level) || 0;
                        const treeNhMod = Number(i.system.tree_nh_mod ?? 0) || 0;
                        const treeDefaultMod = Number(i.system.tree_default_mod ?? 0) || 0;
                        const treeNhBonuses = collectNhBonusesForItem(i, treeBaseAttribute);
                        const treeNhPassive = (Number(i.system.nh_passive) || 0) + treeNhBonuses.passive + equipmentNhBonus;
                        const treeNhTemp = (Number(i.system.nh_temp) || 0) + treeNhBonuses.temp;
                        i.system.tree_final_nh = treeNhBase + treeDefaultMod + treeNhLevel + treeNhMod + treeNhPassive + treeNhTemp;
                    }
                } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
            }
        }
        
         const spellResolutionPasses = Math.max(2, spellsAndPowers.length);
        for (let pass = 0; pass < spellResolutionPasses; pass++) {
            const rollReferences = [...skills, ...spellsAndPowers];
            for (const i of spellsAndPowers) {
                try {
                    const conjurationBaseVal = evaluateRollReference(i.system.base_attribute, rollReferences).value;
                    const nhBase = Number(conjurationBaseVal) || 0;
                    const nhLevel = Number(i.system.skill_level) || 0;
                    const nhMod = Number(i.system.nh_mod) || 0;
                    const nhBonuses = collectNhBonusesForItem(i);
                    const nhPassive = (Number(i.system.nh_passive) || 0) + nhBonuses.passive;
                    const nhTemp = (Number(i.system.nh_temp) || 0) + nhBonuses.temp;
                    const nhOverride = i.system.nh_override;
                    i.system.final_nh = nhOverride !== null && nhOverride !== "" && nhOverride !== undefined
                        ? Number(nhOverride) || 0
                        : nhBase + nhLevel + nhMod + nhPassive + nhTemp;
                   if (i.system.uses_attack && i.system.attack_roll?.skill_name) {
                        const resolvedAttackBase = evaluateRollReference(i.system.attack_roll.skill_name, rollReferences);
                        const attackBaseVal = Number(resolvedAttackBase.value);
                        const attackMod = Number(i.system.attack_roll.skill_level_mod) || 0;
                        i.system.attack_nh = resolvedAttackBase.available && Number.isFinite(attackBaseVal) ? attackBaseVal + attackMod : null;
                        i.system.attack_roll.resolved_skill_name = resolvedAttackBase.label;
                        } else {
                        i.system.attack_nh = null;
                        if (i.system.attack_roll) i.system.attack_roll.resolved_skill_name = "";
                    }
                } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
            }
        }
        
        for (const i of equipment) {
            try {
   if (i.system.melee_attacks) {
                    for (const [attackId, attack] of Object.entries(i.system.melee_attacks)) {
                        attack.id = attack.id || attackId;
                        const resolvedAttackBase = evaluateRollReference(attack.skill_name, skills);
                        const attackBaseVal = Number(resolvedAttackBase.value);
                        const attackSkillNh = resolvedAttackBase.available && Number.isFinite(attackBaseVal)
                            ? attackBaseVal + (Number(attack.skill_level_mod) || 0)
                            : null;
                        const attackNhBonuses = collectNhBonusesForAttack(i, attack, "melee");
                        attack.final_nh = attackSkillNh === null ? null : attackSkillNh + attackNhBonuses.passive + attackNhBonuses.temp;
                        attack.resolved_skill_name = resolvedAttackBase.label;
                        attack.effective_damage = resolveCombatDamageProfile(this, i, attack, "melee");
                        attack.effective_damage_formula = attack.effective_damage.main.formula;
                        const combatModifierEntries = _collectCombatModifierEntries(this, i, attack, "melee");

const splitDefenseValue = (value) => {
                            const raw = String(value ?? "").trim();
                            if (!raw) return null;
                            const match = raw.match(/^([+-]?\d+)(.*)$/);
                            if (!match) return null;
                            return { number: Number(match[1]), suffix: match[2] || "" };
                        };

                        const addBonusesToDefenseValue = (value, bonuses) => {
                            const parsed = splitDefenseValue(value);
                            if (!parsed || !Number.isFinite(parsed.number)) return null;
                            const bonus = (Number(bonuses?.passive) || 0) + (Number(bonuses?.temp) || 0);
                            return `${parsed.number + bonus}${parsed.suffix}`;
                        };

                        const calculateFinalDefense = (rawDefense, defenseType, useDefault = false, importedFinalDefense = null) => {
                            const defenseNhBonuses = collectNhBonusesForDefense(i, attack, "melee", defenseType);
                            const ownerDefenseBonus = equipmentAttributeBonus(activeEquipmentOwnerModifiers, defenseType);
                            const featureDefenseBonus = Number(defenseType === "parry" ? attack.parry_bonus : attack.block_bonus) || 0;
                            const shouldRecalculate = combatModifierEntries.some(({ entry }) => defenseType === "parry" ? entry.recalculate_parry : entry.recalculate_block);
                            const importedParsed = splitDefenseValue(importedFinalDefense);
                            if (importedParsed && !shouldRecalculate) {
                                const finalImportedDefense = addBonusesToDefenseValue(importedFinalDefense, {
                                    passive: (Number(defenseNhBonuses.passive) || 0) + ownerDefenseBonus + featureDefenseBonus,
                                    temp: defenseNhBonuses.temp
                                });
                                return applyEquipmentDefenseBonus(finalImportedDefense, activeEquipmentDefenseBonus);
                            }

                            if (!useDefault && (rawDefense === "0" || rawDefense === "No")) return null;
                            if (attackSkillNh === null) return null;
                            const rollOnlyAttackDelta = shouldRecalculate
                                ? combatModifierEntries.reduce((total, { entry, evaluationActor }) => {
                                    const recalculatesDefense = defenseType === "parry" ? entry.recalculate_parry : entry.recalculate_block;
                                    if (!recalculatesDefense || entry.attack_nh_display_mode === "include_in_nh") return total;
                                    return total + _evaluateCombatAttackValue(evaluationActor, entry, {
                                        itemId: i.id,
                                        itemName: i.name,
                                        attackId: attack.id,
                                        attackType: "melee",
                                        defenseType,
                                        type: "defense"
                                    });
                                }, 0)
                                : 0;
                            const effectiveDefenseNh = shouldRecalculate ? attack.final_nh + rollOnlyAttackDelta : attackSkillNh;
                            const defenseBase = Math.floor(effectiveDefenseNh / 2) + 3;
                            const parsedDefense = splitDefenseValue(rawDefense);
                            const defenseMod = useDefault ? 0 : (parsedDefense?.number ?? (Number(rawDefense) || 0));
                            const baseValue = (defenseMod > 5 ? defenseMod : defenseBase + defenseMod) + featureDefenseBonus + ownerDefenseBonus;
                            const suffix = !useDefault && parsedDefense?.suffix ? parsedDefense.suffix : "";
                            return applyEquipmentDefenseBonus(`${baseValue + defenseNhBonuses.passive + defenseNhBonuses.temp}${suffix}`, activeEquipmentDefenseBonus);
                        };

                        // Aparar (Parry) - modificadores de rolagem podem afetar o grupo/modo também como defesa.
                        const finalParry = calculateFinalDefense(attack.parry, "parry", attack.parry_default === true, attack.gcs_calculated_parry);
                        if (finalParry !== null) attack.final_parry = finalParry;

                        // Bloqueio (Block) - modificadores de rolagem podem afetar o grupo/modo também como defesa.
                        const finalBlock = calculateFinalDefense(attack.block, "block", attack.block_default === true, attack.gcs_calculated_block);
                        if (finalBlock !== null) attack.final_block = finalBlock;
                    }
                }
                if (i.system.ranged_attacks) {
                    for (const [attackId, attack] of Object.entries(i.system.ranged_attacks)) {
                        attack.id = attack.id || attackId;
                        const resolvedAttackBase = evaluateRollReference(attack.skill_name, skills);
                        const attackBaseVal = Number(resolvedAttackBase.value);
                        const attackSkillNh = resolvedAttackBase.available && Number.isFinite(attackBaseVal)
                            ? attackBaseVal + (Number(attack.skill_level_mod) || 0)
                            : null;
                        const attackNhBonuses = collectNhBonusesForAttack(i, attack, "ranged");
                        attack.final_nh = attackSkillNh === null ? null : attackSkillNh + attackNhBonuses.passive + attackNhBonuses.temp;
                        attack.resolved_skill_name = resolvedAttackBase.label;
                        attack.effective_damage = resolveCombatDamageProfile(this, i, attack, "ranged");
                        attack.effective_damage_formula = attack.effective_damage.main.formula;
                    }
                }
            } catch (e) { console.error(`GUM | Erro ao calcular NH de ataque para ${i.name}:`, e); }
        }
    }
}

/**
 * Uma janela de diálogo para criar e editar Efeitos Contingentes.
 */
class ContingentEffectBuilder extends Dialog {
    constructor(effectData = {}, item, callback) {
        super({
            title: "Construtor de Efeito Contingente",
            content: "Carregando...", // Será substituído pelo template
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: html => this._onSave(html)
                }
            },
            default: "save",
            width: 500
        });

        this.effectData = effectData;
        this.item = item; // O item ao qual o efeito pertence
        this.callback = callback;
    }

    async _render(force, options) {
        // Carrega o template do construtor
        const templatePath = "systems/gum/templates/apps/contingent-effect-builder.hbs";
        
        // Prepara os dados para o template
        const templateData = {
            effect: this.effectData,
            // Lista de gatilhos possíveis
            triggers: {
                "onDamage": "Ao Causar Dano",
                "onHit": "Ao Acertar",
                "onCrit": "Em um Acerto Crítico"
            },
            // Lista de ações possíveis
            actions: {
                "applyCondition": "Aplicar Condição",
                "setFlag": "Definir Flag no Alvo"
            }
        };

        this.data.content = await renderTemplate(templatePath, templateData);
        return super._render(force, options);
    }

    _onSave(html) {
        const form = html.find('form')[0];
        const formData = new FormDataExtended(form).object;
        
        // Chama a função de callback passando os novos dados do efeito
        this.callback(formData);
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Adicione aqui listeners para interatividade dentro do diálogo, se necessário.
    }
}

// ================================================================== //
//  ✅ FUNÇÃO DE ROLAGEM GLOBAL E REUTILIZÁVEL (VERSÃO CORRIGIDA) ✅
// ================================================================== //
/**
 * Realiza uma rolagem de teste (3d6) baseada nos dados fornecidos.
 * @param {Actor} actor - O ator realizando o teste.
 * @param {Object} rollData - Dados do teste { label, value, modifier, type, itemId, etc. }
 * @param {Object} extraOptions - Opções extras { ignoreGlobals: boolean }
 */
export async function rollFromHotbar({ actorId, actorUuid, rollData } = {}) {
    let actor = null;

    if (actorUuid) {
        actor = await fromUuid(actorUuid).catch(() => null);
    }

    if (!actor && actorId) {
        actor = game.actors.get(actorId);
    }

    if (!actor) {
        ui.notifications.warn("[GUM] Ator não encontrado para rolagem de atalho.");
        return;
    }

    const resolvedRollData = rollData || {};
    const preparedRollData = await prepareAmmunitionRollData(actor, resolvedRollData);
    if (!preparedRollData) return;

    if (resolvedRollData.quick && typeof performGURPSRoll !== "undefined") {
        return performGURPSRoll(actor, preparedRollData);
    }

    if (typeof GurpsRollPrompt !== "undefined") {
        return new GurpsRollPrompt(actor, preparedRollData).render(true);
    }

    return performGURPSRoll(actor, preparedRollData);
}

async function createGumRollMacro(data, slot) {
    const rollData = data?.rollData || {};
    let actor = null;

    if (data?.actorUuid) {
        actor = await fromUuid(data.actorUuid).catch(() => null);
    }

    if (!actor && data?.actorId) {
        actor = game.actors.get(data.actorId);
    }

    if (!actor) {
        ui.notifications.warn("[GUM] Ator não encontrado para criar atalho de rolagem.");
        return false;
    }

    const label = rollData.label || "Teste";
    const command = `game.gum.rollFromHotbar(${JSON.stringify({
        actorId: actor.id,
        actorUuid: actor.uuid,
        rollData
    })})`;
    let macro = game.macros.find((m) => m.name === label && m.command === command);

    if (!macro) {
        macro = await Macro.create({
            name: label,
            type: "script",
            img: rollData.img || actor.img || "icons/svg/d20.svg",
            command
        }, { displaySheet: false });
    }

    game.user.assignHotbarMacro(macro, slot);
    return false;
}

async function createGumDamageMacro(data, slot) {
    const damageData = data?.damageData || {};
    let actor = null;

    if (data?.actorUuid) actor = await fromUuid(data.actorUuid).catch(() => null);
    if (!actor && data?.actorId) actor = game.actors.get(data.actorId);
    if (!actor) {
        ui.notifications.warn("[GUM] Ator não encontrado para criar atalho de dano.");
        return false;
    }

    const sourceLabel = damageData.sourceLabel || game.i18n.localize("GUM.RollCard.BasicDamage") || "Dano";
    const label = `Dano — ${sourceLabel}`;
    const command = `game.gum.damageFromHotbar(${JSON.stringify({
        actorId: actor.id,
        actorUuid: actor.uuid,
        damageData
    })})`;
    let macro = game.macros.find(macro => macro.name === label && macro.command === command);

    if (!macro) {
        macro = await Macro.create({
            name: label,
            type: "script",
            img: damageData.img || actor.img || "icons/svg/blood.svg",
            command
        }, { displaySheet: false });
    }

    game.user.assignHotbarMacro(macro, slot);
    return false;
}

export async function performGURPSRoll(actor, rollData, extraOptions = {}) {
    
    // --- 1. LÓGICA DE VALORES BASE ---
    const hasProcessedData = rollData.originalValue !== undefined;
    let sourceItem = null;
    if (rollData.itemUuid) {
        sourceItem = await fromUuid(rollData.itemUuid).catch(() => null);
    } else if (rollData.itemId && actor?.items) {
        sourceItem = actor.items.get(rollData.itemId) || null;
    }
    let magicConsumptionSession = null;
    if (sourceItem && ["spell", "power"].includes(sourceItem.type) && rollData.type === sourceItem.type) {
        magicConsumptionSession = await prepareMagicConsumptionSession(sourceItem, actor);
        if (magicConsumptionSession === null) return;
        await applyMagicConsumptionTrigger(magicConsumptionSession, actor, "attempt");
    }
    const sourceAttack = sourceItem?.system?.ranged_attacks?.[rollData.attackId];
    const showRapidFireHitCount = game.settings.get("gum", "showRapidFireHitCount") === true;
    const hasAmmunitionLinks = Boolean(sourceAttack?.ammunition_ids?.length);
    const numericCadence = numericRateOfFire(sourceAttack?.rof);
    const needsRangedConfirmation = hasAmmunitionLinks || (showRapidFireHitCount && numericCadence > 1);
    if (rollData.type === "attack" && sourceAttack && needsRangedConfirmation) {
        if (rollData.ammunitionPrepared !== true) {
            const preparedRollData = await prepareAmmunitionRollData(actor, rollData);
            if (!preparedRollData) return;
            rollData = preparedRollData;
        }
        const options = availableAmmunition(actor, sourceAttack);
        const prepared = rollData.ammunitionPreparation || {};
        const choice = {
            id: String(prepared.ammunitionId || rollData.ammunitionId || ""),
            amount: Number(prepared.shots ?? rollData.shotsFired ?? 1),
            ignoreCadence: prepared.ignoreCadence === true
        };
        let selectedModifier = 0;
        const amount = choice.amount;
        if (!Number.isSafeInteger(amount) || amount < 1 || (numericCadence && !choice.ignoreCadence && amount > numericCadence)) {
            ui.notifications.warn(game.i18n.localize("GUM.RapidFire.InvalidShots"));
            return;
        }
        if (choice.id) {
            const ammunition = actor.items.get(choice.id);
            const available = ammunitionAvailableUses(ammunition);
            if (!ammunition || !options.some(item => item.id === choice.id) || amount > available) {
                ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.InvalidQuantity"));
                return;
            }
            if (numericCadence && !choice.ignoreCadence && amount > numericCadence) {
                ui.notifications.warn(game.i18n.format("GUM.Equipment.Ammunition.ExceedsCadence", { cadence: numericCadence }));
                return;
            }
            const baseProfile = resolveCombatDamageProfile(actor, sourceItem, sourceAttack, "ranged", { includeTargeted: true, rollData });
            const ammunitionProfile = applyAmmunition(baseProfile, ammunition);
            const ammunitionSystem = ammunition._source?.system || ammunition.system;
            // Re-resolve the selected document instead of trusting prepared data. This
            // also covers a ranged weapon that points to itself as its ammunition.
            const ammunitionResolution = resolveEquipment(ammunitionSystem);
            const consumption = buildEquipmentConsumptionUpdate(ammunitionSystem, ammunitionResolution, amount);
            if (!consumption.consumed) {
                ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.InvalidQuantity"));
                return;
            }
            await ammunition.update(consumption.updates);
            const remaining = consumption.remaining;
            const warning = Number(ammunition.system.ammunition?.low_warning) || 0;
            if (warning > 0 && remaining <= warning) ui.notifications.warn(game.i18n.format("GUM.Equipment.Ammunition.Remaining", { name: ammunition.name, quantity: remaining }));
            selectedModifier = ammunitionRollModifier(ammunition);
            rollData = { ...rollData, shotsFired: amount, ammunitionName: ammunition.name, ammunitionSpent: amount,
                ammunitionDamageProfile: ammunitionProfile };
        } else {
            rollData = { ...rollData, shotsFired: amount, ammunitionName: null, ammunitionSpent: 0, ammunitionDamageProfile: null };
        }
        rollData.ammunitionModifier = selectedModifier;
    }
    
    // Valor Base (Atributo Puro)
    const baseValue = parseInt(hasProcessedData ? rollData.originalValue : rollData.value) || 10;
    
    // Modificador que veio do Prompt (Manual)
    const promptMod = reconcileAmmunitionModifier(rollData.modifier, rollData.ammunitionModifier,
        rollData.ammunitionPromptModifier, rollData.ammunitionModifierIncluded);
    
    const label = rollData.label || "Teste";

    // --- 2. LÓGICA DE MODIFICADORES GLOBAIS (ESCUDO / CONDIÇÕES) ---    
    
    let globalModValue = 0;
    let activeDefenseBonus = 0;
    let activeDefenseBonusSources = [];
    let lowestCap = extraOptions.effectiveCap !== undefined ? extraOptions.effectiveCap : Infinity; 

    // Só processa globais se NÃO tivermos instrução para ignorar
    if (!extraOptions.ignoreGlobals) {
        const rollContext = _determineRollContext(actor, rollData);
        const rollMetadata = resolveRollMetadata({ context: rollContext, purposeIds: rollData.purposeIds, attributeKey: rollData.attributeKey ?? rollData.attribute });
        // Rolagens rápidas do Escudo do Mestre usam um apresentador sintético,
        // não um documento Actor do Foundry. Nesse caso não há flags para ler.
        const globalMods = actor?.getFlag?.("gum", "gm_modifiers") || [];
        
        globalMods.forEach(m => {
            const modContext = m?.contexts ?? m?.context ?? "all";
            if (!_matchesRollContext(modContext, rollContext)) return;
            if (!matchesRollTags(m, rollMetadata.rollTags)) return;

            // Soma o valor
            globalModValue += _evaluateModifierEntryValue(actor, m, rollData);
            
            // Verifica o Teto (Cap)
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                // Se achou um teto menor do que o atual, atualiza
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });

        const effectMods = _collectEffectRollModifiers(actor, rollContext, { ...rollData, ...rollMetadata });
        const counterEffectMods = _collectTargetCounterRollModifiers(actor, rollContext, { ...rollData, ...rollMetadata });
        const composedEffectMods = composeRollModifiers([...effectMods, ...counterEffectMods].map(modifier => ({
            ...modifier,
            value: _evaluateModifierEntryValue(modifier.evaluationActor || actor, modifier, rollData)
        })));
        composedEffectMods.forEach(m => {
            globalModValue += Number(m.value) || 0;
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });

    }

    if (rollData.type === "defense") {
        activeDefenseBonusSources = collectActiveEquipmentDefenseBonuses(actor?.items);
        activeDefenseBonus = activeDefenseBonusSources.reduce((total, source) => total + source.bonus, 0);
    }

    // --- 3. CÁLCULO FINAL (EVITA DUPLICAÇÃO) ---
    
    // Se o Prompt estiver enviando o valor total (base + globais + manual) no 'value',
    // nós devemos tomar cuidado. Mas assumindo que 'value' é base e 'modifier' é extra:
    
    const defenseBonusAppliedAtRoll = rollData.defenseBonusIncluded === true ? 0 : activeDefenseBonus;
    const totalModifier = promptMod + globalModValue + defenseBonusAppliedAtRoll;

    // Soma matemática simples
    const mathLevel = baseValue + totalModifier;

    // Aplica a regra do Teto (Clamp)
    let effectiveLevel = mathLevel;
    if (lowestCap !== Infinity && effectiveLevel > lowestCap) {
        effectiveLevel = lowestCap;
    }

    // Flag visual para o template saber se cortou
    const isCapped = effectiveLevel < mathLevel;

    // --- 4. ROLAGEM ---
    const rollFormula = getDefaultSkillRollFormula();
    const roll = new Roll(rollFormula);
    await roll.evaluate();
    const total = roll.total;

    // --- 5. RESULTADO ---
    const evaluatedResult = evaluateGurpsRollResult(total, effectiveLevel);
    const { isSuccess, margin, resultLabel, statusClass, rollOutcome,
        isCriticalSuccess: isCritSuccess, isCriticalFailure: isCritFailure, outcome } = evaluatedResult;
    await applyMagicConsumptionTrigger(magicConsumptionSession, actor, rollOutcome);
    const rapidFireResult = showRapidFireHitCount ? calculateRapidFireHits({
        isSuccess,
        isCriticalSuccess: isCritSuccess,
        margin,
        recoil: sourceAttack?.rcl,
        shotsFired: rollData.shotsFired
    }) : null;
    rollData = { ...rollData, rapidFireResult };

    // --- 7. HTML DO CARD ---
 const diceFaces = roll.dice[0].results.map((d) => `<span class="die-face">${d.result}</span>`).join('');
    const modText = totalModifier !== 0 ? `${totalModifier > 0 ? '+' : ''}${totalModifier}` : '±0';

    const modBreakdown = `M ${promptMod >= 0 ? '+' : ''}${promptMod} | G ${globalModValue >= 0 ? '+' : ''}${globalModValue}${activeDefenseBonus ? ` | BD ${activeDefenseBonus >= 0 ? '+' : ''}${activeDefenseBonus}` : ""}`;
    const displayResultLabel = game.i18n.localize(`GUM.RollCard.Outcome.${outcome}`);

    const damageActionData = _buildDamageActionData(actor, sourceItem, rollData);
    const damageActionAttr = damageActionData
        ? encodeURIComponent(JSON.stringify(damageActionData))
        : "";

    const purposeLabels = getPurposeLabels(rollData.purposeIds);
    const purposeHtml = purposeLabels.length ? `
        <details class="roll-purposes">
            <summary>${game.i18n.localize("GUM.RollCard.Purposes")}</summary>
            <div class="roll-purpose-list">
                ${purposeLabels.map(label => `<span>${foundry.utils.escapeHTML(label)}</span>`).join("")}
            </div>
        </details>
    ` : "";
    const showDefenseBonusNotice = rollData.type === "defense" && game.settings.get("gum", "showDecisiveDefenseBonusNotice") === true;
    const decisiveDefenseBonus = showDefenseBonusNotice
        ? evaluateDecisiveDefenseBonus({ rollTotal: total, uncappedTarget: mathLevel, cap: lowestCap, defenseBonus: activeDefenseBonus })
        : null;
    const defenseBonusNoticeHtml = decisiveDefenseBonus ? (() => {
        const key = decisiveDefenseBonus.outcome === "success"
            ? "GUM.DefenseBonus.DecisiveSuccess"
            : "GUM.DefenseBonus.DecisiveFailure";
        const bonus = `${decisiveDefenseBonus.bonus >= 0 ? "+" : ""}${decisiveDefenseBonus.bonus}`;
        const sources = activeDefenseBonusSources
            .map(source => `${foundry.utils.escapeHTML(source.name)} ${source.bonus >= 0 ? "+" : ""}${source.bonus}`)
            .filter(Boolean)
            .join(", ");
        const sourceHtml = sources
            ? `<small>${game.i18n.format("GUM.DefenseBonus.Sources", { sources })}</small>`
            : "";
        return `<div class="defense-bonus-notice ${decisiveDefenseBonus.outcome}"><i class="fas fa-shield-alt" aria-hidden="true"></i><span>${game.i18n.format(key, { bonus })}</span>${sourceHtml}</div>`;
    })() : "";
    const rapidFireNoticeHtml = rapidFireResult ? (() => {
        const key = rapidFireResult.isCriticalSuccess ? "GUM.RapidFire.CriticalSummary" : "GUM.RapidFire.Summary";
        const summary = game.i18n.format(key, {
            shots: rapidFireResult.shotsFired,
            recoil: rapidFireResult.recoil,
            hits: rapidFireResult.hits
        });
        return `<div class="rapid-fire-hit-notice ${isSuccess ? "success" : "failure"}"><i class="fas fa-bullseye" aria-hidden="true"></i><span>${summary}</span></div>`;
    })() : "";

    const content = `
        <div class="gurps-roll-card premium">
            <header class="card-header">
                <h3>${label}</h3>              
                ${purposeHtml}
            </header>

            <div class="card-formula-container">
                <span class="formula-pill">${game.i18n.localize("GUM.RollCard.SkillLevel")} ${baseValue}</span>
                <span class="formula-pill">${modText} (${modBreakdown})</span>
            </div>

            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column">
                        <span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span>
                        <div class="roll-total">${total}</div>
                        <div class="individual-dice">${diceFaces}</div>
                    </div>

                    <div class="column-separator"></div>

                    <div class="target-column">
                        <span class="column-label">${game.i18n.localize("GUM.RollCard.Target")}</span>
                        <div class="target-value">${effectiveLevel}</div>
                        <div class="target-note">${isCapped ? `${game.i18n.localize("GUM.RollCard.Cap")} ${lowestCap}` : game.i18n.localize("GUM.RollCard.Final")}</div>
                    </div>
                </div>
            </div>

            <footer class="card-footer">
                <div class="result-block ${statusClass}">
                    <span class="result-label">${displayResultLabel}</span>
                    <span class="result-margin">${game.i18n.format("GUM.RollRequest.Margin", { value: margin })}</span>
                </div>
                ${defenseBonusNoticeHtml}
                ${rapidFireNoticeHtml}
                ${damageActionData ? `
                    <div class="roll-chat-actions">
                        <button type="button" class="chat-roll-damage-button" data-damage-action="${damageActionAttr}">
                            <i class="fas fa-burst"></i> ${game.i18n.localize("GUM.RollCard.RollDamage")}
                        </button>
                    </div>
                ` : ""}
            </footer>
        </div>
    `;




    const chatData = applyCurrentRollPrivacy({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    }, { rollMode: extraOptions.rollMode });
    showDiceForMessageLessRoll(roll, {
        createChatMessage: extraOptions.createChatMessage,
        dice3d: game.dice3d,
        user: game.user,
        whisper: chatData.whisper ?? null,
        blind: chatData.blind ?? false
    });
    if (extraOptions.createChatMessage !== false) await ChatMessage.create(chatData);

    if (rollData.type === "defense") {
        const [targetToken] = _resolveCounterTargetsForRoll(rollData);
        await processConditions(actor, buildDefenseRollConditionEvent({
            eventId: foundry.utils.randomID(),
            actor,
            target: targetToken || null,
            sourceItem,
            rollData,
            rollContext: _determineRollContext(actor, rollData),
            result: {
                total,
                baseValue,
                totalModifier,
                effectiveLevel,
                margin,
                outcome,
                isSuccess,
                isCriticalSuccess: isCritSuccess,
                isCriticalFailure: isCritFailure
            },
            combat: game.combat || null
        }));
    }

    // --- 8. DISPARO DE EFEITOS DE ATIVAÇÃO (SUCESSO/FALHA) ---
    // Executamos depois de criar a mensagem para que o card da rolagem apareça antes do pedido de resistência.
    if (sourceItem?.system?.activationEffects && sourceItem.system.activationEffects[rollOutcome]) {
        try {
            await applyActivationEffects(sourceItem, actor, rollOutcome, extraOptions);
        } catch (err) {
            console.error("GUM | Falha ao aplicar efeitos de ativação:", err);
        }
    }

    if (sourceItem) {
        try {
            await applyUseEventEffects(sourceItem, actor, "activate", {
                ...extraOptions,
                outcome: rollOutcome,
                rollData
            });
        } catch (err) {
            console.error("GUM | Falha ao aplicar Evento de Uso (activate):", err);
        }
    }

    const structuredResult = { roll, rollJSON: roll.toJSON(), total, baseValue, promptModifier: promptMod,
        globalModifier: globalModValue, defenseBonus: activeDefenseBonus, defenseBonusSources: activeDefenseBonusSources, totalModifier, mathLevel, effectiveLevel,
        effectiveCap: lowestCap === Infinity ? null : lowestCap, isCapped, isSuccess,
        isCriticalSuccess: isCritSuccess, isCriticalFailure: isCritFailure, margin, outcome,
        rapidFireResult,
        resultLabel, statusClass, purposeIds: rollData.purposeIds ?? [], modifierBreakdown: [
            { source: "prompt", value: promptMod }, { source: "global", value: globalModValue }
        ] };
    const lifecycleAttack = _getRollSourceAttack(sourceItem, rollData);
    const lifecycleAttackType = sourceItem?.system?.melee_attacks?.[rollData.attackId]
        ? "melee"
        : sourceItem?.system?.ranged_attacks?.[rollData.attackId]
            ? "ranged"
            : rollData.attackType || null;
    emitGumLifecycleHook(GUM_API_HOOKS.ROLL_COMPLETED, {
        actor,
        sourceToken: resolveGumSourceToken(actor),
        item: sourceItem,
        action: {
            type: rollData.type || "roll",
            id: rollData.attackId || sourceItem?.id || null,
            attackType: lifecycleAttackType,
            label,
            data: lifecycleAttack || null
        },
        targets: _resolveCounterTargetsForRoll(rollData),
        result: structuredResult,
        metadata: {
            rollData,
            rollContext: _determineRollContext(actor, rollData)
        }
    });
    if (extraOptions.returnResult || extraOptions.createChatMessage === false) return structuredResult;
}

function _buildDamageActionData(actor, sourceItem, rollData) {
    if (!actor || !sourceItem) return null;

    const attackId = rollData.attackId || null;
    if (attackId) {
        const attack =
            sourceItem.system?.melee_attacks?.[attackId] ||
            sourceItem.system?.ranged_attacks?.[attackId];
        if (attack?.effective_damage_formula || attack?.damage_formula) {
            return {
                actorId: actor.id,
                actorUuid: actor.uuid,
                itemId: sourceItem.id,
                itemUuid: sourceItem.uuid,
                attackId,
                sourceLabel: `${sourceItem.name} (${attack.mode ?? attackId})`,
                ammunition: rollData.ammunitionName ? { name: rollData.ammunitionName, spent: rollData.ammunitionSpent } : null,
                rapidFire: rollData.rapidFireResult || null,
                ammunitionDamageProfile: rollData.ammunitionDamageProfile || null
            };
        }
    }

    if (sourceItem.system?.damage?.formula) {
        return {
            actorId: actor.id,
            actorUuid: actor.uuid,
            itemId: sourceItem.id,
            itemUuid: sourceItem.uuid,
            attackId: null,
            sourceLabel: sourceItem.name
        };
    }

    return null;
}

async function _rollDamageFromChatAction(payload) {
    if (!payload?.actorId || !payload?.itemId) {
        return ui.notifications.warn("Não foi possível identificar os dados da rolagem de dano.");
    }

    let actor = game.actors.get(payload.actorId);
    if (!actor && payload.actorUuid) {
        actor = await fromUuid(payload.actorUuid);
    }
    if (!actor) {
        return ui.notifications.warn("Ator da rolagem de dano não foi encontrado.");
    }

    let item = actor.items.get(payload.itemId);
    if (!item && payload.itemUuid) {
        item = await fromUuid(payload.itemUuid);
    }
    if (!item) {
        return ui.notifications.warn("Item da rolagem de dano não foi encontrado.");
    }

    let normalizedAttack = null;
    const attackId = payload.attackId || null;

    if (attackId && (item.system?.melee_attacks || item.system?.ranged_attacks)) {
        const attack = item.system.melee_attacks?.[attackId] || item.system.ranged_attacks?.[attackId];
        if (!attack) {
            return ui.notifications.warn("O modo de ataque vinculado a esta rolagem de dano não foi encontrado.");
        }
        if (attack?.effective_damage_formula || attack?.damage_formula) {
            const effectiveDamage = payload.ammunitionDamageProfile || resolveCombatDamageProfile(actor, item, attack, item.system?.melee_attacks?.[attackId] ? "melee" : "ranged", { includeTargeted: true, rollData: payload });
            normalizedAttack = {
                name: payload.sourceLabel || `${item.name} (${attack.mode ?? attackId})`,
                formula: effectiveDamage.main.formula,
                type: effectiveDamage.main.type,
                nature: effectiveDamage.main.nature || "",
                armor_divisor: effectiveDamage.main.armor_divisor,
                follow_up_damage: effectiveDamage.follow_up,
                fragmentation_damage: effectiveDamage.fragmentation,
                onDamageEffects: attack.onDamageEffects || {},
                generalConditions: item.system.generalConditions || {},
                sourceItemId: item.id,
                sourceItemUuid: item.uuid,
                sourceWeight: Number(item.system?.weight) || 0,
                sourceAttackId: attackId || null,
                sourceAttackType: item.system?.melee_attacks?.[attackId] ? "melee" : "ranged",
                ammunition: payload.ammunition || null,
                rapidFire: payload.rapidFire || null
            };
        }
    } else if (item.system?.damage?.formula) {
        const dmg = item.system.damage;
        normalizedAttack = {
            name: payload.sourceLabel || item.name,
            formula: dmg.formula,
            type: dmg.type,
            nature: dmg.nature || "",
            armor_divisor: dmg.armor_divisor,
            follow_up_damage: foundry.utils.duplicate(dmg.follow_up_damage || {}),
            fragmentation_damage: foundry.utils.duplicate(dmg.fragmentation_damage || {}),
            onDamageEffects: item.system.onDamageEffects || {},
            generalConditions: item.system.generalConditions || {},
            sourceItemId: item.id,
            sourceItemUuid: item.uuid,
            sourceWeight: Number(item.system?.weight) || 0,
            sourceAttackId: null,
            sourceAttackType: item.type || "item"
        };
    }

    if (!normalizedAttack?.formula) {
        return ui.notifications.warn("Nenhuma fórmula de dano válida foi encontrada para esta rolagem.");
    }

    const mergeEffects = (...sources) => {
        const merged = [];
        for (const source of sources) {
            if (!source) continue;
            if (Array.isArray(source)) {
                source.forEach((data, index) => {
                    if (!data) return;
                    merged.push({ id: data.id ?? `effect-${merged.length + index}`, ...data });
                });
            } else {
                for (const [id, data] of Object.entries(source)) {
                    if (!data) continue;
                    merged.push({ id, ...data });
                }
            }
        }
        return merged;
    };

    const combinedOnDamageEffects = mergeEffects(
        normalizedAttack.generalConditions,
        item.system?.onDamageEffects,
        normalizedAttack.onDamageEffects
    );

    const resolveBaseDamage = (rollActor, formula) => resolveAttackDamageDisplay(formula, rollActor.system.attributes);

    const extractMathFormula = (formula) => {
        const match = String(formula).match(/^([0-9dDkKlLhH+\-/*\s(){},.]+)/i);
        return match ? match[1].trim() : "0";
    };

    const summarySegments = [];
    const mainDisplayFormula = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.formula));
        summarySegments.push(`${mainDisplayFormula} ${normalizedAttack.type || ""}${normalizedAttack.nature?.label ? ` [${normalizedAttack.nature.label}]` : ""}`.trim());
    if (normalizedAttack.follow_up_damage?.formula) {
        const fuDisplay = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.follow_up_damage.formula));
        summarySegments.push(`FU: ${fuDisplay} ${normalizedAttack.follow_up_damage.type || ""}`.trim());
    }
    if (normalizedAttack.fragmentation_damage?.formula) {
        const frDisplay = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.fragmentation_damage.formula));
        summarySegments.push(`FR: ${frDisplay} ${normalizedAttack.fragmentation_damage.type || ""}`.trim());
    }

    const promptResult = await GurpsDamageRollPrompt.prompt({
        sourceName: normalizedAttack.name,
        ammunition: normalizedAttack.ammunition || null,
        rapidFire: normalizedAttack.rapidFire || null,
        main: {
            formula: normalizedAttack.formula,
            displayFormula: mainDisplayFormula,
            summaryFormula: summarySegments.join(" • "),
                        type: normalizedAttack.type || "",
            natureDisplay: normalizedAttack.nature ? formatDamageNature(normalizedAttack.nature) : "",
            armorDivisor: normalizedAttack.armor_divisor || 1
        },
        followUp: {
            formula: normalizedAttack.follow_up_damage?.formula || "",
            type: normalizedAttack.follow_up_damage?.type || "",
            natureDisplay: normalizedAttack.follow_up_damage?.nature ? formatDamageNature(normalizedAttack.follow_up_damage.nature) : "",
            armorDivisor: normalizedAttack.follow_up_damage?.armor_divisor || 1
        },
        fragmentation: {
            formula: normalizedAttack.fragmentation_damage?.formula || "",
            type: normalizedAttack.fragmentation_damage?.type || "",
            natureDisplay: normalizedAttack.fragmentation_damage?.nature ? formatDamageNature(normalizedAttack.fragmentation_damage.nature) : "",
            armorDivisor: normalizedAttack.fragmentation_damage?.armor_divisor || 1
        }
    });

    if (!promptResult) return;

    const appendAdditional = (baseFormula, additional) => {
        const base = String(baseFormula || "").trim();
        const add = String(additional || "").trim();
        if (!add) return base;
        return `${base}${add}`;
    };

    normalizedAttack.formula = appendAdditional(normalizedAttack.formula, promptResult.mainAdditional);
    normalizedAttack.nature = promptResult.mainNature || null;
    normalizedAttack.armor_divisor = promptResult.mainArmorDivisor || normalizedAttack.armor_divisor || 1;

    if (promptResult.followUpAdditional) {
        normalizedAttack.follow_up_damage = normalizedAttack.follow_up_damage || { formula: "", type: "", armor_divisor: 1 };
        normalizedAttack.follow_up_damage.formula = appendAdditional(normalizedAttack.follow_up_damage.formula || "0", promptResult.followUpAdditional);
        if (!normalizedAttack.follow_up_damage.type && promptResult.followUpType) normalizedAttack.follow_up_damage.type = promptResult.followUpType;
        normalizedAttack.follow_up_damage.nature = promptResult.followUpNature || null;
    }
    if (normalizedAttack.follow_up_damage) normalizedAttack.follow_up_damage.armor_divisor = promptResult.followUpArmorDivisor || normalizedAttack.follow_up_damage.armor_divisor || 1;

    if (promptResult.fragmentationAdditional) {
        normalizedAttack.fragmentation_damage = normalizedAttack.fragmentation_damage || { formula: "", type: "", armor_divisor: 1 };
        normalizedAttack.fragmentation_damage.formula = appendAdditional(normalizedAttack.fragmentation_damage.formula || "0", promptResult.fragmentationAdditional);
        if (!normalizedAttack.fragmentation_damage.type && promptResult.fragmentationType) normalizedAttack.fragmentation_damage.type = promptResult.fragmentationType;
        normalizedAttack.fragmentation_damage.nature = promptResult.fragmentationNature || null;
    }
    if (normalizedAttack.fragmentation_damage) normalizedAttack.fragmentation_damage.armor_divisor = promptResult.fragmentationArmorDivisor || normalizedAttack.fragmentation_damage.armor_divisor || 1;

    const rolls = [];
    const mainFormula = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.formula));
    const mainRoll = new Roll(mainFormula);
    await mainRoll.evaluate();
    rolls.push(mainRoll);

    let followUpRoll = null;
    let followUpFormula = null;
    if (normalizedAttack.follow_up_damage?.formula) {
        followUpFormula = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.follow_up_damage.formula));
        followUpRoll = new Roll(followUpFormula);
        await followUpRoll.evaluate();
        rolls.push(followUpRoll);
    }

    let fragRoll = null;
    let fragFormula = null;
    if (normalizedAttack.fragmentation_damage?.formula) {
        fragFormula = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.fragmentation_damage.formula));
        fragRoll = new Roll(fragFormula);
        await fragRoll.evaluate();
        rolls.push(fragRoll);
    }

    const damagePackage = {
        attackerId: actor.id,
        attackerTokenId: actor.token?.id || null,
        attackerTokenImg: resolveCharacterImage(actor),
        sourceName: normalizedAttack.name,
        sourceItemId: normalizedAttack.sourceItemId || null,
        sourceItemUuid: normalizedAttack.sourceItemUuid || null,
        sourceWeight: normalizedAttack.sourceWeight || 0,
        sourceAttackId: normalizedAttack.sourceAttackId || null,
        sourceAttackType: normalizedAttack.sourceAttackType || null,
        ammunition: normalizedAttack.ammunition || null,
        rapidFire: normalizedAttack.rapidFire || null,
        main: {
            total: mainRoll.total,
            type: normalizedAttack.type || "",
            nature: normalizedAttack.nature || null,
            armorDivisor: normalizedAttack.armor_divisor || 1
        },
        onDamageEffects: combinedOnDamageEffects,
        generalConditions: normalizedAttack.generalConditions
    };

    if (followUpRoll) {
        damagePackage.followUp = {
            total: followUpRoll.total,
            type: normalizedAttack.follow_up_damage.type || "",
            nature: normalizedAttack.follow_up_damage.nature || null,
            armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
        };
    }

    if (fragRoll) {
        damagePackage.fragmentation = {
            total: fragRoll.total,
            type: normalizedAttack.fragmentation_damage.type || "",
            nature: normalizedAttack.fragmentation_damage.nature || null,
            armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
        };
    }

    const mainDiceHtml = mainRoll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");
    const formulaSegments = [];
    formulaSegments.push(`${mainFormula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor !== 1 ? `(${normalizedAttack.armor_divisor})` : ""} ${normalizedAttack.type || ""}${normalizedAttack.nature?.label ? ` [${normalizedAttack.nature.label}]` : ""}`.trim());
    if (followUpRoll) {
        formulaSegments.push(`${followUpFormula}${normalizedAttack.follow_up_damage.armor_divisor && normalizedAttack.follow_up_damage.armor_divisor !== 1 ? `(${normalizedAttack.follow_up_damage.armor_divisor})` : ""} ${normalizedAttack.follow_up_damage.type || ""}`.trim());
    }
    if (fragRoll) {
        formulaSegments.push(`${fragFormula}${normalizedAttack.fragmentation_damage.armor_divisor && normalizedAttack.fragmentation_damage.armor_divisor !== 1 ? `(${normalizedAttack.fragmentation_damage.armor_divisor})` : ""} ${normalizedAttack.fragmentation_damage.type || ""}`.trim());
    }

    const content = `
      <div class="gurps-damage-card">
        <header class="card-header">
          <h3>${normalizedAttack.name}</h3>
        </header>
        <div class="card-formula-container">
          <span class="formula-pill">${formulaSegments.join(" • ")}</span>
        </div>
        ${normalizedAttack.rapidFire ? `<div class="damage-rapid-fire-note"><i class="fas fa-bullseye" aria-hidden="true"></i><span>${game.i18n.format(normalizedAttack.rapidFire.isCriticalSuccess ? "GUM.RapidFire.CriticalSummary" : "GUM.RapidFire.Summary", {
            shots: normalizedAttack.rapidFire.shotsFired,
            recoil: normalizedAttack.rapidFire.recoil,
            hits: normalizedAttack.rapidFire.hits
        })}</span></div>` : ""}
        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>
            <div class="column-separator"></div>
            <div class="target-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.TotalDamage")}</span>
              <div class="damage-total">
                <span class="damage-value">${mainRoll.total}</span>
                <span class="damage-type">${normalizedAttack.type || ""}</span>
              </div>
            </div>
          </div>
        </div>
        ${(followUpRoll || fragRoll) ? `
          <footer class="card-footer">
            ${followUpRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FollowUpDamage")}</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${followUpRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.follow_up_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}
            ${fragRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FragmentationDamage")}</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${fragRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.fragmentation_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}
          </footer>
        ` : ""}
        <footer class="card-actions">
          <button class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
            <i class="fas fa-crosshairs"></i> ${game.i18n.localize("GUM.RollCard.ApplyToTarget")}
          </button>
        </footer>
      </div>
    `;

    const chatData = applyCurrentRollPrivacy({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        rolls
    }, { rollMode: promptResult.rollMode });
    const message = await ChatMessage.create(chatData);
    emitGumLifecycleHook(GUM_API_HOOKS.DAMAGE_ROLLED, {
        actor,
        sourceToken: resolveGumSourceToken(actor),
        item,
        action: {
            type: "damage",
            id: normalizedAttack.sourceAttackId || item.id,
            attackType: normalizedAttack.sourceAttackType,
            label: normalizedAttack.name,
            data: normalizedAttack
        },
        targets: _resolveCounterTargetsForRoll(payload),
        result: { damage: damagePackage, rolls, message }
    });
}

async function _rollBasicDamageFromHotbar(actor, damageData) {
    const basicDamageKey = String(damageData?.basicDamageKey || "");
    if (!BASIC_DAMAGE_KEYS.includes(basicDamageKey)) {
        return ui.notifications.warn("[GUM] O tipo de dano básico deste atalho não é mais válido.");
    }

    const formula = getBasicDamageFormula(actor.system?.attributes?.[basicDamageKey], "0").toLowerCase();
    const label = damageData?.sourceLabel || game.i18n.localize("GUM.RollCard.BasicDamage");
    const basicDamageType = "indef.";
    const extractMathFormula = value => {
        const match = String(value).match(/^([0-9dDkKlLhH+\-/*\s(){},.]+)/i);
        return match ? match[1].trim() : "0";
    };
    const normalizeFormula = value => {
        if (!game.settings.get("gum", "normalizeGurpsDamageDice")) return value;
        return normalizeGurpsDamageExpression(value)?.formula || value;
    };
    const cleaned = extractMathFormula(resolveAttackDamageDisplay(formula, actor.system.attributes));
    const promptResult = await GurpsDamageRollPrompt.prompt({
        sourceName: label,
        main: { formula, displayFormula: cleaned, summaryFormula: cleaned, type: basicDamageType },
        followUp: { formula: "", displayFormula: "", type: "" },
        fragmentation: { formula: "", displayFormula: "", type: "" }
    });
    if (!promptResult) return;

    const mainFormula = normalizeFormula(`${cleaned}${promptResult.mainAdditional || ""}`);
    const followUpFormula = promptResult.followUpAdditional
        ? normalizeFormula(String(promptResult.followUpAdditional).replace(/^\+/, ""))
        : "";
    const fragmentationFormula = promptResult.fragmentationAdditional
        ? normalizeFormula(String(promptResult.fragmentationAdditional).replace(/^\+/, ""))
        : "";
    const mainRoll = new Roll(mainFormula);
    await mainRoll.evaluate();
    const followUpRoll = followUpFormula ? await new Roll(followUpFormula).evaluate() : null;
    const fragmentationRoll = fragmentationFormula ? await new Roll(fragmentationFormula).evaluate() : null;
    const rolls = [mainRoll, followUpRoll, fragmentationRoll].filter(Boolean);

    const damagePackage = {
        attackerId: actor.id,
        attackerTokenId: actor.token?.id || null,
        attackerTokenImg: resolveCharacterImage(actor),
        sourceName: label,
        main: {
            total: mainRoll.total,
            type: basicDamageType,
            nature: promptResult.mainNature || null,
            armorDivisor: promptResult.mainArmorDivisor || 1
        },
        onDamageEffects: {},
        generalConditions: {}
    };
    if (followUpRoll) {
        damagePackage.followUp = {
            total: followUpRoll.total,
            type: promptResult.followUpType || "",
            nature: promptResult.followUpNature || null,
            armorDivisor: promptResult.followUpArmorDivisor || 1
        };
    }
    if (fragmentationRoll) {
        damagePackage.fragmentation = {
            total: fragmentationRoll.total,
            type: promptResult.fragmentationType || "",
            nature: promptResult.fragmentationNature || null,
            armorDivisor: promptResult.fragmentationArmorDivisor || 1
        };
    }

    const escapeHtml = value => foundry.utils.escapeHTML(String(value ?? ""));
    const diceHtml = mainRoll.dice.flatMap(die => die.results)
        .map(result => `<span class="die-damage">${escapeHtml(result.result)}</span>`)
        .join("");
    const formulaPill = [mainFormula, followUpFormula, fragmentationFormula]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" • ");
    const encodedDamage = escapeHtml(JSON.stringify(damagePackage));
    const extraDamage = (followUpRoll || fragmentationRoll) ? `
      <footer class="card-footer">
        ${followUpRoll ? `<div class="extra-damage-block"><div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FollowUpDamage")}</div><div class="extra-damage-roll"><div class="extra-total"><span class="damage-value">${escapeHtml(followUpRoll.total)}</span><span class="damage-type">${escapeHtml(promptResult.followUpType || "")}</span></div></div></div>` : ""}
        ${fragmentationRoll ? `<div class="extra-damage-block"><div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FragmentationDamage")}</div><div class="extra-damage-roll"><div class="extra-total"><span class="damage-value">${escapeHtml(fragmentationRoll.total)}</span><span class="damage-type">${escapeHtml(promptResult.fragmentationType || "")}</span></div></div></div>` : ""}
      </footer>` : "";
    const content = `
      <div class="gurps-damage-card">
        <header class="card-header"><h3>${escapeHtml(label)}</h3><div class="card-subtitle">${game.i18n.localize("GUM.RollCard.BasicDamage")}</div></header>
        <div class="card-formula-container"><span class="formula-pill">${formulaPill}</span></div>
        <div class="card-content"><div class="card-main-flex">
          <div class="roll-column"><span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span><div class="individual-dice-damage">${diceHtml || '<span class="die-damage">–</span>'}</div></div>
          <div class="column-separator"></div>
          <div class="target-column"><span class="column-label">${game.i18n.localize("GUM.RollCard.TotalDamage")}</span><div class="damage-total"><span class="damage-value">${escapeHtml(mainRoll.total)}</span></div></div>
        </div></div>
        ${extraDamage}
        <footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${encodedDamage}'><i class="fas fa-crosshairs"></i> ${game.i18n.localize("GUM.RollCard.ApplyToTarget")}</button></footer>
      </div>`;
    const chatData = applyCurrentRollPrivacy({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        rolls
    }, { rollMode: promptResult.rollMode });
    const message = await ChatMessage.create(chatData);
    emitGumLifecycleHook(GUM_API_HOOKS.DAMAGE_ROLLED, {
        actor,
        sourceToken: resolveGumSourceToken(actor),
        action: { type: "damage", id: basicDamageKey, label, data: damageData },
        targets: _resolveCounterTargetsForRoll(damageData),
        result: { damage: damagePackage, rolls, message }
    });
    return message;
}

export async function damageFromHotbar({ actorId, actorUuid, damageData } = {}) {
    let actor = null;
    if (actorUuid) actor = await fromUuid(actorUuid).catch(() => null);
    if (!actor && actorId) actor = game.actors.get(actorId);
    if (!actor) {
        return ui.notifications.warn("[GUM] O ator vinculado a este atalho de dano não foi encontrado.");
    }

    if (damageData?.kind === "basic") {
        return _rollBasicDamageFromHotbar(actor, damageData);
    }
    if (damageData?.kind !== "item") {
        return ui.notifications.warn("[GUM] Este atalho de dano possui um formato inválido.");
    }
    return _rollDamageFromChatAction({
        actorId: actor.id,
        actorUuid: actor.uuid,
        itemId: damageData.itemId,
        itemUuid: damageData.itemUuid,
        attackId: damageData.attackId || null
    });
}

function _gumChatHelpContent() {
    const localize = key => game.i18n.localize(key);
    return `
      <div class="gum-command-help">
        <h3><i class="fas fa-dice" style="font-size: x-large; text-transform: uppercase;"></i> ${localize("GUM.ChatCommand.Help.Title")}</h3>
        <p><strong>${localize("GUM.ChatCommand.Help.ManualSkill")}:</strong> <code>/gum nh value+-mods</code></p>
        <p><strong>${localize("GUM.ChatCommand.Help.ActorSkill")}:</strong> <code>/gum skill+-mods</code></p>
        <p><strong>${localize("GUM.ChatCommand.Help.Damage")}:</strong> <code>/gum dmg dice+-mods type</code></p>
        <p><small>${localize("GUM.ChatCommand.Help.Aliases")}: nh, n, niv, nível · dmg, d, damage, dano · /gum help</small></p>
      </div>`;
}

function _gumCommandActor() {
    return resolveGumCommandActor({
        controlledTokens: canvas?.tokens?.controlled ?? [],
        assignedActor: game.user?.character ?? null,
        actors: game.actors?.contents ?? game.actors ?? [],
        user: game.user
    });
}

function _gumGmPresenter() {
    return { name: "Mestre", img: "icons/svg/mystery-man.svg", id: null };
}

async function _showGumCommandHelp({ startup = false } = {}) {
    return ChatMessage.create({
        user: game.user.id,
        speaker: { alias: game.i18n.localize("GUM.ChatCommand.Help.Speaker") },
        content: _gumChatHelpContent(),
        whisper: [game.user.id],
        flags: { gum: { commandHelp: true, startup } }
    });
}

async function _rollGumManualDamage(actor, formula, damageType) {
    const roll = new Roll(formula);
    await roll.evaluate();
    const diceHtml = roll.dice.flatMap(die => die.results).map(result => `<span class="die-damage">${result.result}</span>`).join("");
    const escapedFormula = foundry.utils.escapeHTML(formula);
    const escapedType = foundry.utils.escapeHTML(damageType);
    const damagePackage = {
        attackerId: actor?.id ?? null,
        attackerName: actor?.name || game.i18n.localize("GUM.RollCard.GM"),
        sourceName: game.i18n.localize("GUM.RollCard.CommandDamage"),
        main: { total: roll.total, type: damageType, armorDivisor: 1 },
        onDamageEffects: {},
        generalConditions: {}
    };
    const encodedDamage = foundry.utils.escapeHTML(JSON.stringify(damagePackage));
    const content = `
      <div class="gurps-damage-card">
        <header class="card-header"><h3>${game.i18n.localize("GUM.RollCard.CommandDamage")}</h3></header>
        <div class="card-formula-container"><span class="formula-pill">${escapedFormula} ${escapedType}</span></div>
        <div class="card-content"><div class="card-main-flex">
          <div class="roll-column"><span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span><div class="individual-dice-damage">${diceHtml}</div></div>
          <div class="column-separator"></div>
          <div class="target-column"><span class="column-label">${game.i18n.localize("GUM.RollCard.TotalDamage")}</span><div class="damage-total"><span class="damage-value">${roll.total}</span><span class="damage-type">${escapedType}</span></div></div>
        </div></div>
        <footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${encodedDamage}'><i class="fas fa-crosshairs"></i> ${game.i18n.localize("GUM.RollCard.ApplyToTarget")}</button></footer>
      </div>`;
    const chatData = applyCurrentRollPrivacy({
        user: game.user.id,
        speaker: actor?.id ? ChatMessage.getSpeaker({ actor }) : { alias: game.i18n.localize("GUM.RollCard.GM") },
        content,
        rolls: [roll]
    });
    const message = await ChatMessage.create(chatData);
    emitGumLifecycleHook(GUM_API_HOOKS.DAMAGE_ROLLED, {
        actor,
        sourceToken: resolveGumSourceToken(actor),
        action: { type: "damage", label: damagePackage.sourceName, data: { formula, damageType } },
        targets: _resolveCounterTargetsForRoll({}),
        result: { damage: damagePackage, rolls: [roll], message }
    });
}

function _findGumSkill(actor, query) {
    const skills = actor?.items?.filter(item => item.type === "skill") ?? [];
    const matches = name => skills.filter(skill =>
        [skill.name, getSkillDisplayName(skill)].some(candidate => normalizeGumLookup(candidate) === normalizeGumLookup(name))
    );
    const exact = matches(query);
    if (exact.length) return { matches: exact, modifier: 0 };
    const parsed = splitSkillModifier(query);
    return { matches: matches(parsed.name), modifier: parsed.modifier };
}

async function _executeGumChatCommand(command) {
    if (command.type === "help") return _showGumCommandHelp();
    if (command.type === "error") {
        const usage = command.reason === "damage" ? "/gum dmg 3d6+1 cont" : "/gum nh 14-4";
        return ui.notifications.warn(`[GUM] Comando inválido. Exemplo: ${usage}`);
    }

    const selection = _gumCommandActor();
    if (command.type === "damage") {
        const actor = selection.actor || (game.user?.isGM ? _gumGmPresenter() : null);
        if (!actor) return ui.notifications.warn("[GUM] Selecione um token ou vincule um personagem para rolar dano.");
        return _rollGumManualDamage(actor, command.formula, command.damageType);
    }

    if (command.type === "nh") {
        if (selection.multiple && !game.user?.isGM) return ui.notifications.warn("[GUM] Selecione somente um token.");
        const actor = selection.actor || (game.user?.isGM ? _gumGmPresenter() : null);
        if (!actor) return ui.notifications.warn("[GUM] Selecione um token ou vincule um personagem.");
        return performGURPSRoll(actor, { label: "Teste de NH", type: "attribute", value: command.value, modifier: command.modifier });
    }

    if (selection.multiple) return ui.notifications.warn("[GUM] Selecione somente um token para usar uma perícia da ficha.");
    if (!selection.actor) {
        const guidance = selection.ambiguousOwners
            ? "Você possui mais de um ator. Selecione um token ou atribua um personagem ao seu usuário."
            : "Selecione um token para usar uma perícia da ficha ou use /gum nh 14-4.";
        return ui.notifications.warn(`[GUM] ${guidance}`);
    }
    const { matches, modifier } = _findGumSkill(selection.actor, command.query);
    if (matches.length !== 1) {
        const message = matches.length > 1 ? "há mais de uma perícia com esse nome" : `perícia \"${command.query}\" não encontrada`;
        return ui.notifications.warn(`[GUM] ${message}.`);
    }
    const skill = matches[0];
    const value = Number(skill.system?.final_nh ?? skill.system?.nh);
    if (!Number.isFinite(value)) return ui.notifications.warn(`[GUM] A perícia \"${getSkillDisplayName(skill)}\" não possui NH válido.`);
    return performGURPSRoll(selection.actor, {
        label: getSkillDisplayName(skill),
        type: "skill",
        value,
        modifier,
        itemId: skill.id,
        itemUuid: skill.uuid,
        attributeKey: skill.system?.base_attribute || null
    });
}

function _registerGumChatCommands() {
    const installed = installGumChatCommandInterceptor(ui.chat, async command => {
        try {
            await _executeGumChatCommand(command);
        } catch (error) {
            console.error("GUM | Falha ao executar comando de chat:", error);
            ui.notifications.error("[GUM] Não foi possível executar o comando.");
        }
    });
    if (!installed) console.warn("GUM | O processador de comandos do chat não está disponível.");
}

function _determineRollContext(actor, rollData) {
    const type = rollData.type;
    const itemId = rollData.itemId;
    const attributeKey = normalizeRequestedAttributeKey(rollData.attributeKey ?? rollData.attribute);
    const senseKeys = ["vision", "hearing", "tastesmell", "touch"];
    const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];

    if (type === 'defense') {
        const defenseType = rollData.defenseType?.toLowerCase?.();
        if (defenseType === 'dodge') return 'defense_dodge';
        if (defenseType === 'parry') return 'defense_parry';
        if (defenseType === 'block') return 'defense_block';
        return 'defense';
    }

    if (type === 'attack') {
        if (rollData.attackType === 'ranged') return 'attack_ranged';
        if (rollData.isRanged === true) return 'attack_ranged';
        if (rollData.attackType === 'melee') return 'attack_melee';
    }

    if (type === 'spell' || type === 'power') {
        const item = itemId ? actor?.items?.get(itemId) : null;
        return resolveAbilityRollContext(type, { attributeKey: attributeKey || null, item }) || type;
    }

    if (type === 'attribute' && attributeKey) {
        if (attributeKeys.includes(attributeKey)) return `check_${attributeKey}`;
    }

    if (type === 'skill') {
        if (attributeKey && senseKeys.includes(attributeKey)) return `sense_${attributeKey}`;
        let baseAttribute = attributeKey;
        if (!baseAttribute && itemId) {
            const item = actor?.items?.get(itemId);
            if (item?.system?.base_attribute) baseAttribute = item.system.base_attribute.toLowerCase();
        }
        if (baseAttribute && attributeKeys.includes(baseAttribute)) return `skill_${baseAttribute}`;
    }

    if (itemId) {
        const item = actor?.items?.get(itemId);
        if (item) {
            if (item.type === 'spell' || item.type === 'power') return resolveAbilityRollContext(item.type, { item }) || item.type;
            if (item.type === 'ranged_weapon') return 'attack_ranged';
        }
    }

  if (type === 'attack') return 'attack_melee';
    if (type === 'skill' || type === 'attribute') return 'skill';

    return 'default';
}

function _matchesRollContext(modContext, rollContext) {
    if (!modContext || modContext === 'all') return true;
    if (Array.isArray(modContext)) return modContext.some(context => matchesAbilityRollContext(context, rollContext));
    if (typeof modContext === 'string' && modContext.includes(',')) {
        return modContext.split(',').map(c => c.trim()).some(context => matchesAbilityRollContext(context, rollContext));
    }
    return matchesAbilityRollContext(modContext, rollContext);
}

function _splitModifierArgs(rawValue) {
    const source = String(rawValue ?? "");
    const args = [];
    let current = "";
    let depth = 0;
    for (const ch of source) {
        if (ch === "," && depth === 0) {
            if (current.trim()) args.push(current.trim());
            current = "";
            continue;
        }
        if (ch === "(") depth += 1;
        else if (ch === ")" && depth > 0) depth -= 1;
        current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

function _toModifierNumberOrZero(value) {
    if (value === null || value === undefined || value === "") return 0;
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const match = String(value).match(/[+-]?\d+(\.\d+)?/);
    return match ? Number(match[0]) || 0 : 0;
}

function _resolveRollItemAttackContext(actor, rollData = {}) {
    const itemId = rollData?.itemId;
    const itemName = String(rollData?.itemName || "").trim().toLowerCase();
    const item = itemId
        ? (actor?.items?.get(itemId) || null)
        : (itemName ? actor?.items?.find((candidate) => candidate.name?.trim().toLowerCase() === itemName) || null : null);
    if (!item) return { item: null, attack: null };

    const attackId = rollData?.attackId;
    if (!attackId) {
        const rangedAttacks = Object.values(item.system?.ranged_attacks || {});
        const meleeAttacks = Object.values(item.system?.melee_attacks || {});
        const allAttacks = [...rangedAttacks, ...meleeAttacks].filter(Boolean);
        if (allAttacks.length === 1) return { item, attack: allAttacks[0] };
        return { item, attack: null };
    }
    const attack =
        item.system?.ranged_attacks?.[attackId]
        ?? item.system?.melee_attacks?.[attackId]
        ?? null;
    return { item, attack };
}

function _resolveModifierReferenceValue(actor, rawReference, rollData = {}) {
    const referenceRaw = String(rawReference ?? "").trim();
    if (!referenceRaw) return 0;

    const modifierMatch = referenceRaw.match(/^(.*?)([+-]\d+)\s*$/);
    let reference = referenceRaw;
    let modifier = 0;
    if (modifierMatch) {
        const parsedModifier = Number(modifierMatch[2]);
        if (Number.isFinite(parsedModifier) && modifierMatch[1]?.trim()) {
            reference = modifierMatch[1].trim();
            modifier = parsedModifier;
        }
    }

    const normalizedRef = reference.toLowerCase();
    if (/^[+-]?\d+(\.\d+)?$/.test(normalizedRef)) {
        return (Number(normalizedRef) || 0) + modifier;
    }

    const { item, attack } = _resolveRollItemAttackContext(actor, rollData);
    if (normalizedRef.startsWith("item.")) {
        const itemPath = normalizedRef.slice("item.".length);
        const itemValue = foundry.utils.getProperty(item?.system ?? {}, itemPath);
        return _toModifierNumberOrZero(itemValue) + modifier;
    }
    if (normalizedRef.startsWith("attack.") || normalizedRef.startsWith("ataque.")) {
        const attackPath = normalizedRef.split(".").slice(1).join(".");
        const attackValue = foundry.utils.getProperty(attack ?? {}, attackPath);
        return _toModifierNumberOrZero(attackValue) + modifier;
    }

    const parameterAliases = {
        holdout: item?.system?.holdout,
        ocultamento: item?.system?.holdout,
        precision: attack?.accuracy,
        precisao: attack?.accuracy,
        "precisão": attack?.accuracy,
        prec: attack?.accuracy,
        accuracy: attack?.accuracy,
        magnitude: attack?.mag ?? rollData?.magnitude ?? rollData?.mag,
        mag: attack?.mag ?? rollData?.mag ?? rollData?.magnitude
    };
    if (normalizedRef in parameterAliases) {
        return _toModifierNumberOrZero(parameterAliases[normalizedRef]) + modifier;
    }

    const attrValue = resolveRollBaseValue(actor, normalizedRef);
    if (attrValue !== null && attrValue !== undefined && !Number.isNaN(Number(attrValue))) {
        return (Number(attrValue) || 0) + modifier;
    }

    const skill = actor?.items?.find((item) =>
        item.type === "skill" && item.name?.toLowerCase().trim() === normalizedRef
    );
    if (skill) {
        return (Number(skill.system?.final_nh) || 0) + modifier;
    }

    return modifier;
}

function _evaluateModifierValue(actor, rawValue, rollData = {}, { allowDice = true } = {}) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
    if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;

    let conditionalValue = rawValue;
    try {
        conditionalValue = resolveConditionalValue(rawValue, { actor, rollData });
    } catch (error) {
        console.warn("GUM | Falha ao avaliar expressão condicional de modificador:", error);
        return 0;
    }

    const source = String(conditionalValue).trim();
    if (!source) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(source)) return Number(source) || 0;

    if (!allowDice && hasModifierRollFormula(source)) return 0;

    const diceResult = evaluateModifierRollFormulaSync(source, actor?.getRollData?.() || {});
    if (Number.isFinite(diceResult)) return diceResult;

    const javascriptResult = evaluateJavaScriptNumericExpression(source, { actor, game, rollData });
    if (Number.isFinite(javascriptResult)) return javascriptResult;

    const evaluateArithmetic = (expression) => {
        const tokenRegex = /[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*(?:\.[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*)*/g;
        const reserved = new Set(["maior", "menor", "max", "min", "math"]);
        const prepared = expression.replace(tokenRegex, (token) => {
            if (reserved.has(token.toLowerCase())) return token;
            return `get(\"${token}\")`;
        });
        try {
            return Function(
                "get",
                "maior",
                "menor",
                "max",
                "min",
                `"use strict"; return (${prepared});`
            )(
                (token) => _resolveModifierReferenceValue(actor, token, rollData),
                (...args) => Math.max(...args),
                (...args) => Math.min(...args),
                (...args) => Math.max(...args),
                (...args) => Math.min(...args)
            );
        } catch (_) {
            return null;
        }
    };

    const expressionMatch = source.match(/^(maior|menor|max|min)\s*\((.*)\)$/i);
    if (expressionMatch) {
        const mode = /^(menor|min)$/i.test(expressionMatch[1]) ? "min" : "max";
        const values = _splitModifierArgs(expressionMatch[2]).map((entry) => {
            const arithmeticEntry = evaluateArithmetic(entry);
            if (Number.isFinite(arithmeticEntry)) return arithmeticEntry;
            return _resolveModifierReferenceValue(actor, entry, rollData);
        });
        if (!values.length) return 0;
        return mode === "min" ? Math.min(...values) : Math.max(...values);
    }

    const arithmeticResult = evaluateArithmetic(source);
    if (Number.isFinite(arithmeticResult)) return arithmeticResult;

    return _resolveModifierReferenceValue(actor, source, rollData);
}

function _evaluateModifierEntryValue(actor, entry = {}, rollData = {}, options = {}) {
    const value = _evaluateModifierValue(actor, entry?.value, rollData, options);
    if (!entry?.defer_value_evaluation || entry?.value_mode !== "per_origin_level") return value;
    const originLevel = Number(entry?.origin_level);
    return value * (Number.isFinite(originLevel) && originLevel > 0 ? originLevel : 1);
}

function _normalizeRollModifierFilterTokens(rawValue, { lower = false } = {}) {
    return String(rawValue ?? "")
        .split(",")
 .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => lower ? value.toLowerCase() : value);
}

function _getRollSourceItem(actor, rollData = {}) {
    const itemId = String(rollData?.itemId ?? "").trim();
    const itemName = String(rollData?.itemName ?? "").trim().toLowerCase();
    if (itemId) return actor?.items?.get(itemId) || null;
    if (!itemName) return null;
    return actor?.items?.find((candidate) => candidate.name?.trim().toLowerCase() === itemName) || null;
}

function _getRollSourceAttack(item = null, rollData = {}) {
    if (!item) return null;
    const attackId = String(rollData?.attackId ?? "").trim();
    if (attackId) {
        return item.system?.melee_attacks?.[attackId] ?? item.system?.ranged_attacks?.[attackId] ?? null;
    }

    const rangedAttacks = Object.values(item.system?.ranged_attacks || {});
    const meleeAttacks = Object.values(item.system?.melee_attacks || {});
    const allAttacks = [...meleeAttacks, ...rangedAttacks].filter(Boolean);
    return allAttacks.length === 1 ? allAttacks[0] : null;
}

function _matchesRollModifierItemFilter(entry = {}, item = null) {
    if (!matchesAbilityClassificationFilters(entry, item)) return false;
    const sourceItemFilters = _normalizeRollModifierFilterTokens(entry?.source_item_ids, { lower: true });
    if (sourceItemFilters.length) {
        if (!item) return false;
        const sourceCandidates = [item.id, item.uuid, item.name]
            .map((value) => String(value ?? "").trim().toLowerCase())
            .filter(Boolean);
        if (!sourceItemFilters.some((filter) => sourceCandidates.includes(filter))) return false;
    }

    const legacyNameFilters = _normalizeRollModifierFilterTokens(entry?.target_values, { lower: true });
    if (!legacyNameFilters.length) return true;
    if (!item) return false;

    const itemCandidates = [item.id, item.uuid, item.name, getSkillDisplayName(item)]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);
    return legacyNameFilters.some((filter) => itemCandidates.includes(filter));
}

function _matchesRollModifierAttackFilter(entry = {}, attack = null, rollData = {}) {
    const attackFilters = _normalizeRollModifierFilterTokens(entry?.source_attack_ids, { lower: true });
    if (!attackFilters.length) return true;

    const attackCandidates = [
        rollData?.attackId,
        attack?.id,
        attack?.mode,
        attack?.name
    ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);

    return attackCandidates.length > 0 && attackFilters.some((filter) => attackCandidates.includes(filter));
}

function _matchesNhDisplayContextForItem(entry = {}, item = null, baseAttribute = null) {
    const context = (entry?.contexts ?? entry?.context ?? "all").toString().trim();
    if (!context || context === "all") return true;
    const contexts = context.includes(",") ? context.split(",").map(c => c.trim()) : [context];
    const baseAttr = (baseAttribute ?? item?.system?.base_attribute ?? "").toString().trim().toLowerCase();
    const hasExplicitBaseAttribute = baseAttribute !== null && baseAttribute !== undefined && baseAttribute !== "";
    const abilityContext = resolveAbilityRollContext(item?.type, { attributeKey: hasExplicitBaseAttribute ? baseAttr : null, item });
    return contexts.some((ctx) => {
        if (abilityContext && matchesAbilityRollContext(ctx, abilityContext)) return true;
        return false;
    });
}

function _matchesNhDisplayContextForAttack(entry = {}, attackType = "") {
    const context = (entry?.contexts ?? entry?.context ?? "all").toString().trim();
    if (!context || context === "all") return true;
    const contexts = context.includes(",") ? context.split(",").map(c => c.trim()) : [context];
    return contexts.some((ctx) => {
        if (ctx === "attack") return true;
        if (ctx === "attack_melee") return attackType === "melee";
        if (ctx === "attack_ranged") return attackType === "ranged";
        return false;
    });
}

function _matchesNhDisplayContextForDefense(entry = {}, defenseType = "") {
    const context = (entry?.contexts ?? entry?.context ?? "all").toString().trim();
    if (!context || context === "all") return true;
    const contexts = context.includes(",") ? context.split(",").map(c => c.trim()) : [context];
    const normalizedDefenseType = `${defenseType ?? ""}`.trim().toLowerCase();
    return contexts.some((ctx) => {
        if (ctx === "defense") return true;
        if (ctx === "defense_parry") return normalizedDefenseType === "parry";
        if (ctx === "defense_block") return normalizedDefenseType === "block";
        return false;
    });
}


function _matchesRollTargetFilter(actor, rollData = {}, entry = {}) {
    const item = _getRollSourceItem(actor, rollData);
    const attack = _getRollSourceAttack(item, rollData);
    if (!_matchesRollModifierItemFilter(entry, item)) return false;
    if (!_matchesRollModifierAttackFilter(entry, attack, rollData)) return false;
    return true;
}

function _collectEffectRollModifiers(actor, rollContext, rollData = {}) {
    const activeEffects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
    const mods = [];
    const sourceItem = _getRollSourceItem(actor, rollData);
    const sourceAttack = _getRollSourceAttack(sourceItem, rollData);
    const sourceAttackType = sourceItem?.system?.melee_attacks?.[rollData.attackId] ? "melee"
        : sourceItem?.system?.ranged_attacks?.[rollData.attackId] ? "ranged" : "";
    for (const effect of activeEffects) {
        if (!matchesEquipmentGrantedEffectScope(effect, sourceItem, sourceAttack, sourceAttackType)) continue;
        const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
        if (!data) continue;
        const entries = Array.isArray(data.entries) && data.entries.length
            ? data.entries
            : [{ value: data.value, cap: data.cap, context: data.context, application_side: data.applicationSide ?? "self" }];

        entries.forEach((entry, index) => {
            const context = entry?.contexts ?? entry?.context ?? data.context ?? "all";
            const rollSourceItem = _getRollSourceItem(actor, rollData);
            if (entry?.skill_roll_only === true && rollSourceItem?.type !== "skill") return;
            if (entry?.ability_roll_only === true && !["skill", "spell", "power"].includes(rollSourceItem?.type)) return;
            if (!_matchesRollContext(context, rollContext)) return;
            if (!matchesRollTags(entry, rollData.rollTags)) return;
            if (!_matchesRollTargetFilter(actor, rollData, entry)) return;
            if ((entry?.nh_display_mode || "roll_only") === "include_in_nh") return;
            const applicationSide = _resolveRollModifierApplicationSide(entry, data);
            if (applicationSide !== "self") return;
            mods.push({
                id: `${effect.id}::${index}`,
                value: entry?.value ?? data.value,
                cap: entry?.cap ?? entry?.nh_cap ?? data.cap,
                value_mode: entry?.value_mode,
                origin_level: entry?.origin_level,
                defer_value_evaluation: entry?.defer_value_evaluation,
                compositionGroup: entry?.composition_group || "",
                compositionMode: entry?.composition_mode || "sum",
                compositionPriority: Number(entry?.composition_priority) || 0,
                compositionOrigin: getRollModifierCompositionOrigin(effect)
            });
        });
    }
    return mods;
}

function _resolveRollModifierApplicationSide(entry = {}, fallback = {}) {
    const side = entry?.application_side ?? entry?.applicationSide ?? fallback?.applicationSide ?? "self";
    return `${side}`.trim() || "self";
}

function _isCounterContextSupported(rollContext) {
    const context = `${rollContext ?? ""}`.trim();
    return context.length > 0;
}

function _buildCounterGroupKey(entry = {}, effect = {}, entryIndex = 0) {
    if (String(entry?.composition_group || "").trim()) return `composition-${effect?.id || "effect"}-${entryIndex}`;
    const label = (entry?.label || "").toString().trim();
    if (label) return label.slugify({ strict: true }) || `entry-${entryIndex}`;
    const effectName = (effect?.name || "").toString().trim();
    if (effectName) return effectName.slugify({ strict: true }) || `entry-${entryIndex}`;
    return `effect-${effect?.id || "unknown"}-${entryIndex}`;
}

function _resolveCounterTargetsForRoll(rollData = {}) {
    const byRollData = rollData?.targetTokenId ? canvas.tokens?.get(rollData.targetTokenId) : null;
    if (byRollData?.actor) return [byRollData];
    return Array.from(game.user.targets || []).filter((token) => token?.actor);
}

function _collectCounterCandidatesFromTarget(targetActor, rollContext, rollData = {}, rollingActor = null) {
    const candidates = [];
    if (!targetActor) return candidates;
    const activeEffects = Array.from(targetActor.appliedEffects ?? targetActor.effects ?? []);
    const sourceItem = _getRollSourceItem(rollingActor || targetActor, rollData);
    const sourceAttack = _getRollSourceAttack(sourceItem, rollData);
    const sourceAttackType = sourceItem?.system?.melee_attacks?.[rollData.attackId] ? "melee"
        : sourceItem?.system?.ranged_attacks?.[rollData.attackId] ? "ranged" : "";

    for (const effect of activeEffects) {
        if (!matchesEquipmentGrantedEffectScope(effect, sourceItem, sourceAttack, sourceAttackType)) continue;
        const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
        if (!data) continue;

        const entries = Array.isArray(data.entries) && data.entries.length
            ? data.entries
            : [{ value: data.value, cap: data.cap, context: data.context, application_side: data.applicationSide ?? "self" }];

        entries.forEach((entry, entryIndex) => {
            const context = entry?.contexts ?? entry?.context ?? data.context ?? "all";
            const rollSourceItem = _getRollSourceItem(rollingActor || targetActor, rollData);
            if (entry?.skill_roll_only === true && rollSourceItem?.type !== "skill") return;
            if (entry?.ability_roll_only === true && !["skill", "spell", "power"].includes(rollSourceItem?.type)) return;
            if (!_matchesRollContext(context, rollContext)) return;
            if (!matchesRollTags(entry, rollData.rollTags)) return;
            if (!_matchesRollTargetFilter(rollingActor || targetActor, rollData, entry)) return;
            if ((entry?.nh_display_mode || "roll_only") === "include_in_nh") return;
            if (_resolveRollModifierApplicationSide(entry, data) !== "vs_targeter") return;
            candidates.push({ effect, entry, entryIndex });
        });
    }

    return candidates;
}

export function resolveTargetCombatDefenseRecalculationModifiers(actor, rollContext, rollData = {}) {
    if (!actor || !["defense_parry", "defense_block"].includes(rollContext)) return [];
    const targets = _resolveCounterTargetsForRoll(rollData);
    if (targets.length !== 1) return [];
    const [targetToken] = targets;
    const item = _getRollSourceItem(actor, rollData);
    const attack = _getRollSourceAttack(item, rollData);
    const attackType = item?.system?.melee_attacks?.[rollData.attackId] ? "melee" : "ranged";
    if (!item || !attack) return [];

    const applicable = _collectTargetCombatModifierEntries(actor, item, attack, attackType, rollData).filter(({ entry }) => {
        const enabled = rollContext === "defense_parry" ? entry.recalculate_parry : entry.recalculate_block;
        return enabled;
    });
    const attackNh = Number(attack.final_nh);
    if (!Number.isFinite(attackNh)) return [];
    const selfRollOnlyAttackBonus = _collectCombatModifierEntries(actor, item, attack, attackType)
        .filter(({ entry }) => {
            const enabled = rollContext === "defense_parry" ? entry.recalculate_parry : entry.recalculate_block;
            return enabled && entry.attack_nh_display_mode !== "include_in_nh";
        })
        .reduce((total, { entry, evaluationActor }) => {
            const value = _evaluateCombatAttackValue(evaluationActor, entry, rollData);
            return Number.isFinite(value) ? total + value : total;
        }, 0);
    const totalAttackBonus = applicable.reduce((total, { entry, evaluationActor }) => {
        const value = _evaluateCombatAttackValue(evaluationActor, entry, rollData);
        return Number.isFinite(value) ? total + value : total;
    }, 0);
    const recalculationBaseNh = attackNh + selfRollOnlyAttackBonus;
    const defenseDelta = Math.floor((recalculationBaseNh + totalAttackBonus) / 2) - Math.floor(recalculationBaseNh / 2);
    if (!defenseDelta) return [];
    return [{
        id: `counter::${targetToken.id}::combat-recalculation`,
        label: `Alvo: recálculo de ${rollContext === "defense_parry" ? "Aparar" : "Bloqueio"}`,
        value: defenseDelta,
        cap: "",
        nh_cap: null,
        isGM: true,
        isEffect: true,
        isCounterEffect: true,
        counterSource: `${targetToken.actor.name} • recálculo defensivo`
    }];
}

function _collectTargetCounterRollModifiers(actor, rollContext, rollData = {}) {
    if (!actor || !_isCounterContextSupported(rollContext)) return [];

    const targets = _resolveCounterTargetsForRoll(rollData);
    if (targets.length !== 1) return [];

    const [targetToken] = targets;
    const candidates = _collectCounterCandidatesFromTarget(targetToken.actor, rollContext, rollData, actor);
    const grouped = new Map();
    for (const candidate of candidates) {
        const key = _buildCounterGroupKey(candidate.entry, candidate.effect, candidate.entryIndex);
        const value = _evaluateModifierEntryValue(targetToken.actor, candidate.entry, rollData);
        const cap = candidate.entry?.cap ?? candidate.entry?.nh_cap ?? "";
        const current = grouped.get(key);
        if (!current || Number(value) < Number(current.value)) {
            grouped.set(key, {
                id: `counter::${targetToken.id}::${key}`,
                value,
                cap,
                compositionGroup: candidate.entry?.composition_group || "",
                compositionMode: candidate.entry?.composition_mode || "sum",
                compositionPriority: Number(candidate.entry?.composition_priority) || 0,
                compositionOrigin: getRollModifierCompositionOrigin(candidate.effect)
            });
        }
    }
    for (const modifier of resolveTargetCombatDefenseRecalculationModifiers(actor, rollContext, rollData)) grouped.set(modifier.id, modifier);
    return Array.from(grouped.values());
}


/**
 * O "Despachante" de Efeitos de Ativação.
 * Pega os efeitos de sucesso/falha de um item e os envia para o "Motor" applySingleEffect.
 */
async function applyActivationEffects(item, actor, outcome, activationOptions = {}) {
    if (!item || !item.system.activationEffects || !item.system.activationEffects[outcome]) {
        return;
    }

    const effectsList = item.system.activationEffects[outcome];
    
    for (const effectData of Object.values(effectsList)) {
        const effectItem = await fromUuid(effectData.effectUuid);
        if (effectItem) {
            let finalTargets = [];
            if (effectData.recipient === 'self') {
                finalTargets = buildActorEffectTargets(actor);
            } else {
                finalTargets = Array.from(game.user.targets);
            }

            if (finalTargets.length === 0) {
                 // Se o alvo for 'target' mas nenhum foi selecionado, podemos usar o próprio ator como fallback ou avisar.
                 // Usar o próprio ator como fallback pode ser um bom padrão.
                 if (effectData.recipient === 'target') {
                    ui.notifications.warn(`O efeito "${effectItem.name}" precisa de um alvo. Aplicando em si mesmo como padrão.`);
                 }
                 finalTargets = buildActorEffectTargets(actor);
            }
            // Se o efeito tiver barreira de resistência ativada, disparamos o prompt antes de aplicar.
            const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
            if (requiresResistance) {
                for (const targetToken of finalTargets) {
                    await _promptActivationResistance(effectItem, targetToken, actor, item, effectData.id, activationOptions);
                }
            } else {
                await applySingleEffect(effectItem, finalTargets, { actor: actor, origin: item });
            }
        }
    }
}

/**
 * Aplica os efeitos do grupo "Evento de Uso" para um gatilho específico.
 * trigger: "consume" | "activate"
 */
async function applyUseEventEffects(item, actor, trigger, options = {}) {
    if (!item || !actor) return null;
    const normalizedTrigger = `${trigger || ""}`.trim().toLowerCase();
    if (!normalizedTrigger) return null;

    const useEventEffects = item.system?.useEventEffects || {};
    const effectsList = Object.values(useEventEffects).filter((effectData) => {
        const entryTrigger = `${effectData?.useEventTrigger || "consume"}`.trim().toLowerCase();
        return entryTrigger === normalizedTrigger;
    });
    const appliedEffectUuids = [];
    let pendingResistanceCount = 0;

    for (const effectData of effectsList) {
        const effectItem = await fromUuid(effectData.effectUuid).catch(() => null);
        if (!effectItem) continue;

        let finalTargets = [];
        if (effectData.recipient === "self") {
            finalTargets = buildActorEffectTargets(actor);
        } else {
            finalTargets = Array.from(game.user.targets || []);
        }

        if (finalTargets.length === 0) {
            if (effectData.recipient === "target") {
                ui.notifications.warn(`O efeito "${effectItem.name}" precisa de um alvo. Aplicando em si mesmo como padrão.`);
            }
            finalTargets = buildActorEffectTargets(actor);
        }

        const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
         if (requiresResistance) {
            for (const targetToken of finalTargets) {
                await _promptActivationResistance(effectItem, targetToken, actor, item, effectData.id, {
                    ...options,
                    mode: options.mode || "use-event"
                });
                pendingResistanceCount += 1;
            }
        } else {
            await applySingleEffect(effectItem, finalTargets, { actor, origin: item });
            appliedEffectUuids.push(effectItem.uuid);
        }
    }

    const targets = Array.from(game.user.targets || []);
    const report = {
        trigger: normalizedTrigger,
        effectCount: effectsList.length,
        appliedEffectUuids,
        pendingResistanceCount
    };
    emitGumLifecycleHook(GUM_API_HOOKS.ITEM_USE_COMPLETED, {
        actor,
        sourceToken: resolveGumSourceToken(actor),
        item,
        action: {
            type: "item-use",
            id: item.id,
            label: item.name,
            data: { trigger: normalizedTrigger }
        },
        targets: targets.length ? targets : buildActorEffectTargets(actor),
        result: report,
        metadata: {
            outcome: options.outcome ?? null,
            rollData: options.rollData ?? null
        }
    });
    return report;
}


/**
 * Cria uma mensagem de chat solicitando o teste de resistência de um efeito de ativação.
 * O teste usa os dados de barreira configurados no item efeito.
 */
function buildEffectApplicationContext(options = {}) {
    const allowedFields = [
        "source",
        "stackingDomain",
        "conditionId",
        "conditionActivationMode",
        "originItemId",
        "stateEffectGroupId",
        "stateEffectLinkId",
        "stateEffectActivationId",
        "statusBindingRuleUuid",
        "statusBindingStatusId",
        "skipPersistentEffects",
        "skipInstantEffects",
        "durationOverride",
        "applicationId",
        "gumFlags"
    ];
    return Object.fromEntries(allowedFields
        .filter(field => options[field] !== undefined)
        .map(field => [field, options[field]]));
}

async function _promptActivationResistance(effectItem, targetToken, sourceActor, originItem, effectLinkId, options = {}) {
    const rollData = effectItem.system?.resistanceRoll || {};
    const normalizedResistance = normalizeResistanceRoll(rollData);
    const resistanceModifier = evaluateNumericFormula(rollData.modifier, {
        actor: targetToken.actor,
        eventData: options.eventData ?? null
    }) || 0;
    normalizedResistance.test.fixedModifier = resistanceModifier;
    // O evento que originou a barreira pode ser efêmero (por exemplo, local de
    // impacto de um dano). Grave o valor já resolvido no pedido de rolagem.
    normalizedResistance.test.fixedModifierFormula = "";
    const suppressResistanceCard = rollData.skipPromptCard || options.suppressResistanceCard;
    const applicationContext = buildEffectApplicationContext(options);
    if (suppressResistanceCard) {
        const targetKey = targetToken.document?.uuid || targetToken.uuid || targetToken.actor?.uuid;
        const silentRequest = {
            id: foundry.utils.randomID(), title: game.i18n.format("GUM.RollRequest.ResistanceTitle", { name: effectItem.name }),
            origin: { type: "effect-barrier", sourceActorUuid: sourceActor?.uuid, sourceItemUuid: originItem?.uuid, effectUuid: effectItem.uuid, effectLinkId },
            targets: [{ targetKey, actorUuid: targetToken.actor?.uuid, tokenUuid: targetToken.document?.uuid || targetToken.uuid || null, actorName: targetToken.actor?.name, recipientUserIds: [] }],
            test: normalizedResistance.test, consequence: normalizedResistance.consequence
        };
        await executeRollRequest(silentRequest, targetKey, { prompt: false, onResult: async result => {
            if (!game.user.isGM) {
                game.socket.emit("system.gum", { type: "rollRequest:silentBarrierResult", request: silentRequest, targetKey, userId: game.user.id, result, context: { applicationContext } });
                return;
            }
            const barrier = evaluateBarrierConsequence(result, normalizedResistance.consequence);
            if (barrier.shouldApply) await applySingleEffect(effectItem, [targetToken], { actor: sourceActor, origin: originItem || effectItem, actionIds: barrier.actionIds, ...applicationContext });
        }});
        return;
    }
    const applyOnText = game.i18n.localize(rollData.mode === 'conditional' ? "GUM.RollRequest.ConditionalResults" : (rollData.applyOn === 'success' ? "GUM.RollRequest.OnSuccess" : "GUM.RollRequest.OnFailure"));
    const marginValue = rollData.mode === 'conditional' ? game.i18n.localize("GUM.RollRequest.PerResult") : ((rollData.margin !== undefined && rollData.margin !== null && rollData.margin !== '') ? rollData.margin : '—');
    const rawModifier = (rollData.modifier ?? "").toString().trim();
    const previewModifier = resistanceModifier;
    const previewModifierSigned = previewModifier > 0 ? `+${previewModifier}` : `${previewModifier}`;
    const testLabel = `${(rollData.attribute || 'HT').toUpperCase()}${rawModifier && previewModifier !== 0 ? ` ${previewModifierSigned}` : ''}`;
    const resistanceChatText = (rollData.chatText || "").toString().trim();
 
    const chatPayload = {
        mode: options.mode || "activation",
        targetActorId: targetToken.actor?.id,
        targetTokenId: targetToken.id,
        effectItemUuid: effectItem.uuid || null,
        sourceActorId: sourceActor?.id || null,
        originItemUuid: originItem?.uuid || null,
        effectLinkId: effectLinkId || null,
        conditionId: options.conditionId || null,
        conditionActivationMode: options.conditionActivationMode || null,
        applicationContext
    };
 const targetKey = targetToken.document?.uuid || targetToken.uuid || targetToken.actor?.uuid;
 const request = {
        version: 1, id: foundry.utils.randomID(), status: "pending", title: game.i18n.format("GUM.RollRequest.ResistanceTitle", { name: effectItem.name }),
        origin: { type: "effect-barrier", sourceActorUuid: sourceActor?.uuid, sourceItemUuid: originItem?.uuid, effectUuid: effectItem.uuid, effectLinkId },
        targets: [{ targetKey, actorUuid: targetToken.actor?.uuid, tokenUuid: targetToken.document?.uuid || targetToken.uuid || null, actorName: targetToken.actor?.name, recipientUserIds: [] }],
        test: normalizedResistance.test, consequence: normalizedResistance.consequence, delivery: {}, responses: []
    };

 const content = renderPendingResistanceRequest({
        request, effectName: effectItem.name, effectImg: effectItem.img,
        originLabel: sourceActor?.name || originItem?.name || "Origem desconhecida",
        targetName: targetToken.name || targetToken.actor?.name || "Alvo",
        targetImg: resolveCharacterImage(targetToken.actor, { token: targetToken }),
        testLabel: game.i18n.format("GUM.RollRequest.TestOf", { test: testLabel }), modifierLabel: rawModifier ? game.i18n.format("GUM.RollRequest.BarrierModifier", { modifier: previewModifierSigned }) : "",
        applyOnLabel: applyOnText, marginLabel: marginValue,
        purposeLabels: getPurposeLabels(normalizedResistance.test.requestedPurposeIds),
        description: resistanceChatText
    });


    const chatData = {
        speaker: ChatMessage.getSpeaker({ actor: targetToken.actor || sourceActor }),
        content,
        flags: { gum: { rollRequest: request, resistanceContext: chatPayload } }
    };
    const privacy = getResistanceChatPrivacy({
        visibility: rollData.chatVisibility,
        actor: targetToken.actor,
        users: game.users
    });
        if (privacy.mode === "publicroll") {
        const publicData = typeof ChatMessage.applyMode === "function"
            ? ChatMessage.applyMode(chatData, privacy.mode)
            : typeof ChatMessage.applyRollMode === "function"
                ? ChatMessage.applyRollMode(chatData, privacy.mode)
                : { ...chatData, rollMode: privacy.mode };
        ChatMessage.create(publicData);
    } else {
        ChatMessage.create({ ...chatData, whisper: privacy.whisper });
    }
}

/**
 * Ponto de entrada comum para aplicações diretas de Itens de Efeito.
 * Garante que arrastar para a ficha, usar o Escudo do Mestre e outros
 * consumidores não contornem a Barreira de Resistência.
 */
export async function applyEffectWithResistance(effectItem, targets, context = {}) {
    if (!effectItem || !Array.isArray(targets) || targets.length === 0) return { requested: false, applied: false };
    const resistanceRoll = effectItem.system?.resistanceRoll || {};
    if (!resistanceRoll.isResisted) {
        await applySingleEffect(effectItem, targets, context);
        return { requested: false, applied: true };
    }

    for (const target of targets) {
        await _promptActivationResistance(
            effectItem,
            target,
            context.actor || target.actor,
            context.origin || effectItem,
            context.effectLinkId || null,
            { ...context, mode: context.mode || "direct" }
        );
    }
    return { requested: true, applied: false };
}

// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() {
    installItemCompendiumExportSourceCompatibility();
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    registerContextMenuCompatibilityHooks({ Hooks, generation: game.release?.generation });
    registerHexOccupancyCanvasLayer(CONFIG);
    registerHexOccupancyCanvasHooks(Hooks);
    GumPreviewDialog.registerChatDetailsHandler();
    installGumApi({
        gameRef: game,
        hooks: Hooks,
        dependencies: {
            importFromGCS,
            importCharacterFromJson,
            rollFromHotbar,
            damageFromHotbar,
            performGURPSRoll,
            executeRollRequest,
            applyUseEventEffects,
            applyEffectWithResistance,
            applySingleEffect,
            getEffectActions,
            resolveCombatDamageFormula,
            resolveCombatDamageProfile,
            resolveTargetCombatDefenseRecalculationModifiers,
            setStateEffectGroupActive,
            syncItemStateEffects,
            ensureEffectItemBridge,
            contentSourceService,
            contentSourcePurposes: CONTENT_SOURCE_PURPOSES,
            openTestRequestLauncher,
            openGmScreen: () => {
                game.gum.gmScreen ??= new GumGMScreen();
                game.gum.gmScreen.render(true);
                return game.gum.gmScreen;
            },
            openContentSourceConfig: () => new ContentSourceConfig().render(true),
            openWorldStatusConfig: () => new WorldStatusConfig().render(true)
        }
    });

    if (!registerGumRegionEffectBehavior()) {
        console.warn("GUM | A API de comportamentos de Região não está disponível nesta versão do Foundry.");
    }
    CONFIG.Actor.documentClass = GurpsActor;

    registerSystemSettings();
    const movementRulerRegistered = registerMovementRulerIntegration(CONFIG, {
        generation: game.release?.generation
    });
    const distanceRulerRegistered = registerDistanceRulerIntegration(CONFIG, {
        generation: game.release?.generation
    });
    if (!movementRulerRegistered && Number(game.release?.generation) >= 13) {
        console.warn("GUM | A API do medidor de movimento do token não está disponível nesta versão do Foundry.");
    }
    if (!distanceRulerRegistered && Number(game.release?.generation) >= 13) {
        console.warn("GUM | A API da régua de distância não está disponível nesta versão do Foundry.");
    }

    Hooks.on("gumWorldStatusConfigurationChanged", ({ rows }) => {
        synchronizeWorldStatusRuntime(rows).catch(error => {
            console.error("GUM | Falha ao sincronizar a configuração de status do mundo.", error);
        });
    });

    Hooks.on("hotbarDrop", (bar, data, slot) => {
        if (data?.type === "GUM.Roll") return createGumRollMacro(data, slot);
        if (data?.type === "GUM.DamageRoll") return createGumDamageMacro(data, slot);
    });
    
    // --- 2. LÊ A CONFIGURAÇÃO E APLICA NO SISTEMA DE COMBATE ---
    // ✅ A CORREÇÃO FINAL:
    // Nós lemos o *valor* da configuração que acabamos de registrar...
    const initiativeFormula = game.settings.get("gum", "initiativeFormula");
    
    // ...e passamos esse *valor* (a fórmula real) para o CONFIG.
    CONFIG.Combat.initiative = {
      formula: initiativeFormula, // Agora isto contém "@attributes.basic_speed.final..."
      decimals: 3 //
    };
    
    ActorsCollection.registerSheet("gum", GurpsActorSheet, { 
        types: ["character"], makeDefault: true 
    }); 
    ItemsCollection.registerSheet("gum", GurpsItemSheet, { makeDefault: true });
    ItemsCollection.registerSheet("gum", MoneySourceSheet, {
        types: ["money_source"],
        makeDefault: true,
        label: game.i18n.localize("GUM.MoneySource.SheetLabel")
    });
    ItemsCollection.registerSheet("gum", ConditionSheet, { 
        types: ["condition"], 
        makeDefault: true 
    });
    ItemsCollection.registerSheet("gum", EffectSheet, { 
    types: ["effect"], 
    makeDefault: true 
    });
    ItemsCollection.registerSheet("gum", TriggerSheet, { 
    types: ["trigger"], 
    makeDefault: true 
    });
        ItemsCollection.registerSheet("gum", TemplateItemSheet, {
        types: ["template"],
        makeDefault: true,
        label: "Modelo"
    });

    
    

    // ==================================================================
    // ▼▼▼ BLOCO DE HOOKS CENTRALIZADOS AQUI ▼▼▼
    // ==================================================================
    
// ✅ HOOKS DE CRIAÇÃO DE ATOR
    Hooks.on("preCreateActor", (actor, data, options, userId) => {
        if (game.user.id !== userId) return;
        if (actor.type !== "character") return;

        const source = actor._source ?? data ?? {};
        const hasDefaultModifierFlag = foundry.utils.getProperty(source, "flags.gum.useDefaultModifiers") !== undefined;
        if (!hasDefaultModifierFlag) {
            actor.updateSource({ "flags.gum.useDefaultModifiers": true });
        }
    });

    // Popula novos personagens apenas com regras/condições passivas.
    // Modificadores de rolagem ficam disponíveis via compêndio quando
    // flags.gum.useDefaultModifiers está marcado, sem serem copiados para a ficha.
    Hooks.on("createActor", async (actor, options, userId) => {
        if (game.user.id !== userId) return;
        if (actor.type !== "character") return;

        if (!actor.getFlag("gum", "useDefaultModifiers")) {
            await actor.setFlag("gum", "useDefaultModifiers", true);
        }
        
        // A configuração mundial autoritativa substitui a antiga chave geral.
        // A chave legada continua valendo apenas enquanto a nova janela ainda
        // não tiver sido inicializada.
        const passiveConfiguration = normalizePassiveConditionConfiguration(game.settings.get("gum", PASSIVE_CONDITION_CONFIG_SETTING));
        if (!passiveConfiguration.initialized && !game.settings.get("gum", "addDefaultRules")) return;
    
        console.log(`GUM | Populando novo ator: ${actor.name}`);
        const itemsToCreate = [];
        const normalizeItemForV13 = (data, compendiumSource) => {
            if (!data || typeof data !== "object") return data;
            if (data.flags && Object.prototype.hasOwnProperty.call(data.flags, "exportSource")) {
                delete data.flags.exportSource;
                if (Object.keys(data.flags).length === 0) delete data.flags;
            }
            data._stats = {
                ...(data._stats || {}),
                compendiumSource
            };
            return data;
        };

        // 1. REGRAS / CONDIÇÕES PASSIVAS
        let passiveRecords;
        let invalidSources = [];
        if (passiveConfiguration.initialized) {
            const resolution = await resolvePassiveConditionConfiguration(passiveConfiguration);
            passiveRecords = resolution.resolved;
            invalidSources = resolution.missing;
        } else {
            const legacy = await contentSourceService.getDocuments("passiveConditions");
            passiveRecords = legacy.documents.map(item => ({ document: item, configId: item.uuid, sourceUuid: item.uuid }));
            invalidSources = legacy.invalidSources;
        }
        passiveRecords.forEach(record => {
            const item = record.document;
            if (item.system?.bindingMode === "status-link") return;
            const data = normalizeItemForV13(preparePassiveConditionCreateData(item, record), record.sourceUuid || item.uuid);
            itemsToCreate.push(data);
        });
        if (invalidSources.length) {
            console.warn("GUM | Fontes de Condições Passivas indisponíveis:", invalidSources.map(source => source.id));
        }
        console.log(`GUM | Preparadas ${itemsToCreate.length} condições passivas para cópia.`);

        // 2. CRIAÇÃO EM LOTE (Muito mais rápido)
        if (itemsToCreate.length > 0) {
            try {
                await actor.createEmbeddedDocuments("Item", itemsToCreate);
                console.log(`GUM | Sucesso! ${itemsToCreate.length} itens iniciais adicionados a ${actor.name}.`);
            } catch (err) {
                console.error("GUM | Falha ao popular ator:", err);
            }
        }
    });

    // Capture o valor anterior para emitir cruzamentos de PV/PF independentemente
    // da origem da atualização (ficha, macro, efeito ou dano).
    Hooks.on("preUpdateActor", (actor, data, options = {}) => {
        if (options.gumSkipResourceChangeEvents) return;
        options.gumResourceChangeEvents = captureActorResourceChanges(actor, data, {
            eventData: options.gumEventData,
            eventIdFactory: () => foundry.utils.randomID()
        });
    });

    // Gatilho principal para quando os dados do ator mudam (HP, etc.)
    Hooks.on("updateActor", async (actor, data, options = {}, userId) => {
        if (game.user.id !== userId) return;
        try {
            await processConditions(actor, options.gumEventData);
            for (const resourceEvent of options.gumResourceChangeEvents || []) {
                await processConditions(actor, resourceEvent);
            }
            await processStatusBindings(actor);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        } catch (error) {
            console.error("GUM | Falha no hook updateActor durante processamento de condições/status binding.", error);
        }
    });

Hooks.on("createItem", async (item, options, userId) => {
        invalidateHybridItemIndex();
        if (game.user.id === userId && item.type === "effect") {
            await ensureEffectItemBridge(item).catch(error => {
                console.warn(`GUM | Falha ao criar a ponte ActiveEffect de "${item.name}".`, error);
            });
        }
        // Só executa para o usuário que fez a ação e se o item foi adicionado a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent; // Define o ator uma vez, pois sabemos que ele existe

        // Lógica para quando uma CONDIÇÃO é adicionada
        if (item.type === "condition") {
            await processConditions(actor);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        }

        // Lógica para EFEITOS PASSIVOS (pode rodar para qualquer tipo de item)
        if (item.system.passiveEffects && Object.keys(item.system.passiveEffects).length > 0) {
            const passiveEffectLinks = Object.values(item.system.passiveEffects);
            console.log(`[GUM] Item "${item.name}" adicionado a ${actor.name}. Aplicando ${passiveEffectLinks.length} efeito(s) passivo(s)...`);

        const targets = buildActorEffectTargets(actor);
            for (const linkData of passiveEffectLinks) {
                const effectUuid = linkData.effectUuid || linkData.uuid;
                if (!effectUuid) continue;

                const effectItem = await fromUuid(effectUuid);
                if (effectItem) {
                    try {
                        await applySingleEffect(effectItem, targets, {
                            actor,
                            origin: item,
                            source: "passiveItem",
                            stackingDomain: "managed",
                            originItemId: item.id
                        });
                        console.log(` -> Efeito passivo "${effectItem.name}" aplicado.`);
                    } catch (err) {
                        console.error(`[GUM] Falha ao criar ActiveEffect passivo para ${effectItem.name}:`, err);
                    }
                }
            }
            
            // Força a reavaliação e redesenho UMA VEZ no final, após todos os efeitos
            await processConditions(actor);
            await processStatusBindings(actor);
            actor.sheet.render(false);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        }
        await syncEquipmentModifierGrantedEffects(item);
        await syncItemStateEffects(item, { assumeInactive: true });
    });

    Hooks.on("preUpdateItem", (item, changes, options = {}) => {
        if (options.gumSkipResourceChangeEvents || !item.parent) return;
        options.gumResourceChangeEvents = captureItemResourceChanges(item, changes, {
            eventData: options.gumEventData,
            eventIdFactory: () => foundry.utils.randomID()
        });
    });

    Hooks.on("updateItem", async (item, changes, options, userId) => {
        invalidateHybridItemIndex();
        if (game.user.id === userId && item.type === "effect" && !options.gumEffectBridgeSync) {
            await ensureEffectItemBridge(item).catch(error => {
                console.warn(`GUM | Falha ao sincronizar a ponte ActiveEffect de "${item.name}".`, error);
            });
        }
        // Só executa para o usuário que fez a ação e se o item pertence a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent;

        // --- LÓGICA EXISTENTE PARA 'condition' ---
        if (item.type === "condition") {
            await processConditions(actor);
            await processStatusBindings(actor);
            // O redesenho será feito no final, não precisamos mais dele aqui.
        }

        // =============================================================
        // ✅ LÓGICA DE SINCRONIZAÇÃO PARA EFEITOS PASSIVOS (UPDATE)
        // =============================================================
        // Verifica se o item atualizado tem a capacidade de ter passiveEffects
        // Usamos hasOwnProperty para ser seguro, mas podemos checar 'item.system.passiveEffects'
                const passiveEffectsChanged = foundry.utils.hasProperty(changes, "system.passiveEffects")
            || Object.keys(changes || {}).some(key => key.startsWith("system.passiveEffects"));
        const originLevelChanged = foundry.utils.hasProperty(changes, "system.level")
            || Object.prototype.hasOwnProperty.call(changes.system || {}, "level");
        if (item.system.passiveEffects && (passiveEffectsChanged || originLevelChanged)) {
            
            // 1. Encontra e Deleta TODOS os ActiveEffects existentes originados deste item
            const updatedItemId = item.id;
            const effectsToDelete = actor.effects.filter(effect => 
            foundry.utils.getProperty(effect, "flags.gum.originItemId") === updatedItemId                    
                && foundry.utils.getProperty(effect, "flags.gum.source") === "passiveItem"
            );

            if (effectsToDelete.length > 0) {
                const idsToDelete = effectsToDelete.map(e => e.id);
                console.log(`[GUM] Item "${item.name}" atualizado. Removendo ${idsToDelete.length} efeito(s) passivo(s) antigo(s)...`);
                await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
            }

            // 2. Recria TODOS os ActiveEffects da lista atualizada do item
            // (Esta lógica é uma cópia da que está no hook 'createItem')
                     const passiveEffectLinks = Object.values(item.system.passiveEffects || {});
            if (passiveEffectLinks.length > 0) {
                console.log(`[GUM] ...Recriando ${passiveEffectLinks.length} efeito(s) passivo(s) atualizado(s).`);
const targets = buildActorEffectTargets(actor);
                for (const linkData of passiveEffectLinks) {
                    const effectUuid = linkData.effectUuid || linkData.uuid;
                    if (!effectUuid) continue;

                    const effectItem = await fromUuid(effectUuid);
                    if (effectItem) {
                        try {
                            await applySingleEffect(effectItem, targets, {
                                actor,
                                origin: item,
                                source: "passiveItem",
                                stackingDomain: "managed",
                                originItemId: item.id,                                
                                skipInstantEffects: true
                            });
                        } catch (err) {
                            console.error(`[GUM] Falha ao criar ActiveEffect passivo (update):`, err);
                        }
                    }
                }
            }
        } // Fim do if (item.system.passiveEffects)
        if (item.type === "equipment" && hasEquipmentGrantRelevantChange(changes)) {
            await syncEquipmentModifierGrantedEffects(item);
        }
        if (!options.gumStateSync && !options.gumStateToggle) {
            const stateGroupsChanged = foundry.utils.hasProperty(changes, "system.stateEffectGroups")
                || Object.keys(changes || {}).some(key => key.startsWith("system.stateEffectGroups"));
            await syncItemStateEffects(item, { refreshActive: stateGroupsChanged || originLevelChanged });
        }
        // =============================================================
        
        // --- Chamada final de atualização ---
        // Sempre reavalia e redesenha após QUALQUER atualização de item no ator
        await processConditions(actor, options.gumEventData ?? null);
        for (const resourceEvent of options.gumResourceChangeEvents || []) {
            await processConditions(actor, resourceEvent);
        }
        await processStatusBindings(actor);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    });

   Hooks.on("deleteItem", async (item, options, userId) => {
        invalidateHybridItemIndex();
        // Só executa para o usuário que fez a ação e se o item pertencia a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent; // Define o ator uma vez
        const deletedItemId = item.id; // ID do item que foi removido
        await removeAllStateEffectsForItem(item);

        // --- LÓGICA PARA CONDIÇÕES (Sua lógica original) ---
        if (item.type === "condition") {
            // Apenas chamar processConditions é o suficiente, 
            // pois o item não existe mais e seus efeitos passivos sumirão
        }

        // =============================================================
        // ✅ LÓGICA DE EFEITOS PASSIVOS CORRIGIDA
        // =============================================================
        
        // Procura por efeitos que tenham a nossa "etiqueta" (flag)
        const effectsToDelete = actor.effects.filter(effect => 
            foundry.utils.getProperty(effect, "flags.gum.originItemId") === deletedItemId
        );

        if (effectsToDelete.length > 0) {
            const idsToDelete = effectsToDelete.map(e => e.id);
            console.log(`[GUM] Item "${item.name}" removido de ${actor.name}. Removendo ${idsToDelete.length} efeito(s) passivo(s) associado(s):`, idsToDelete);
            
            try {
                // Deleta os ActiveEffects encontrados
                await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
            } catch (err) {
                console.error(`[GUM] Falha ao remover ActiveEffects passivos:`, err);
            }
        }
        
        // --- Chamada final de atualização ---
        // Sempre chama processConditions e redesenha após deletar QUALQUER item,
        // garantindo que o estado do ator seja reavaliado.
        await processConditions(actor);
        await processStatusBindings(actor);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    });

   Hooks.on("updateCombat", async (combat, changed, options, userId) => {
        const isConditionAuthority = isPrimaryActiveGM();
        
        // ==========================================================
        // ✅ BLOCO DE CORREÇÃO DO ÍCONE (INÍCIO)
        // ==========================================================
        // Se o combate foi desativado (encerrado) ou o round resetado para null
        if (changed.active === false || (changed.hasOwnProperty('round') && changed.round === null)) {
            console.log("GUM | Combate encerrado. Limpando ícones dos tokens.");
            if (isConditionAuthority) {
                await handleCombatEnd(combat);
                const eventBaseId = foundry.utils.randomID();
                for (const combatant of combat.combatants) {
                    if (!combatant.actor) continue;
                    await processConditions(combatant.actor, buildCombatConditionEvent({
                        eventId: `${eventBaseId}:${combatant.id}`,
                        phase: "combat_end",
                        combat,
                        combatant,
                        previous: combat.previous
                    }));
                }
            }
            // Loop em TODOS os combatentes para limpar seus ícones
            for (const combatant of combat.combatants) {
                // token.object.refresh() é a forma mais segura de forçar a limpeza
                if (combatant.token?.object) {
                    combatant.token.object.refresh();
                }
            }
            refreshGMScreen();
            return; // Encerra aqui, não precisa processar turnos
        }
        // ==========================================================
        // ✅ BLOCO DE CORREÇÃO DO ÍCONE (FIM)
        // ==========================================================

        if (!isConditionAuthority) return;

        if (changed.active === true) {
            await handleCombatStart(combat);
            const eventBaseId = foundry.utils.randomID();
            for (const combatant of combat.combatants) {
                if (!combatant.actor) continue;
                await processConditions(combatant.actor, buildCombatConditionEvent({
                    eventId: `${eventBaseId}:${combatant.id}`,
                    phase: "combat_start",
                    combat,
                    combatant,
                    previous: combat.previous
                }));
            }
        }

        if (changed.round !== undefined) {
            const previousRound = Number(combat.previous?.round);
            const currentRound = Number(combat.round);
            if (Number.isFinite(previousRound) && previousRound > 0 && previousRound !== currentRound) {
                const roundEndEventId = foundry.utils.randomID();
                for (const combatant of combat.combatants) {
                    if (!combatant.actor) continue;
                    await processConditions(combatant.actor, buildCombatConditionEvent({
                        eventId: `${roundEndEventId}:${combatant.id}`,
                        phase: "round_end",
                        combat,
                        combatant,
                        previous: combat.previous
                    }));
                }
            }
            const roundStartEventId = foundry.utils.randomID();
            for (const combatant of combat.combatants) {
                if (!combatant.actor) continue;
                await processConditions(combatant.actor, buildCombatConditionEvent({
                    eventId: `${roundStartEventId}:${combatant.id}`,
                    phase: "round_start",
                    combat,
                    combatant,
                    previous: combat.previous
                }));
            }
        }

        // --- Lógica de Início de Turno (Seu código original, sem alteração) ---
        if (changed.round !== undefined || (changed.turn !== undefined && combat.combatant)) {
            const currentCombatant = combat.combatant;
            if (currentCombatant?.actor) {
                await handleCombatTurnStart(currentCombatant);
                await processConditions(currentCombatant.actor, buildCombatConditionEvent({
                    eventId: foundry.utils.randomID(),
                    phase: "turn_start",
                    reason: "turnStart",
                    combat,
                    combatant: currentCombatant,
                    previous: combat.previous
                }));
                currentCombatant.token?.object?.drawEffects(); 
            }
        }

        // --- Lógica de Fim de Turno (Seu código original, sem alteração) ---
        if (changed.turn !== undefined && combat.previous.combatantId) {
            const previousCombatant = combat.combatants.get(combat.previous.combatantId);
            if (previousCombatant?.actor) {
                const actor = previousCombatant.actor;
                await manageActiveEffectDurations(actor); 
                await processConditions(actor, buildCombatConditionEvent({
                    eventId: foundry.utils.randomID(),
                    phase: "turn_end",
                    combat,
                    combatant: previousCombatant,
                    previous: combat.previous
                }));
                actor.getActiveTokens().forEach(token => token.drawEffects()); 
            }
        }

        // Mantém o Escudo do Mestre sincronizado após toda a cadeia assíncrona
        // de início/fim de turno e expiração de efeitos.
        refreshGMScreen();
    });

    // ==========================================================
    // ✅ NOVO HOOK: Limpa ícones quando o combate é DELETADO
    // ==========================================================
    Hooks.on("deleteCombat", (combat, options, userId) => {
        console.log("GUM | Combate deletado. Limpando ícones dos tokens.");
        for (const combatant of combat.combatants) {
            // token.object.refresh() força uma atualização completa da aparência do token
            if (combatant.token?.object) {
                 combatant.token.object.refresh();
            }
        }
    });

    // ==========================================================
    // ✅ NOVO HOOK: Muda para a aba de Combate ao adicionar token
    // ==========================================================
    Hooks.on("createCombatant", (combatant, options, userId) => {
        // Só executa para o usuário que está interagindo
        if (game.user.id !== userId) return;

        // --- Ponto 1: Mudar a aba da Ficha do Ator (Já implementado) ---
        const actor = combatant.actor;
        if (actor && actor.sheet.rendered) {
            actor.sheet.activateTab("combat");
        }

        // --- Ponto 2: Abrir o "Encontro" (o Combat Tracker) ---
        // 'ui.combat' é o app da sidebar de combate.
        // Se ele não estiver renderizado (visível), chame .render(true) para abri-lo.
        if (ui.combat && !ui.combat.rendered) {
            ui.combat.render(true);
        }
    });

// ==========================================================
    // ✅ NOVO HOOK: Adiciona o botão "Importar GCS" na barra de Atores
    // ==========================================================
Hooks.on("renderActorDirectory", (app, html, data) => {
        // Exibe para mestres e para jogadores autorizados a criar atores.
        if (!canUserCreateActors(game.user)) return;

        const root = html?.querySelector ? html : html?.[0];
        const headerActions = root?.querySelector?.(".directory-header .header-actions");
        if (!headerActions || root.querySelector(".gcs-import-button")) return;
        const row = document.createElement("div");
        row.className = "gum-directory-import-actions";
        row.innerHTML = `
            <button class="gcs-import-button" type="button">
                <i class="fas fa-file-import"></i> ${game.i18n.localize("GUM.LibraryImport.ImportGCSCharacter")}
            </button>
            <button class="gum-character-json-import-button" type="button">
                <i class="fas fa-user-plus"></i> ${game.i18n.localize("GUM.LibraryImport.ImportGumCharacter")}
            </button>
        `;
        row.querySelector(".gcs-import-button").addEventListener("click", () => game.gum.importFromGCS());
        row.querySelector(".gum-character-json-import-button").addEventListener("click", () => game.gum.importCharacterFromJson());

        headerActions.append(row);
    });

});


// ================================================================== //
//  2.1 HOOK DE PRONTO (`ready`)
// ================================================================== //
Hooks.once('ready', async function() {
    registerTestRequestSocket();
    registerRollRequestSocket();
    game.socket.on("system.gum", enqueueResistanceSocketResult);
    console.log("GUM | Fase 'ready': Aplicando configurações.");

    _registerGumChatCommands();

    await _showGumCommandHelp({ startup: true }).catch(error => {
        console.warn("GUM | Não foi possível publicar a ajuda de comandos no chat.", error);
    });

    await migrateEffectTokenIconPolicy();
    await migrateEffectActionsSchema();
    await migrateBasicDamageSchema();

    $('body').on('click', '.apply-damage-button', async (ev) => {
    ev.preventDefault();
    console.log("GUM | DEBUG: Botão 'Aplicar Dano' clicado.");

    const button = ev.currentTarget;

    // 1. Lê o pacote de dados para que cards gerados por efeitos possam conservar seu alvo.
    const damagePackageJSON = button.dataset.damage;
    if (!damagePackageJSON) {
        console.error("GUM | DEBUG: Pacote de dados de dano não encontrado no botão.");
        return ui.notifications.error("Erro crítico: Pacote de dados de dano ausente.");
    }
    let damagePackage;
    try {
        damagePackage = JSON.parse(damagePackageJSON);
    } catch (error) {
        console.error("GUM | Pacote de dano inválido.", error);
        return ui.notifications.error("Erro crítico: Pacote de dados de dano inválido.");
    }

    const preferredTokens = [];
    if (damagePackage.targetTokenUuid) {
        const tokenDocument = await fromUuid(damagePackage.targetTokenUuid).catch(() => null);
        const token = tokenDocument?.object ?? canvas.tokens.get(tokenDocument?.id);
        if (token?.actor) preferredTokens.push(token);
    } else if (damagePackage.targetActorUuid) {
        const actor = await fromUuid(damagePackage.targetActorUuid).catch(() => null);
        preferredTokens.push(...(actor?.getActiveTokens?.() || []).filter(token => token?.actor));
    }

    // Um alvo marcado explicitamente vence o alvo conservado no card; o token
    // controlado continua sendo o último fallback para cards antigos.
    const targetResolution = resolveDamageApplicationTarget({
        targetedTokens: game.user.targets,
        preferredTokens,
        controlledTokens: canvas.tokens.controlled
    });
    if (!targetResolution.token) {
        const key = targetResolution.reason === "multiple-targets"
            ? "GUM.DamageApplication.MultipleTargets"
            : "GUM.DamageApplication.SelectSingleTarget";
        return ui.notifications.warn(game.i18n.localize(key));
    }
    const targetToken = targetResolution.token;
    const targetActor = targetToken.actor;
    console.log(`GUM | DEBUG: Etapa 1 OK. Alvo: ${targetActor.name}`);

    console.log("GUM | DEBUG: Etapa 2 OK. Pacote de dados lido:", damagePackage);

    // 3. Encontra o ator atacante pela ID.
    // Rolagens rápidas do Escudo do Mestre não têm um ator atacante real;
    // nesses casos, usamos um atacante sintético para manter a aplicação de dano disponível.
    const attackerActor = damagePackage.attackerId
        ? game.actors.get(damagePackage.attackerId)
        : { id: null, name: damagePackage.attackerName || "Mestre", img: "icons/svg/mystery-man.svg" };
    if (!attackerActor) {
        console.error(`GUM | DEBUG: Falha na Etapa 3. Ator atacante com ID "${damagePackage.attackerId}" não encontrado.`);
        return ui.notifications.error("Erro: Ator atacante não encontrado. A mensagem de chat pode ser antiga.");
    }
    console.log(`GUM | DEBUG: Etapa 3 OK. Atacante: ${attackerActor.name}`);

    // 4. Cria e renderiza nossa nova janela
    console.log("GUM | DEBUG: Etapa 4. Tudo pronto para abrir a janela.");
        const attackerToken = damagePackage.attackerTokenId
        ? canvas.tokens.get(damagePackage.attackerTokenId)
        : null;
    new DamageApplicationWindow(damagePackage, attackerActor, targetActor, {
        attackerToken,
        targetToken
    }).render(true);
});
    

 const normalizeTestKey = (value) => value?.toString?.().trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const resolveActorTestValue = (actor, rawKey) => {
    if (!actor) return null;
    const key = rawKey?.toString?.().trim();
    if (!key) return null;

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey) && key !== "") return numericKey;

    const canonicalAttributeKey = normalizeRequestedAttributeKey(key);
    const attributeCandidates = [canonicalAttributeKey, key, key.toLowerCase(), key.toUpperCase()];
    let attributeObject = null;
    for (const candidate of attributeCandidates) {
        attributeObject = foundry.utils.getProperty(actor.system?.attributes, candidate);
        if (attributeObject) break;
    }
    if (attributeObject) {
        return (attributeObject.override !== null && attributeObject.override !== undefined)
            ? attributeObject.override
            : attributeObject.final;
    }

    const normalizedKey = normalizeTestKey(key);
    const skills = actor.items?.filter(item => item.type === 'skill') || [];
    const matchedSkill = skills.find(skill => normalizeTestKey(skill.name) === normalizedKey);
    if (matchedSkill) {
        return matchedSkill.system?.final_nh ?? matchedSkill.system?.nh ?? 10;
    }

    return null;
};

const formatTestLabel = (rawKey) => {
    if (!rawKey) return "HT";
    const key = rawKey.toString().trim();
    const option = getRequestedAttributeOption(key);
    if (option) return option.label;
    return key;
};

$('body').on('click', '.chat-message .rollable', async (ev) => {
        const element = ev.currentTarget;
        const speaker = ChatMessage.getSpeaker({ scene: $(element).closest('.message').data('scene-id'), actor: $(element).closest('.message').data('actor-id') });
        const actor = ChatMessage.getSpeakerActor(speaker);
        if (!actor) return ui.notifications.warn("Ator da mensagem de chat não encontrado.");

        const rollValue = Number(element.dataset.rollValue);
        const rollLabel = element.dataset.label || "Teste";
        const isEffectChatRollButton = element.classList.contains("gum-chat-roll-button");

        if (isEffectChatRollButton) {
            if (ev.shiftKey) {
                performGURPSRoll(actor, { label: rollLabel, value: rollValue, modifier: 0 });
                return;
            }

            const promptData = {
                label: rollLabel,
                type: "attribute",
                value: rollValue,
                modifier: 0,
                img: actor.img
            };

            new GurpsRollPrompt(actor, promptData, {
                onRoll: async (_actor, promptPayload, promptOptions = {}) => {
                    await performGURPSRoll(actor, {
                        label: rollLabel,
                        value: rollValue,
                        modifier: promptPayload.modifier || 0
                    }, { rollMode: promptOptions.rollMode });
                }
            }).render(true);
            return;
        }

        // A lógica de Shift+Click para modificadores
        if (ev.shiftKey) {
            new Dialog({
                title: "Modificador de Rolagem Situacional",
                content: `...`, // Seu HTML aqui
                buttons: {
                    roll: {
                        label: "Rolar",
                        callback: (html) => {
                            const situationalMod = parseInt(html.find('input[name="modifier"]').val()) || 0;
                            performGURPSRoll(actor, { label: rollLabel, value: rollValue, modifier: situationalMod });
                        }
                    }
                }
            }).render(true);
        } else {
            performGURPSRoll(actor, { label: rollLabel, value: rollValue, modifier: 0 });
        }
  });
$('body').on('click', '.chat-roll-damage-button', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const button = ev.currentTarget;
    const rawPayload = button?.dataset?.damageAction;
    if (!rawPayload) return ui.notifications.warn("Dados da rolagem de dano ausentes.");

    try {
        const payload = JSON.parse(decodeURIComponent(rawPayload));
        await _rollDamageFromChatAction(payload);
    } catch (error) {
        console.error("GUM | Falha ao executar rolagem de dano via chat:", error);
        ui.notifications.error("Falha ao executar rolagem de dano.");
    }
});

// ==========================================================
// LISTENER FINAL E ÚNICO PARA O BOTÃO DE RESISTÊNCIA
// ==========================================================

const resistanceResultQueues = new Map();
const handledSilentResistanceRequests = new Set();

async function processResistanceSocketResult(payload) {
    if (!game.user.isGM || !["rollRequest:damageResult", "rollRequest:barrierResult", "rollRequest:silentBarrierResult"].includes(payload?.type)) return;
    if (payload.type === "rollRequest:silentBarrierResult") {
        const request = normalizeRollRequest(payload.request);
        if (!request.id || handledSilentResistanceRequests.has(request.id) || request.origin?.type !== "effect-barrier") return;
        const target = request.targets.find(entry => entry.targetKey === payload.targetKey);
        const actorDocument = target ? await fromUuid(target.tokenUuid || target.actorUuid).catch(() => null) : null;
        const actor = actorDocument?.actor || actorDocument;
        const sender = game.users.get(payload.userId);
        const effectItem = request.origin.effectUuid ? await fromUuid(request.origin.effectUuid).catch(() => null) : null;
        if (!actor || !effectItem || !isUserAuthorizedForTarget(sender, actor, target)) return;
        if (!["total", "baseValue", "totalModifier", "effectiveTarget", "margin"].every(key => Number.isFinite(Number(payload.result?.[key])))) return;
        const canonical = evaluateGurpsRollResult(Number(payload.result.total), Number(payload.result.effectiveTarget));
        payload.result = { ...payload.result, margin: canonical.margin, outcome: canonical.outcome, resultLabel: canonical.resultLabel };
        handledSilentResistanceRequests.add(request.id);
        const barrier = evaluateBarrierConsequence(payload.result, request.consequence);
        if (barrier.shouldApply) {
            const targetToken = target.tokenUuid ? await fromUuid(target.tokenUuid).catch(() => null) : null;
            const targets = targetToken ? [targetToken.object || targetToken] : buildActorEffectTargets(actor);
            const applicationContext = payload.context?.applicationContext
                || (payload.context?.conditionId ? { conditionId: payload.context.conditionId, conditionActivationMode: payload.context.conditionActivationMode || null } : {});
            await applySingleEffect(effectItem, targets, { actor: request.origin.sourceActorUuid ? await fromUuid(request.origin.sourceActorUuid).catch(() => null) : null, origin: request.origin.sourceItemUuid ? await fromUuid(request.origin.sourceItemUuid).catch(() => effectItem) : effectItem, actionIds: barrier.actionIds, ...applicationContext });
        }
        return;
    }
    const message = game.messages.get(payload.messageId);
    const request = message?.getFlag("gum", "rollRequest");
    const context = message?.getFlag("gum", "resistanceContext");
    const isReroll = payload.reroll === true;
    if (!message || !request || request.id !== payload.requestId || !["pending", ...(isReroll ? ["resolved"] : [])].includes(request.status) || !context) return;
    const target = request.targets?.find(entry => entry.targetKey === payload.targetKey);
    const actorDocument = target ? await fromUuid(target.tokenUuid || target.actorUuid).catch(() => null) : null;
    const actor = actorDocument?.actor || actorDocument;
    const sender = game.users.get(payload.userId);
    if (!actor || !isUserAuthorizedForTarget(sender, actor, target)) return;
    if (!["total", "baseValue", "totalModifier", "effectiveTarget", "margin"].every(key => Number.isFinite(Number(payload.result?.[key])))) return;
    const canonical = evaluateGurpsRollResult(Number(payload.result.total), Number(payload.result.effectiveTarget));
    payload.result = { ...payload.result, margin: canonical.margin, outcome: canonical.outcome, resultLabel: canonical.resultLabel };
    const barrier = evaluateBarrierConsequence(payload.result, request.consequence);
    const wasEffectApplied = (request.responses || []).some(response => response.effectApplied === true || response.consequence === "Efeito aplicado" || response.consequence === game.i18n.localize("GUM.RollRequest.EffectApplied"));
    let effectApplied = wasEffectApplied;
    await message.update({ "flags.gum.rollRequest.status": "processing" });
        let consequenceLabel = barrier.shouldApply ? (barrier.branchLabels?.length ? game.i18n.format("GUM.RollRequest.Results", { results: barrier.branchLabels.join(", ") }) : game.i18n.localize("GUM.RollRequest.EffectApplicable")) : game.i18n.localize("GUM.RollRequest.EffectBlocked");
    if (payload.type === "rollRequest:damageResult") {
        const application = game.gum?.damageApplications?.get(String(context.damageApplicationId));
        if (!isMatchingDamageResistance(application, { targetActorId: actor.id, effectLinkId: context.effectLinkId, effectUuid: request.origin?.effectUuid })) {
            await message.update({ "flags.gum.rollRequest.status": "pending" });
            return;
        }
        const effect = application.availableOnDamageEffects.find(entry => entry.id === context.effectLinkId);
        await application.updateEffectCard(context.effectLinkId, { isSuccess: barrier.success, shouldApply: barrier.shouldApply, branchId: barrier.branchId, branchLabel: barrier.branchLabel, branchIds: barrier.branchIds, branchLabels: barrier.branchLabels, actionIds: barrier.actionIds, resultText: `${payload.result.total} vs ${payload.result.effectiveTarget} — ${game.i18n.localize(`GUM.RollCard.Outcome.${payload.result.outcome}`)}`, rollRequestId: request.id, result: payload.result }, effect.item.system, { autoApply: false });
        consequenceLabel = game.i18n.localize(barrier.shouldApply ? "GUM.RollRequest.AwaitingDamageApplication" : "GUM.RollRequest.EffectBlocked");
    } else if (barrier.shouldApply && !wasEffectApplied) {
        const effectItem = request.origin?.effectUuid ? await fromUuid(request.origin.effectUuid).catch(() => null) : null;
        if (!effectItem) { await message.update({ "flags.gum.rollRequest.status": "pending" }); return; }
        const targetToken = target.tokenUuid ? await fromUuid(target.tokenUuid).catch(() => null) : null;
        const targets = targetToken ? [targetToken.object || targetToken] : buildActorEffectTargets(actor);
        const originItem = context.originItemUuid ? await fromUuid(context.originItemUuid).catch(() => null) : null;
        const originActor = context.sourceActorId ? game.actors.get(context.sourceActorId) : null;
        const applicationContext = context.applicationContext
            || (context.mode === "condition" && context.conditionId ? { conditionId: context.conditionId, conditionActivationMode: context.conditionActivationMode || null } : {});
                await applySingleEffect(effectItem, targets, { actor: originActor, origin: originItem || effectItem, actionIds: barrier.actionIds, ...applicationContext });
        effectApplied = true;
        consequenceLabel = game.i18n.localize("GUM.RollRequest.EffectApplied");
    } else if (isReroll && wasEffectApplied) {
        consequenceLabel = game.i18n.localize(barrier.shouldApply ? "GUM.RollRequest.EffectAlreadyAppliedReroll" : "GUM.RollRequest.RerollEffectAlreadyApplied");
    }
    const updated = { ...request, status: "resolved", responses: [...(request.responses || []), { ...payload.result, consequence: consequenceLabel, effectApplied }] };
    await message.update({ content: appendResistanceRequestResult(message.content, { result: payload.result, consequenceLabel, purposeLabels: getPurposeLabels(payload.result.purposeIds), userName: sender.name, allowReroll: true, targetKey: payload.targetKey, rerollClass: "resistance-reroll-button" }), "flags.gum.rollRequest": updated });
}

function enqueueResistanceSocketResult(payload) {
    if (!["rollRequest:damageResult", "rollRequest:barrierResult", "rollRequest:silentBarrierResult"].includes(payload?.type)) return;
    const queueKey = payload.messageId || payload.request?.id;
    const previous = resistanceResultQueues.get(queueKey) ?? Promise.resolve();
    const next = previous.then(() => processResistanceSocketResult(payload)).catch(error => console.error("GUM | Resultado de resistência", error));
    const queued = next.finally(() => { if (resistanceResultQueues.get(queueKey) === queued) resistanceResultQueues.delete(queueKey); });
    resistanceResultQueues.set(queueKey, queued);
    return queued;
}


$('body').on('click', '.resistance-roll-button, .resistance-reroll-button', async ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const button = ev.currentTarget;
    const isReroll = button.classList.contains('resistance-reroll-button');
    button.disabled = true;
    let resultSubmitted = false;
    const restoreButton = () => {
        if (!resultSubmitted && button.isConnected) button.disabled = false;
    };
    const messageElement = button.closest('.message, li.chat-message');
    const message = game.messages.get(messageElement?.dataset.messageId);
    const legacyPayload = (() => { try { return JSON.parse(button.dataset.rollData || "{}"); } catch (_error) { return {}; } })();
    const context = message?.getFlag("gum", "resistanceContext") || legacyPayload;
    const effectItem = context.effectItemUuid ? await fromUuid(context.effectItemUuid).catch(() => null) : null;
    const effectData = effectItem?.toObject?.() || context.effectItemData;
    const rollConfig = effectItem?.system?.resistanceRoll || effectData?.system?.resistanceRoll || {};
    const normalized = normalizeResistanceRoll(rollConfig);
    const targetToken = context.targetTokenId ? canvas.tokens?.get(context.targetTokenId) : null;
    const targetActor = targetToken?.actor || (context.targetActorId ? game.actors.get(context.targetActorId) : null);
    if (!message || !effectData || !targetActor) {
        button.disabled = false;
        return ui.notifications.warn("Não foi possível validar o pedido de resistência.");
    }

    const targetKey = targetToken?.document?.uuid || targetActor.uuid;
    const storedRequest = message.getFlag("gum", "rollRequest");
    const evaluatedModifier = evaluateNumericFormula(rollConfig.modifier, { actor: targetActor, eventData: context }) || 0;
    const dynamicModifier = context.mode === "damage" && rollConfig.dynamicModifier
        ? (() => { try { return Number(Function("actor", "event", `return (${rollConfig.dynamicModifier})`)(targetActor, { damage: context.damage ?? 0, target: targetActor })) || 0; } catch (_error) { return 0; } })()
        : 0;
    const request = {
        ...(storedRequest || {}),
        version: 1,
        id: storedRequest?.id || `resistance:${message.id}`,
        status: isReroll ? "pending" : (storedRequest?.status || "pending"),
        title: storedRequest?.title || game.i18n.format("GUM.RollRequest.ResistanceTitle", { name: effectData.name }),
        origin: storedRequest?.origin || { type: context.mode === "damage" ? "damage-barrier" : "effect-barrier", effectUuid: context.effectItemUuid, effectLinkId: context.effectLinkId },
        targets: storedRequest?.targets?.length ? storedRequest.targets : [{ targetKey, actorUuid: targetActor.uuid, tokenUuid: targetToken?.document?.uuid || null, actorName: targetActor.name, recipientUserIds: [] }],
        test: { ...(storedRequest?.test || normalized.test), fixedModifier: evaluatedModifier + dynamicModifier },
        consequence: storedRequest?.consequence || normalized.consequence,
        delivery: storedRequest?.delivery || {}, responses: storedRequest?.responses || []
    };

    let outcome;
    try {
        outcome = await executeRollRequest(request, request.targets[0].targetKey, { prompt: !ev.shiftKey,
            onPromptClose: restoreButton,
            onResult: async result => {
                const payload = { type: context.mode === "damage" ? "rollRequest:damageResult" : "rollRequest:barrierResult", messageId: message.id, requestId: request.id, targetKey: request.targets[0].targetKey, userId: game.user.id, reroll: isReroll, result };
                if (game.user.isGM) await enqueueResistanceSocketResult(payload);
                else {
                    game.socket.emit("system.gum", payload);
                    ui.notifications.info("Resultado de resistência enviado ao Mestre.");
                }
                resultSubmitted = true;
            }
        });
    } catch (error) {
        restoreButton();
        console.error("GUM | Falha ao abrir ou executar teste da Barreira de Resistência:", error);
        return ui.notifications.error("Não foi possível realizar o teste de resistência.");
    }
    if (!outcome.accepted) {
        restoreButton();
        ui.notifications.warn(typeof outcome.reason === "string" && !["target", "permission", "processing"].includes(outcome.reason) ? outcome.reason : "Não foi possível realizar o teste de resistência.");
    } 
});

});



// ================================================================== //
//  3. HELPERS DO HANDLEBARS
// ================================================================== //

Handlebars.registerHelper('collapsibleState', function(targetId, allCollapsedData) {
    if (!allCollapsedData) return ""; // Padrão: Fechado
    if (!targetId) return "";
    
    // Tenta encontrar o estado salvo
    const isOpen = allCollapsedData[targetId];

    // Retorna 'open' apenas se for explicitamente true
    return isOpen === true ? "open" : ""; 
});

Handlebars.registerHelper('formatDR', function(drObject) {
    if (!drObject || typeof drObject !== 'object') {
        return drObject || 0;
    }

    const parts = [];
    const baseDR = drObject.base || 0;
    parts.push(baseDR.toString()); // Sempre começa com o valor base

    // Itera sobre todas as chaves (cont, cort, pi, qmd, etc.)
    for (const [type, mod] of Object.entries(drObject)) {
        if (type === 'base') continue; // Já cuidamos da base

        // ✅ CORREÇÃO: SOMA o modificador à base
        const finalDR = Math.max(0, baseDR + (mod || 0));
        
        // Só mostra se for diferente da base
        if (finalDR !== baseDR) {
            parts.push(`${finalDR} ${type}`);
        }
    }

    // Se a base for 0 e houver outros, podemos até omitir o "0 |"
    if (parts.length > 1 && parts[0] === "0") {
         parts.shift(); // Remove o "0"
    }
    
    // Une tudo com o separador |
    return new Handlebars.SafeString(parts.join(" | "));
});

Handlebars.registerHelper('includes', function(array, value) {
  return Array.isArray(array) && array.includes(value);
});

Handlebars.registerHelper('array', function(...args) {
  return args.slice(0, -1);
});

Handlebars.registerHelper('capitalize', function(str) {
  if (typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});
Handlebars.registerHelper('or', function() {
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.some(Boolean);
});
Handlebars.registerHelper('gt', function (a, b) {
    return a > b;
});

Handlebars.registerHelper('gte', function (a, b) {
    return a >= b;
});

    // Ajudante para transformar um objeto em um array de seus valores
    Handlebars.registerHelper('objectValues', function(obj) { return obj ? Object.values(obj) : []; });
    // Ajudante para pegar o primeiro elemento de um array
    Handlebars.registerHelper('first', function(arr) { return arr?.[0]; });
    // Este ajudante ensina ao sistema como executar um loop 'for' simples,
    Handlebars.registerHelper('for', function(from, to, block) {
        let accum = '';
        for(let i = from; i <= to; i++) {
            accum += block.fn(this, {data: {index: i}});
        }
        return accum;
    });
Handlebars.registerHelper('bar_style', function(current, max, type) {
    const M = Math.max(1, max);
    let width = 0;
    let color = "";

    const colors = {
        hp_normal: "#3b7d3b",
        hp_wounded: "#b8860b",
        hp_reeling: "#a53541",
        hp_near_death_1: "#8B0000",
        hp_near_death_2: "#700000",
        hp_near_death_3: "#580000",
        hp_near_death_4: "#400000",
        hp_dead: "#313131",
        
        fp_normal: "#3b5a7d",      // Azul (Padrão)
        fp_tired: "#6a5acd",       // Roxo (Cansado)
        fp_exhausted: "#483d8b",    // Roxo Escuro (Exausto)
        fp_unconscious: "#2c2c54"  // Roxo muito escuro (Inconsciente por fadiga)
    };

    if (type === 'hp') {
        if (current > 0) {
            width = Math.min(100, (current / M) * 100);
            if (current <= M / 3) color = colors.hp_wounded;
            else color = colors.hp_normal;
        } else {
            const negativeDepth = Math.abs(current);
            const deathThreshold = 5 * M;
            width = Math.min(100, (negativeDepth / deathThreshold) * 100);
            
            if (current <= -5 * M)      color = colors.hp_dead;
            else if (current <= -4 * M) color = colors.hp_near_death_4;
            else if (current <= -3 * M) color = colors.hp_near_death_3;
            else if (current <= -2 * M) color = colors.hp_near_death_2;
            else if (current <= -1 * M) color = colors.hp_near_death_1;
            else                        color = colors.hp_reeling;
        }
    } else { // fp
        // --- ✅ LÓGICA DE BARRA REVERSA APLICADA AOS PFs ✅ ---
        if (current > 0) {
            // Comportamento normal para PFs positivos
            width = Math.min(100, (current / M) * 100);
            if (current <= M / 3) color = colors.fp_tired;
            else color = colors.fp_normal;
        } else {
            // Comportamento "reverso" para PFs negativos
            // A barra enche à medida que o personagem vai de 0 a -PF Máx
            const negativeDepth = Math.abs(current);
            const unconsciousThreshold = M; // O limiar para inconsciência é -1 * PF Máx
            width = Math.min(100, (negativeDepth / unconsciousThreshold) * 100);
            
            // Se os PFs forem negativos, o personagem está exausto e inconsciente
            color = colors.fp_unconscious;
        }
    }
    
    // Retorna o estilo CSS completo
    return new Handlebars.SafeString(`width: ${width}%; background-color: ${color};`);
});
Handlebars.registerHelper('add', function(a, b) {
  return a + b;
});
Handlebars.registerHelper('obj', function(...args) {
    const obj = {};
    for (let i = 0; i < args.length - 1; i += 2) {
        obj[args[i]] = args[i + 1];
    }
    return obj;
});
 Handlebars.registerHelper("isNumeric", function (value) {
    if (value === null || value === undefined) return false;
    const s = String(value).trim().replace(",", ".");
    if (s === "") return false;
    return Number.isFinite(Number(s));
  });
  // Helper: retorna "+2", "-1" ou "" (se 0/vazio)
Handlebars.registerHelper("signedMod", function (value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? `+${n}` : `${n}`;
});

Handlebars.registerHelper("characteristicPoints", function (item) {
  return calculateItemTraitCost(item).finalPoints;
});

const normalizeLookupKey = (value) => value
    ?.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

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

export const evaluateNumericFormula = (rawValue, { actor = null, eventData = null } = {}) => {
    if (rawValue === null || rawValue === undefined) return 0;
    if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;
    const source = String(rawValue).trim();
    if (!source) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(source)) return Number(source) || 0;

    try {
        const evaluated = Function("actor", "game", "eventData", `return (${source});`)(actor, game, eventData);
        const numeric = Number(evaluated);
        return Number.isFinite(numeric) ? numeric : 0;
    } catch (error) {
        console.warn("GUM | Falha ao avaliar expressão numérica:", { source, error });
        return 0;
    }
};

/**
 * Função unificada que avalia todas as condições de um ator.
 * - Sincroniza ícones de status no token usando a API moderna (v12+).
 * - Dispara efeitos de "ativação única" (macros, chat) apenas quando o estado da condição muda.
 * - Previne loops de reavaliação.
 * @param {Actor} actor O ator a ser processado.
 */
let evaluatingActors = new Set(); 
const conditionEventDeduper = new ConditionEventDeduper();
const processingStatusBindingActors = new Set();
const STATUS_BINDINGS_CACHE_TTL_MS = 15_000;
const statusBindingsCache = {
    sourceKey: null,
    docs: [],
    loadedAt: 0
};

const normalizeStatusBindingMode = (value) => {
    const normalized = `${value ?? ""}`.trim().toLowerCase();
    if (["replace", "stack", "refresh"].includes(normalized)) return normalized;
    return "refresh";
};

const buildFallbackTokenForActor = (fallbackActor) => ({
    actor: fallbackActor,
    id: null,
    name: fallbackActor?.name || "Alvo",
    document: { texture: { src: fallbackActor?.img || "icons/svg/mystery-man.svg" } }
});

const setCoreStatusIdDeletion = (updateData) => {
    updateData["flags.core.statusId"] = foundry.data.operators.ForcedDeletion;
};

const getEffectStatusIds = (effect, validStatusSet) => {
    const collected = new Set();
    const statusArray = Array.from(effect?.statuses ?? []);
    for (const statusId of statusArray) {
        if (validStatusSet.has(statusId)) collected.add(statusId);
    }
    const coreStatusId = foundry.utils.getProperty(effect, "flags.core.statusId");
    if (validStatusSet.has(coreStatusId)) collected.add(coreStatusId);
    return [...collected];
};

const getActorActiveNativeStatusSet = (actor) => {
    const validStatusSet = new Set((CONFIG.statusEffects || []).map((status) => status.id));
    const activeStatuses = new Set();
    for (const effect of actor?.effects || []) {
        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
        const isPendingCombat = gumDuration.pendingCombat === true;
        const isPendingStart = gumDuration.pendingStart === true;
        if (effect?.disabled || effect?.isSuppressed || isPendingCombat || isPendingStart) continue;
        const effectStatuses = getEffectStatusIds(effect, validStatusSet);
        for (const statusId of effectStatuses) activeStatuses.add(statusId);
    }
    return activeStatuses;
};

const loadStatusBindingRules = async () => {
    const now = Date.now();
    const worldConfiguration = normalizeWorldStatusConfiguration(game.settings.get("gum", WORLD_STATUS_SETTING));
    const sourceKey = worldConfiguration.bindingsMigrated
        ? `world:${JSON.stringify(worldConfiguration)}`
        : contentSourceService.getSourceIds("statusBindings").join("\u0000");
    if (statusBindingsCache.sourceKey === sourceKey
        && (now - statusBindingsCache.loadedAt) < STATUS_BINDINGS_CACHE_TTL_MS) {
        return statusBindingsCache.docs;
    }

    let statusRules;
    if (worldConfiguration.bindingsMigrated) {
        const localizedBase = localizeBaseStatuses(GUM.statusEffects, key => game.i18n.localize(key));
        statusRules = buildWorldStatusBindingRules(resolveWorldStatusRows(localizedBase, worldConfiguration));
    } else {
        const { documents, invalidSources } = await contentSourceService.getDocuments("statusBindings");
        if (invalidSources.length) {
            console.warn("GUM | Fontes inválidas de Automações de Status:", invalidSources);
        }
        statusRules = documents.filter((doc) => doc.system?.bindingMode === "status-link");
    }
    statusBindingsCache.sourceKey = sourceKey;
    statusBindingsCache.docs = statusRules;
    statusBindingsCache.loadedAt = now;
    return statusRules;
};

const getPrimaryActiveGM = () => game.users?.activeGM
    || Array.from(game.users || []).filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id))[0]
    || null;

const isPrimaryActiveGM = () => getPrimaryActiveGM()?.id === game.user?.id;

const isStatusBindingAuthority = (actor) => {
    const activeGM = getPrimaryActiveGM();
    if (activeGM) return activeGM.id === game.user?.id;
    const activeOwners = Array.from(game.users || [])
        .filter(user => user.active && actor?.testUserPermission?.(user, "OWNER"))
        .sort((a, b) => a.id.localeCompare(b.id));
    return activeOwners[0]?.id === game.user?.id;
};

async function processStatusBindings(actor) {
    if (!isActorContextAvailable(actor)) return;
    if (!isStatusBindingAuthority(actor)) return;
    const evaluationKey = getActorEvaluationKey(actor);
    if (!evaluationKey || processingStatusBindingActors.has(evaluationKey)) return;
    processingStatusBindingActors.add(evaluationKey);
    try {
        const activeStatuses = getActorActiveNativeStatusSet(actor);
        const statusRules = await loadStatusBindingRules();
        if (!isActorContextAvailable(actor)) return;
        const effectsToDelete = [];
        for (const rule of statusRules) {
            const binding = rule.system?.statusBinding || {};
            const isEnabled = binding.enabled !== false;
            const statusId = `${binding.statusId || ""}`.trim();
            if (!isEnabled || !statusId) continue;
            const shouldBeActive = activeStatuses.has(statusId);
            const removeOnStatusOff = binding.removeOnStatusOff !== false;
            const stackMode = normalizeStatusBindingMode(binding.stackMode);
            const stackLimit = Math.max(1, Number(binding.stackLimit) || 1);
            const effectLinks = Array.isArray(rule.system?.effects) ? rule.system.effects : [];
            const configuredEffectUuids = new Set(effectLinks.map(link => link?.uuid).filter(Boolean));
            const compatibleRuleUuids = new Set([rule.uuid, ...(rule.legacyRuleUuids || [])].filter(Boolean));

            const existingRuleEffects = actor.effects.filter((effect) =>
                foundry.utils.getProperty(effect, "flags.gum.source") === "statusBinding"
                && compatibleRuleUuids.has(foundry.utils.getProperty(effect, "flags.gum.statusBindingRuleUuid"))
                && foundry.utils.getProperty(effect, "flags.gum.statusBindingStatusId") === statusId
            );

            if (!shouldBeActive) {
                if (removeOnStatusOff && existingRuleEffects.length) {
                    effectsToDelete.push(...existingRuleEffects.map((effect) => effect.id));
                }
                continue;
            }

            effectsToDelete.push(...existingRuleEffects
                .filter(effect => !configuredEffectUuids.has(foundry.utils.getProperty(effect, "flags.gum.effectUuid")))
                .map(effect => effect.id));

            for (const link of effectLinks) {
                if (!isActorContextAvailable(actor)) return;
                const effectUuid = link?.uuid;
                if (!effectUuid) continue;
                const siblings = existingRuleEffects
                    .filter((effect) => foundry.utils.getProperty(effect, "flags.gum.effectUuid") === effectUuid)
                    .sort((a, b) => a.id.localeCompare(b.id));

                if (["replace", "refresh"].includes(stackMode) && siblings.length) {
                    // O efeito vinculado já é a representação autoritativa deste
                    // status. Recriá-lo a cada hook (inclusive no modo replace)
                    // forma um ciclo create/delete, especialmente em atores de
                    // tokens não vinculados. Referências obsoletas já foram
                    // adicionadas a effectsToDelete acima.
                    continue;
                } else if (stackMode === "stack" && siblings.length >= stackLimit) {
                    continue;
                }

                const effectItem = await fromUuid(effectUuid).catch(() => null);
                if (!effectItem?.system) continue;
await applySingleEffect(effectItem, buildActorEffectTargets(actor), {
                    actor,
                    origin: rule,
                    source: "statusBinding",
                    stackingDomain: "managed",
                    statusBindingRuleUuid: rule.uuid,
                    statusBindingStatusId: statusId
                });
            }
        }

        const uniqueIds = [...new Set(effectsToDelete)];
        if (uniqueIds.length && isActorContextAvailable(actor)) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", uniqueIds);
        }
    } catch (error) {
        if (!isMissingSyntheticActorContextError(error, actor)) throw error;
    } finally {
        processingStatusBindingActors.delete(evaluationKey);
    }
}

const getWorldStatusRuntimeActors = () => collectWorldStatusActors({
    worldActors: game.actors,
    scenes: game.scenes,
    canvasTokens: globalThis.canvas?.tokens?.placeables
});

const collectSceneConditionActors = (scene) => {
    const actors = [];
    const seen = new Set();
    for (const token of Array.from(scene?.tokens ?? [])) {
        const actor = token?.actor;
        if (!isActorContextAvailable(actor)) continue;
        const key = getActorEvaluationKey(actor) || actor.uuid || actor.id;
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        actors.push(actor);
    }
    return actors;
};

const dispatchConditionEvent = async (actors, eventData) => {
    const results = await Promise.allSettled(Array.from(actors ?? [], actor => processConditions(actor, eventData)));
    for (const result of results) {
        if (result.status === "rejected") console.warn("GUM | Falha ao processar um gatilho ambiental de Condição.", result.reason);
    }
};

const changedDocumentValue = (changes, path) => {
    if (Object.prototype.hasOwnProperty.call(changes || {}, path)) return changes[path];
    return foundry.utils.getProperty(changes || {}, path);
};

async function synchronizeWorldStatusRuntime(rows) {
    const actors = getWorldStatusRuntimeActors();
    if (isPrimaryActiveGM()) {
        for (const { actor, updates } of buildWorldStatusPresentationPlan(actors, rows)) {
            await actor.updateEmbeddedDocuments("ActiveEffect", updates);
        }
        for (const actor of actors) await processStatusBindings(actor);
    }
    await Promise.allSettled(Array.from(globalThis.canvas?.tokens?.placeables || [], token => token.drawEffects?.()));
    if (globalThis.canvas?.tokens?.hud?.rendered) globalThis.canvas.tokens.hud.render(true);
}

async function processConditions(actor, eventData = null) {
    // FOCO ÚNICO: Avaliar ITENS de Condição e executar ações únicas (macro, chat, flag)
    // baseadas na MUDANÇA DE ESTADO desses ITENS.
    // **NÃO GERENCIA MAIS ÍCONES DE STATUS.**
    
    if (!isActorContextAvailable(actor)) return;
    const evaluationKey = getActorEvaluationKey(actor);
    if (!evaluationKey || evaluatingActors.has(evaluationKey)) return;
    if (!conditionEventDeduper.claim(evaluationKey, eventData?.eventId)) return;
    evaluatingActors.add(evaluationKey);

 try {
        const conditions = actor.items.filter(i => i.type === "condition");
const conditionTarget = buildActorEffectTarget(actor);
        const normalizeEffectPath = (path) => {
            if (!path || typeof path !== "string") return path;
            let normalized = path.trim();
            if (normalized.startsWith("actor.")) {
                normalized = normalized.slice(6);
            }
            if (normalized.startsWith("data.")) {
                normalized = normalized.replace(/^data\./, "system.");
            }
            if (!normalized.startsWith("system.")
                && !normalized.startsWith("flags.")
                && !normalized.startsWith("effects.")
                && !normalized.startsWith("items.")) {
                if (normalized.startsWith("attributes.") || normalized.startsWith("combat.") || normalized.startsWith("resources.")) {
                    normalized = `system.${normalized}`;
                }
            }
            return normalized;
        };
        const isEventDrivenCondition = (condition) => {
            const when = condition?.system?.when;
            if (typeof when !== "string") return false;
            // Condições que dependem de "eventData" devem ser tratadas como gatilhos pulsados.
            // Inclui optional chaining, usado pelas condições de defesas sucessivas.
            return /(^|[^.\w])eventData(?:\?\.|[.\[]|$)/.test(when);
        };

        // --- Loop para avaliar Condições e disparar ações únicas ---
        for (const condition of conditions) {
             if (condition.system?.bindingMode === "status-link") continue;
             const isEventDriven = isEventDrivenCondition(condition);
             const wasActive = condition.getFlag("gum", "wasActive") || false;
             const isManuallyDisabled = condition.getFlag("gum", "manual_override") || false;
             let isConditionActiveNow = false;
             try {
                 isConditionActiveNow = !condition.system.when
                     || Function("actor", "game", "eventData", `return (${condition.system.when})`)(actor, game, eventData);
             } catch (e) {
                 isConditionActiveNow = false;
             }

             const isEffectivelyActiveNow = isConditionActiveNow && !isManuallyDisabled;
             const hasEventPayload = eventData !== null && eventData !== undefined;
             // Todo payload entregue a uma condição dirigida por eventData representa um pulso.
             // `pulse` continua aceito para compatibilidade com emissores existentes.
             const isPulseEvent = Boolean(eventData?.pulse) || (isEventDriven && hasEventPayload);
             const isTurnStartEvent = eventData?.reason === "turnStart";
             const effectLinks = normalizeConditionEffectLinks(condition.system.effects);
             const shouldRepeatOnTurnStart = condition.system?.triggerOnTurnStartWhileActive === true
                || effectLinks.some(link => link.phase === "turnStart");
             const isCurrentCombatantTurn = Boolean(
                game.combat?.started
                && game.combat?.combatant?.actorId === actor.id
             );
             // Condições dirigidas por evento (ex.: dano > metade do PV via eventData)
             // não devem alternar estado persistente entre avaliações fora do evento.
             const stateChanged = isEventDriven
                 ? false
                 : isEffectivelyActiveNow !== wasActive;
             // Pulsos representam um evento pontual (como uma rolagem de defesa) e
             // só devem reexecutar condições que consultam esse evento. Uma condição
             // contínua já ativa (por exemplo, PV abaixo de 1/3) conserva os efeitos
             // existentes em vez de duplicá-los a cada rolagem.
             const execution = {
                enter: stateChanged && isEffectivelyActiveNow,
                event: isPulseEvent && isEventDriven && isEffectivelyActiveNow,
                turnStart: isTurnStartEvent && shouldRepeatOnTurnStart && isCurrentCombatantTurn && isEffectivelyActiveNow,
                exit: !isEventDriven && stateChanged && !isEffectivelyActiveNow
             };
             const shouldExecuteActivation = execution.enter || execution.event || execution.turnStart;
             const conditionActivationMode = isEventDriven ? "trigger" : "continuous";

             if (stateChanged) {
                 // Salva o novo estado
                 await condition.setFlag("gum", "wasActive", isEffectivelyActiveNow);
                 emitGumLifecycleHook(GUM_API_HOOKS.CONDITION_STATE_CHANGED, {
                    actor,
                    sourceToken: resolveGumSourceToken(actor),
                    item: condition,
                    action: {
                        type: "condition",
                        id: condition.id,
                        label: condition.name,
                        data: condition.system
                    },
                    targets: [conditionTarget],
                    result: { active: isEffectivelyActiveNow },
                    metadata: {
                        previousActive: wasActive,
                        reason: isManuallyDisabled ? "manual-override" : (eventData?.reason || "evaluation")
                    }
                 });
             }

             if (shouldExecuteActivation) { // Condição acabou de LIGAR OU gatilho pulsado
                     for (const link of effectLinks) {
                        if (!shouldExecuteConditionEffectLink(link, execution)) continue;
                        if(!link.uuid) continue; // Pula se não for um link válido
                        const effectItem = await fromUuid(link.uuid); // Carrega o Item Efeito original
                        if (!effectItem?.system) continue;
                        const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
                        if (requiresResistance) {
                            await _promptActivationResistance(
                                effectItem,
                                conditionTarget,
                                actor,
                                condition,
                                link.id || null,
                                {
                                    mode: "condition",
                                    source: "condition",
                                    stackingDomain: "condition",
                                    conditionId: condition.id,
                                    conditionActivationMode,
                                    eventData
                                }
                            );
                            continue;
                        }

                        const actions = getEffectActions(effectItem.system || {});
                        const hasPersistentActions = actions.some(isPersistentEffectAction);
                        const existingConditionEffect = actor.effects.find((effect) =>
                            (effect?.flags?.gum?.conditionId === condition.id
                                || effect?.flags?.gum?.conditionIds?.includes(condition.id))
                            && effect?.flags?.gum?.effectUuid === effectItem.uuid
                        );
                        const skipPersistentEffects = Boolean(existingConditionEffect && !isPulseEvent);

                        if (!hasPersistentActions || !skipPersistentEffects || isPulseEvent) {
await applySingleEffect(effectItem, [conditionTarget], {
                                actor,
                                origin: condition,
                                source: "condition",
                                stackingDomain: "condition",
                                conditionId: condition.id,
                                conditionActivationMode,
                                skipPersistentEffects
                            });
                        }
                     }
                 }

                 if (!isEventDriven && stateChanged && !isEffectivelyActiveNow) { // Condição acabou de DESLIGAR
                     for (const link of effectLinks) {
                        if (link.phase === "exit" || link.removeOnConditionEnd === false) continue;
                        if(!link.uuid) continue;
                        const effectItem = await fromUuid(link.uuid);
                        if (!effectItem?.system) continue;

                        const actions = getEffectActions(effectItem.system || {});
                        const sharesAcrossConditions = ["unique", "refresh"].includes(normalizeEffectStackingMode(effectItem.system));
                        let hasRemainingOwner = false;
                        if (actions.some(isPersistentEffectAction)) {
                            const ownershipUpdates = [];
                            const effectsToRemove = actor.effects.filter((effect) => {
                                const conditionIds = Array.isArray(effect?.flags?.gum?.conditionIds)
                                    ? effect.flags.gum.conditionIds
                                    : [effect?.flags?.gum?.conditionId].filter(Boolean);
                                const sameConditionSource = conditionIds.includes(condition.id)
                                    && effect?.flags?.gum?.effectUuid === effectItem.uuid;
                                if (!sameConditionSource) return false;

                                if (sharesAcrossConditions) {
                                    const remainingConditionIds = conditionIds.filter((id) => id !== condition.id);
                                    if (remainingConditionIds.length) {
                                        hasRemainingOwner = true;
                                        ownershipUpdates.push(effect.update({
                                            "flags.gum.conditionIds": remainingConditionIds,
                                            "flags.gum.conditionId": remainingConditionIds[0]
                                        }));
                                        return false;
                                    }
                                }

                                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                                const isPermanentGumDuration = isEffectDurationPermanent(gumDuration);
                                const finiteGumDuration = !isPermanentGumDuration
                                    && (
                                        (Number.isFinite(Number(gumDuration.value)) && Number(gumDuration.value) > 0)
                                        || effect.duration?.rounds
                                        || effect.duration?.turns
                                        || effect.duration?.seconds
                                    );
                                const activationMode = foundry.utils.getProperty(effect, "flags.gum.conditionActivationMode") || "continuous";
                                const isTriggeredConditionEffect = activationMode === "trigger";

                                // Condições contínuas devem voltar a desligar até efeitos permanentes
                                // quando o gatilho sai. Já efeitos aplicados por gatilhos de evento
                                // (ex.: dano + resistência) carregam o próprio ciclo de vida: duração
                                // temporária ou permanência até remoção manual/regra explícita.
                                if (finiteGumDuration || (isTriggeredConditionEffect && isPermanentGumDuration)) return false;
                                return true;

                            });
                            if (ownershipUpdates.length) await Promise.all(ownershipUpdates);
                            if (effectsToRemove.length) {
                                await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove.map(effect => effect.id));
                            }
                        }

                        if (!hasRemainingOwner) {
                            for (const action of actions) {
                                if (action.type === "flag" && action.key) await actor.unsetFlag("gum", action.key);
                            }
                        }
                        // Outras ações de "desligar" poderiam ir aqui no futuro
                     }

                     // Efeitos de saída são aplicados depois da limpeza do estado.
                     for (const link of effectLinks) {
                        if (!shouldExecuteConditionEffectLink(link, execution) || !link.uuid) continue;
                        const effectItem = await fromUuid(link.uuid);
                        if (!effectItem?.system) continue;
                        if (effectItem.system?.resistanceRoll?.isResisted) {
                            await _promptActivationResistance(effectItem, conditionTarget, actor, condition, link.id || null, {
                                mode: "condition",
                                source: "condition",
                                stackingDomain: "condition",
                                conditionId: condition.id,
                                conditionActivationMode: "exit",
                                eventData
                            });
                        } else {
                            await applySingleEffect(effectItem, [conditionTarget], {
                                actor,
                                origin: condition,
                                source: "condition",
                                stackingDomain: "condition",
                                conditionId: condition.id,
                                conditionActivationMode: "exit"
                            });
                        }
                     }
                 }
        } // Fim do loop de Conditions

        // Nenhuma lógica de sincronização de ícones ('toggleStatusEffect') aqui.
    } catch (error) {
        if (!isMissingSyntheticActorContextError(error, actor)) throw error;
    } finally {
        evaluatingActors.delete(evaluationKey); // Libera este contexto de ator para a próxima avaliação
    }
}

/**
 * Gerencia a duração de ActiveEffects baseados em rodadas/turnos de combate. (Versão Final e Funcional)
 * @param {Actor} actor O ator do combatente cujo turno terminou.
 */
async function manageActiveEffectDurations(actor) {
    if (!actor || !game.combat) return;
    const effectsToDelete = [];
    const effectsToUpdate = [];
    const currentRound = game.combat.round;
    const currentTurn = game.combat.turn ?? 0;
    const totalTurns = Math.max(game.combat.turns?.length || 1, 1);
    const currentWorldTime = game.time?.worldTime || 0;
    for (const effect of actor.effects) {
        const duration = effect.duration;
        if (!duration) continue;

        const updateData = { _id: effect.id };
        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
        const endMode = gumDuration.endMode || "turnEnd";
        const isPendingCombat = gumDuration.pendingCombat === true;
        const isPendingStart = gumDuration.pendingStart === true;

        if (effect.disabled || isPendingCombat || isPendingStart) continue;

        // Em combate, "rounds" e "turns" representam ciclos completos do alvo.
        // O incremento do contador acontece no início do turno do alvo; aqui,
        // no fim do turno, apenas verificamos expiração para endMode=turnEnd.
        const hasCombatValue = Number.isFinite(Number(gumDuration.value)) && Number(gumDuration.value) > 0;
        if ((duration.rounds || duration.turns || hasCombatValue) && isCombatDuration(gumDuration)) {
            const elapsedTargetTurns = Number(gumDuration.elapsedTargetTurns) || 0;
            const targetDuration = Math.max(parseInt(gumDuration.value) || duration.rounds || duration.turns || 0, 1);
            if (endMode === "turnEnd" && elapsedTargetTurns >= targetDuration) {
                effectsToDelete.push(effect.id);
            } else if (Object.keys(updateData).length > 1) {
                effectsToUpdate.push(updateData);
            }
            continue;
        }

        if (endMode === "turnStart") continue;

        // Se o efeito foi marcado como "apenas em combate" no item original e ainda não
        // possui valores de duração aplicados pelo Foundry, convertemos agora.
        if (
            !isEffectDurationPermanent(gumDuration)
            && !duration.rounds
            && !duration.turns
            && !duration.seconds
            && gumDuration.value
        ) {
            const fallbackValue = parseInt(gumDuration.value) || 1;
            const unit = gumDuration.unit || "rounds";

            if (isCombatDuration(gumDuration)) {
                updateData["duration.combat"] = game.combat.id;
            } else {
                if (unit === "seconds") {
                    updateData["duration.seconds"] = fallbackValue;
                } else if (unit === "minutes") {
                    updateData["duration.seconds"] = fallbackValue * 60;
                } else if (unit === "hours") {
                    updateData["duration.seconds"] = fallbackValue * 60 * 60;
                } else if (unit === "days") {
                    updateData["duration.seconds"] = fallbackValue * 60 * 60 * 24;
                } else {
                    // Default para efeitos sem flag de combate: trata como rodadas em combate
                    updateData["duration.rounds"] = fallbackValue;
                }
            }
        }

        let startRound = duration.startRound;
        if (startRound == null) {
            startRound = currentRound;
            updateData["duration.startRound"] = startRound;
        }

        let startTurn = duration.startTurn;
        if (startTurn == null) {
            startTurn = currentTurn;
            updateData["duration.startTurn"] = startTurn;
        }

        let startTime = duration.startTime;
        if (startTime == null) {
            startTime = currentWorldTime;
            updateData["duration.startTime"] = startTime;
        }

                // Expiração por rodadas fora de combate (mantém lógica baseada em tempo global)
        if (duration.rounds) {
            const lastRound = startRound + Math.max(duration.rounds - 1, 0);
            const isExpired = currentRound >= lastRound;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        // Expiração por turnos
        if (duration.turns) {
            const turnsElapsed = (currentRound - startRound) * totalTurns + (currentTurn - startTurn);
            if (turnsElapsed >= duration.turns) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        // Expiração por tempo (segundos)
        if (duration.seconds) {
            const isExpired = currentWorldTime >= startTime + duration.seconds;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        if (Object.keys(updateData).length > 1) {
            effectsToUpdate.push(updateData);
        }
    }
    if (effectsToUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("ActiveEffect", effectsToUpdate);
    }
    if (effectsToDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }
}

const collectCombatEffects = (combat, predicate) => {
    const effectsByActor = new Map();
    for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor) continue;
        const effects = actor.effects.filter(effect => predicate(effect));
        if (effects.length > 0) effectsByActor.set(actor, effects);
    }
    return effectsByActor;
};

const setEffectStartData = (effect, updateData, combat) => {
    const startRound = combat?.round ?? null;
    const startTurn = combat?.turn ?? null;
    const startTime = game.time?.worldTime ?? null;
    if (effect.duration?.startRound == null) updateData["duration.startRound"] = startRound;
    if (effect.duration?.startTurn == null) updateData["duration.startTurn"] = startTurn;
    if (effect.duration?.startTime == null) updateData["duration.startTime"] = startTime;
};

async function handleCombatTurnStart(combatant) {
    const actor = combatant?.actor;
    if (!actor || !game.combat) return;

    const currentRound = game.combat.round;
    const currentTurn = game.combat.turn ?? 0;
    const totalTurns = Math.max(game.combat.turns?.length || 1, 1);
    const currentWorldTime = game.time?.worldTime || 0;
    const effectsToDelete = [];
    const effectsToUpdate = [];

    for (const effect of actor.effects) {
        const duration = effect.duration;
        if (!duration) continue;

        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
        const endMode = gumDuration.endMode || "turnEnd";
        const isPendingStart = gumDuration.pendingStart === true;
        const isManualDisabled = foundry.utils.getProperty(effect, "flags.gum.manualDisabled") === true;

        if (isManualDisabled) continue;

        const updateData = { _id: effect.id };

        if (isPendingStart) {
            setEffectStartData(effect, updateData, game.combat);
            updateData["flags.gum.duration.pendingStart"] = false;
            // O efeito acabou de começar no início deste turno do alvo.
            // Para durações em combate baseadas em "turnos do alvo", este turno já conta.
            const hasCombatValue = Number.isFinite(Number(gumDuration.value)) && Number(gumDuration.value) > 0;
            const isTargetTurnTracked = (duration.rounds || duration.turns || hasCombatValue) && isCombatDuration(gumDuration);
            updateData["flags.gum.duration.elapsedTargetTurns"] = isTargetTurnTracked ? 1 : 0;
            updateData["disabled"] = false;
            effectsToUpdate.push(updateData);
            continue;
        }

        if (effect.disabled) continue;

        if (duration.startRound == null || duration.startTurn == null || duration.startTime == null) {
            setEffectStartData(effect, updateData, game.combat);
        }

        const hasCombatValue = Number.isFinite(Number(gumDuration.value)) && Number(gumDuration.value) > 0;
        if ((duration.rounds || duration.turns || hasCombatValue) && isCombatDuration(gumDuration)) {
            const elapsedTargetTurns = Number(gumDuration.elapsedTargetTurns) || 0;
            const nextElapsed = elapsedTargetTurns + 1;
            const targetDuration = Math.max(parseInt(gumDuration.value) || duration.rounds || duration.turns || 0, 1);

            updateData["flags.gum.duration.elapsedTargetTurns"] = nextElapsed;

            if (endMode === "turnStart" && nextElapsed >= targetDuration) {
                effectsToDelete.push(effect.id);
            } else {
                effectsToUpdate.push(updateData);
            }
            continue;
        }

        if (endMode !== "turnStart") continue;

        if (duration.rounds) {
            const startRound = duration.startRound ?? currentRound;
            const lastRound = startRound + Math.max(duration.rounds - 1, 0);
            const isExpired = currentRound >= lastRound;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        if (duration.turns) {
            const startRound = duration.startRound ?? currentRound;
            const startTurn = duration.startTurn ?? currentTurn;
            const turnsElapsed = (currentRound - startRound) * totalTurns + (currentTurn - startTurn);
            if (turnsElapsed >= Math.max(duration.turns - 1, 0)) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        if (duration.seconds) {
            const startTime = duration.startTime ?? currentWorldTime;
            const isExpired = currentWorldTime >= startTime + duration.seconds;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
    }

    if (effectsToUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("ActiveEffect", effectsToUpdate);
    }
    if (effectsToDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }
}

async function handleCombatStart(combat) {
    if (!combat || !game.user.isGM) return;
    const pendingEffects = collectCombatEffects(combat, (effect) => {
        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
        return isCombatDuration(gumDuration)
            && gumDuration.pendingCombat === true
            && foundry.utils.getProperty(effect, "flags.gum.manualDisabled") !== true;
    });

    if (pendingEffects.size === 0) return;

    let enablePending = true;
    try {
        enablePending = await Dialog.confirm({
            title: "Efeitos de Combate Pendentes",
            content: "<p>Deseja ligar todos os efeitos de combate pendentes?</p>",
            yes: () => true,
            no: () => false,
            defaultYes: true
        });
    } catch (error) {
        enablePending = true;
    }

    if (!enablePending) return;

    for (const [actor, effects] of pendingEffects.entries()) {
        const updates = effects.map(effect => {
            const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
            const startMode = gumDuration.startMode || "apply";
            const updateData = {
                _id: effect.id,
                disabled: startMode !== "apply",
                "flags.gum.duration.pendingCombat": false,
                "flags.gum.manualDisabled": false
            };
            if (startMode === "apply") {
                setEffectStartData(effect, updateData, combat);
            }
            return updateData;
        });
        await actor.updateEmbeddedDocuments("ActiveEffect", updates);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    }
}

async function handleCombatEnd(combat) {
    if (!combat || !game.user.isGM) return;
    const combatEffects = collectCombatEffects(combat, (effect) => {
        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
        return isCombatDuration(gumDuration);
    });

    if (combatEffects.size === 0) return;

    let shouldDelete = true;
    try {
        shouldDelete = await Dialog.confirm({
            title: "Encerrar efeitos de combate",
            content: "<p>Deseja excluir todos os efeitos de combate?</p>",
            yes: () => true,
            no: () => false,
            defaultYes: true
        });
    } catch (error) {
        shouldDelete = true;
    }

    if (!shouldDelete) return;

    for (const [actor, effects] of combatEffects.entries()) {
        const effectIds = effects.map(effect => effect.id);
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    }
}
/**
 * Gerencia a duração de condições baseadas em rodadas de combate a cada turno.
 * @param {Combat} combat O objeto de combate que foi atualizado.
 */
async function manageDurations(combat) {
    // Pega o combatente cujo turno ACABOU DE TERMINAR.
    const combatant = combat.previous.combatantId ? combat.combatants.get(combat.previous.combatantId) : null;
    if (!combatant?.actor) return; // Se não houver um combatente anterior, não faz nada.

    const actor = combatant.actor;
    const itemsToDelete = [];
    const itemsToDisable = [];
    const itemUpdates = [];

    for (const condition of actor.items.filter(i => i.type === 'condition')) {
        const duration = condition.system.duration;

        // Pula condições que não têm duração finita em rodadas.
        if (!duration || duration.unit !== 'rounds' || duration.value <= 0) continue;

        const newValue = duration.value - 1;

        if (newValue <= 0) {
            // O tempo acabou! Decide o que fazer com base na escolha do usuário.
            if (duration.expiration === 'disable') {
                itemsToDisable.push(condition.id);
            } else { // O padrão é sempre deletar
                itemsToDelete.push(condition.id);
            }
        } else {
            // Se o tempo ainda não acabou, apenas prepara a atualização do valor.
            itemUpdates.push({ _id: condition.id, 'system.duration.value': newValue });
        }
    }

    // Aplica todas as atualizações de duração de uma só vez para melhor performance.
    if (itemUpdates.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    if (itemsToDisable.length > 0) {
        console.log(`GUM | Desativando condições expiradas de ${actor.name}:`, itemsToDisable);
        // Pega os itens para desativar e seta a flag `manual_override` para 'true'
        const disableUpdates = itemsToDisable.map(id => {
            return { _id: id, 'flags.gum.manual_override': true, 'system.duration.value': 0 };
        });
        await actor.updateEmbeddedDocuments("Item", disableUpdates);
    }

    if (itemsToDelete.length > 0) {
        console.log(`GUM | Removendo condições expiradas de ${actor.name}:`, itemsToDelete);
        await actor.deleteEmbeddedDocuments("Item", itemsToDelete);
    }
}

/**
 * Aplica um Item de Condição em um ator alvo com base em um Efeito Contingente.
 * Esta é uma função auxiliar reutilizável.
 * @param {Actor} targetActor - O ator que receberá a condição.
 * @param {object} contingentEffect - O objeto do Efeito Contingente que está sendo executado.
 * @param {object} eventContext - O contexto do evento (dano, etc.) para modificadores dinâmicos.
 */
export async function applyContingentCondition(targetActor, contingentEffect, eventContext = {}) {

    // Garante que temos um 'payload' (o link para a condição)
    if (!contingentEffect.payload) {
        console.warn("GUM | Efeito Contingente tentou aplicar uma condição sem um 'payload' (UUID do item).");
        return;
    }

    // Carrega o item de condição "molde" a partir do seu UUID
    const conditionItem = await fromUuid(contingentEffect.payload);
    if (!conditionItem) {
        ui.notifications.warn(`Item de Condição com UUID "${contingentEffect.payload}" não encontrado.`);
        return;
    }

    console.log(`GUM | Ação Final: Aplicando ${conditionItem.name} em ${targetActor.name}`);
    
    // Cria uma cópia dos dados do item para não modificar o original do compêndio
    const newConditionData = conditionItem.toObject();

    // FUTURAMENTE: Aqui é onde a lógica para processar o array 'dynamic' entraria,
    // modificando o 'newConditionData' antes de criá-lo no ator. Por exemplo,
    // alterando a duração ou o valor de um efeito interno.

    // Cria o novo item de condição na ficha do ator alvo.
    await targetActor.createEmbeddedDocuments("Item", [newConditionData]);
    ui.notifications.info(`${targetActor.name} foi afetado por: ${conditionItem.name}!`);
}

// ================================================================== //
//  HOOK DO ESCUDO DO MESTRE (GM SCREEN) - BLINDADO PARA V13
// ================================================================== //

Hooks.on("getSceneControlButtons", (controls) => {
    // 1. Verificação de Segurança
    if (!game.user.isGM) return;

    let targetLayer = null;

    // 2. BUSCA DA CAMADA (Suporta V12 Array e V13 Object/Map)
    
    // Tenta acesso direto por chave (comum em V13 Objetos)
    if (controls.tokens) targetLayer = controls.tokens;
    else if (controls.token) targetLayer = controls.token;
    
    // Se não achou, tenta acesso por Mapa (Map)
    else if (controls instanceof Map) {
        targetLayer = controls.get("tokens") || controls.get("token");
    }
    
    // Se não achou, tenta iterar (Array ou Object.values)
    else {
        const list = Array.isArray(controls) ? controls : Object.values(controls);
        targetLayer = list.find(c => c.name === "tokens" || c.name === "token");
    }

    // 3. SE AINDA NÃO ACHOU, LOGA O ERRO E PARA
    if (!targetLayer) {
        console.error("GUM | ERRO CRÍTICO: Não foi possível encontrar a camada de Tokens. Estrutura recebida:", controls);
        return;
    }

    // 4. DEFINIÇÃO DA FERRAMENTA
    const gmScreenTool = {
        name: "gm-screen",
        title: "Escudo do Mestre (GUM)",
        icon: "fas fa-book-open",
        visible: true,
        onChange: () => {
            // Lógica Singleton
            if (game.gum.gmScreen) {
                game.gum.gmScreen.render(true);
            } else {
                game.gum.gmScreen = new GumGMScreen();
                game.gum.gmScreen.render(true);
            }
        },
        button: true
    };
    const requestTestTool = { name: "request-test", title: "Solicitar Teste", icon: "fas fa-dice", visible: true,
        onChange: () => openTestRequestLauncher(), button: true };

    // 5. INJEÇÃO SEGURA NA LISTA DE FERRAMENTAS
    const toolsCollection = targetLayer.tools;

    if (Array.isArray(toolsCollection)) {
        // V12: É um Array
        toolsCollection.push(gmScreenTool, requestTestTool);
    } 
    else if (toolsCollection instanceof Map) {
        // V13 (Possível): É um Map
        toolsCollection.set("gm-screen", gmScreenTool);
        toolsCollection.set("request-test", requestTestTool);
    } 
    else if (typeof toolsCollection === 'object') {
        // V13 (Provável): É um Objeto
        // Verifica se já existe para evitar loop
        if (!toolsCollection["gm-screen"]) {
            toolsCollection["gm-screen"] = gmScreenTool;
        }
        if (!toolsCollection["request-test"]) toolsCollection["request-test"] = requestTestTool;
    } 
    else {
        console.error("GUM | Formato desconhecido para 'layer.tools':", toolsCollection);
    }
});

// ================================================================== //
//  HOOKS DE ATUALIZAÇÃO DO ESCUDO DO MESTRE (GM SCREEN)
// ================================================================== //

// Função auxiliar para renderizar apenas se aberto
function refreshGMScreen() {
    if (game.gum && game.gum.gmScreen && game.gum.gmScreen.rendered) {
        if (game.gum.gmScreen._isApplyingSelection) return;
        game.gum.gmScreen.render(false);
    }
}

// Regra explícita de prioridade para escolher o carrier visual entre ActiveEffects irmãos.
// Menor número = maior prioridade.
const CARRIER_ACTION_PRIORITY = {
    attribute: 1,
    roll_modifier: 2,
    flag: 3,
    status: 4
};

const selectCarrierEffect = (siblings = []) => {
    if (!siblings.length) return null;
    const ordered = [...siblings].sort((a, b) => {
        const ta = foundry.utils.getProperty(a, "flags.gum.actionType");
        const tb = foundry.utils.getProperty(b, "flags.gum.actionType");
        const pa = CARRIER_ACTION_PRIORITY[ta] ?? 9999;
        const pb = CARRIER_ACTION_PRIORITY[tb] ?? 9999;
        if (pa !== pb) return pa - pb;

        const ai = Number(foundry.utils.getProperty(a, "flags.gum.actionIndex") ?? 9999);
        const bi = Number(foundry.utils.getProperty(b, "flags.gum.actionIndex") ?? 9999);
        return ai - bi;
    });
    return ordered[0];
};

// 1. CRIAÇÃO E FIM DE COMBATE (Para limpar/popular a lista)
Hooks.on("createCombat", refreshGMScreen);
Hooks.on("deleteCombat", refreshGMScreen); // ✅ Resolve o problema da lista não limpar

// 3. MUDANÇAS NOS ATORES (HP, FP, Flags de Modificadores)
Hooks.on("updateActor", (actor, changes, options = {}) => {
    if (options.gumSkipGMScreenRefresh) return;
    // Mudanças de propriedade precisam atualizar nos dois sentidos. Após remover
    // o último jogador proprietário, hasPlayerOwner já é falso, mas o card ainda
    // precisa desaparecer imediatamente do monitor do Escudo.
    if (shouldRefreshGMScreenForActor(actor, changes, { combatActive: Boolean(game.combat) })) {
        refreshGMScreen();
    }
});

// 4. MUDANÇAS NOS TOKENS (Para garantir sincronia visual imediata)
Hooks.on("updateToken", (tokenDocument) => {
    if (game.combat) refreshGMScreen();
});

// Gatilhos ambientais normalizados para Itens Condição.
Hooks.on("moveToken", async (token, movement, operation = {}, user) => {
    if (!user?.isSelf || !isActorContextAvailable(token?.actor)) return;
    const priorRegionIds = operation?._priorRegions?.[token.id];
    if (!priorRegionIds) return;
    const transitions = collectRegionConditionTransitions(token, priorRegionIds);
    if (!transitions.length) return;

    const finalWaypoint = movement?.passed?.waypoints?.at?.(-1) ?? null;
    const movementAction = finalWaypoint?.action
        ? CONFIG.Token?.movement?.actions?.[finalWaypoint.action]
        : null;
    for (const transition of transitions) {
        await processConditions(token.actor, buildRegionConditionEvent({
            eventId: foundry.utils.randomID(),
            phase: transition.phase,
            region: transition.region,
            token,
            movement,
            teleport: movementAction?.teleport === true,
            forced: finalWaypoint?.action === "displace"
        }));
    }
});

Hooks.on("createToken", async (token, options = {}, userId) => {
    if (game.user.id !== userId || !isActorContextAvailable(token?.actor)) return;
    for (const region of Array.from(token.regions ?? [])) {
        await processConditions(token.actor, buildRegionConditionEvent({
            eventId: foundry.utils.randomID(),
            phase: "enter",
            region,
            token
        }));
    }
});

Hooks.on("preUpdateScene", (scene, changes, options = {}, userId) => {
    if (game.user.id !== userId) return;
    if (changedDocumentValue(changes, "environment.darknessLevel") === undefined) return;
    options.gumPreviousDarknessLevel = Number(scene?.environment?.darknessLevel ?? 0);
});

Hooks.on("updateScene", async (scene, changes, options = {}, userId) => {
    if (game.user.id !== userId) return;
    const requestedDarkness = changedDocumentValue(changes, "environment.darknessLevel");
    if (requestedDarkness === undefined) return;
    const eventData = buildSceneDarknessConditionEvent({
        eventId: foundry.utils.randomID(),
        scene,
        before: options.gumPreviousDarknessLevel,
        after: scene?.environment?.darknessLevel ?? requestedDarkness
    });
    await dispatchConditionEvent(collectSceneConditionActors(scene), eventData);
});

Hooks.on("updateWorldTime", async (worldTime, dt, options = {}, userId) => {
    const isAuthority = userId ? game.user.id === userId : isPrimaryActiveGM();
    if (!isAuthority) return;
    const eventData = buildWorldTimeConditionEvent({
        eventId: foundry.utils.randomID(),
        worldTime,
        delta: dt,
        components: game.time?.components
    });
    await dispatchConditionEvent(getWorldStatusRuntimeActors(), eventData);
});

// 5. MUDANÇAS DIRETAS EM EFEITOS ATIVOS (remoção)
// Mantemos somente a remoção aqui para evitar renders intermediários durante
// aplicações em lote (ex.: 2+ efeitos no mesmo clique no Escudo do Mestre).
const buildEffectLifecycleMetadata = (effect, extra = {}) => {
    const gumFlags = effect?.flags?.gum || {};
    const sceneTrigger = gumFlags.sceneTrigger || {};
    const bridge = gumFlags.effectItemBridge || {};
    return {
        effectItemUuid: gumFlags.effectUuid || bridge.effectItemUuid || null,
        activeEffectUuid: effect?.uuid || null,
        applicationId: gumFlags.applicationId || bridge.applicationId || null,
        source: gumFlags.source || sceneTrigger.source || (bridge.effectItemUuid ? "activeEffectBridge" : null),
        sourceUuid: sceneTrigger.sourceUuid || bridge.carrierUuid || null,
        originUuid: effect?.origin || null,
        lifecycleCarrier: gumFlags.lifecycleCarrier !== false,
        ...extra
    };
};

const rebalanceEffectCarrier = async (actor, effectUuid) => {
    if (!isActorContextAvailable(actor) || !effectUuid) return;
    try {
        const siblings = actor.effects
            .filter((candidate) =>
                foundry.utils.getProperty(candidate, "flags.gum.effectUuid") === effectUuid
                && !candidate.disabled
                && foundry.utils.getProperty(candidate, "flags.gum.dynamicRegionIndicator") !== true
            )
            .sort((a, b) => {
                const ai = Number(foundry.utils.getProperty(a, "flags.gum.actionIndex") ?? 9999);
                const bi = Number(foundry.utils.getProperty(b, "flags.gum.actionIndex") ?? 9999);
                return ai - bi;
            });

        if (siblings.length === 0) return;

        const effectItem = await fromUuid(effectUuid).catch(() => null);
        if (!isActorContextAvailable(actor)) return;
        const statusIds = new Set((CONFIG.statusEffects || []).map((status) => status.id));
        const carrier = siblings.find((sibling) => foundry.utils.getProperty(sibling, "flags.gum.actionType") !== "status") || siblings[0];
        const updates = [];

        for (const sibling of siblings) {
            const currentStatuses = Array.from(sibling.statuses ?? []);
            const nativeStatuses = currentStatuses.filter((statusId) => statusIds.has(statusId));
            const nextStatuses = [...nativeStatuses];
            const updateData = { _id: sibling.id };

            const carrierDuration = foundry.utils.getProperty(carrier, "flags.gum.duration") || {};
            const siblingActionType = foundry.utils.getProperty(sibling, "flags.gum.actionType");
            const shouldDisplayCarrier = sibling.id === carrier.id
                && siblingActionType !== "status"
                && !foundry.utils.getProperty(sibling, "flags.gum.dynamicRegionGrant")
                && effectItem?.img
                && shouldShowTokenIconForSystem(effectItem.system || {}, carrierDuration);

            if (shouldDisplayCarrier) {
                const carrierStatusId = `${effectItem.name.slugify({ strict: true })}-carrier`;
                nextStatuses.push(carrierStatusId);
                updateData.img = effectItem.img;
                updateData.showIcon = getActiveEffectShowIconModeForSystem(effectItem.system || {}, carrierDuration);
                updateData["flags.core.statusId"] = nativeStatuses[0] || carrierStatusId;
            } else {
                updateData.img = nativeStatuses[0]
                    ? ((CONFIG.statusEffects || []).find(status => status.id === nativeStatuses[0])?.icon
                        || (CONFIG.statusEffects || []).find(status => status.id === nativeStatuses[0])?.img
                        || null)
                    : null;
                updateData.showIcon = nativeStatuses[0] ? 1 : 0;
                if (nativeStatuses[0]) updateData["flags.core.statusId"] = nativeStatuses[0];
                else setCoreStatusIdDeletion(updateData);
            }

            updateData.statuses = [...new Set(nextStatuses)];
            updates.push(updateData);
        }

        if (updates.length && isActorContextAvailable(actor)) {
            await actor.updateEmbeddedDocuments("ActiveEffect", updates);
            if (isActorContextAvailable(actor)) actor.getActiveTokens().forEach((token) => token.drawEffects());
        }
    } catch (error) {
        if (isMissingSyntheticActorContextError(error, actor)) return;
        console.warn("GUM | Não foi possível reequilibrar ícone carrier após remover ActiveEffect.", error);
    }
};

const refreshFromDeletedActiveEffect = async (effect, options = {}, userId) => {
    const actor = effect?.parent;
    if (!isActorContextAvailable(actor)) return;
    try {
        if (game.user.id === userId && isEffectItemBridgeCarrier(effect)) {
            await cleanupEffectItemBridgeCarrier(effect, { actor });
        }
        const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
        const bridgeEffectUuid = foundry.utils.getProperty(effect, "flags.gum.effectItemBridge.effectItemUuid");
        const lifecycleEffectUuid = effectUuid || bridgeEffectUuid;
        const isLifecycleCarrier = foundry.utils.getProperty(effect, "flags.gum.lifecycleCarrier") !== false;
        if (lifecycleEffectUuid && isLifecycleCarrier && !options.gumEffectBridgeCleanup && game.user.id === userId) {
            const effectItem = await fromUuid(lifecycleEffectUuid).catch(() => null);
            const originDocument = effect.origin
                ? await fromUuid(effect.origin).catch(() => null)
                : null;
            const sourceActor = originDocument?.documentName === "Actor"
                ? originDocument
                : originDocument?.actor || originDocument?.parent?.actor || null;
            emitGumLifecycleHook(GUM_API_HOOKS.EFFECT_REMOVED, {
                actor: sourceActor,
                sourceToken: resolveGumSourceToken(sourceActor),
                item: effectItem,
                action: {
                    type: "effect",
                    id: effectItem?.id || lifecycleEffectUuid,
                    label: effectItem?.name || effect.name,
                    data: effectItem?.system || null
                },
                targets: actor.getActiveTokens?.(true) || actor.getActiveTokens?.() || [],
                result: {
                    active: false,
                    transition: "removed",
                    activeEffect: effect,
                    targetActor: actor
                },
                metadata: buildEffectLifecycleMetadata(effect, {
                    reason: options.gumExpirationReason || null
                })
            });
        }
        if (effectUuid) await rebalanceEffectCarrier(actor, effectUuid);
        await processStatusBindings(actor);
        if (game.user.id === userId && !options.gumSkipConditionProcessing) {
            await processConditions(actor, buildActiveEffectConditionEvent({
                eventId: foundry.utils.randomID(),
                operation: "delete",
                effect
            }));
        }

        if (actor.hasPlayerOwner || game.combat) {
            refreshGMScreen();
        }
    } catch (error) {
        if (isMissingSyntheticActorContextError(error, actor)) return;
        console.warn("GUM | Falha ao sincronizar status após remover ActiveEffect.", error);
    }
};

Hooks.on("deleteActiveEffect", refreshFromDeletedActiveEffect);
Hooks.on("updateActiveEffect", async (effect, changes, options = {}, userId) => {
    const actor = effect?.parent;
    if (!isActorContextAvailable(actor)) return;
    const disabledChanged = Object.prototype.hasOwnProperty.call(changes || {}, "disabled");
    const statusesChanged = Object.prototype.hasOwnProperty.call(changes || {}, "statuses")
        || Object.prototype.hasOwnProperty.call(changes?.flags?.core || {}, "statusId");
    const presentationChanged = disabledChanged || statusesChanged;
    const shouldProcessConditions = game.user.id === userId && !options.gumSkipConditionProcessing;
    if (!presentationChanged && !shouldProcessConditions) return;

    try {
        const isLifecycleCarrier = foundry.utils.getProperty(effect, "flags.gum.lifecycleCarrier") !== false;
        if (game.user.id === userId && disabledChanged && isLifecycleCarrier) {
            const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
            const bridgeEffectUuid = foundry.utils.getProperty(effect, "flags.gum.effectItemBridge.effectItemUuid");
            const lifecycleEffectUuid = effectUuid || bridgeEffectUuid;
            const effectItem = lifecycleEffectUuid ? await fromUuid(lifecycleEffectUuid).catch(() => null) : null;
            const active = effect.disabled !== true;
            emitGumLifecycleHook(GUM_API_HOOKS.EFFECT_STATE_CHANGED, {
                actor,
                sourceToken: resolveGumSourceToken(actor),
                item: effectItem,
                action: {
                    type: "effect",
                    id: effectItem?.id || effect.id,
                    label: effectItem?.name || effect.name,
                    data: effect
                },
                targets: buildActorEffectTargets(actor),
                result: {
                    active,
                    transition: active ? "enabled" : "disabled",
                    activeEffect: effect,
                    targetActor: actor
                },
                metadata: buildEffectLifecycleMetadata(effect, {
                    previousActive: !active,
                    manual: foundry.utils.getProperty(effect, "flags.gum.manualDisabled") !== undefined
                })
            });
        }
        if (game.user.id === userId && disabledChanged && !options.gumEffectBridgeSync && isEffectItemBridgeCarrier(effect)) {
            if (effect.disabled) await deactivateEffectItemBridgeCarrier(effect);
            else await activateEffectItemBridgeCarrier(effect, {
                buildTargets: buildActorEffectTargets,
                applyEffect: applyEffectWithResistance
            });
        }
        if (presentationChanged) {
            const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
            if (effectUuid) await rebalanceEffectCarrier(actor, effectUuid);
            await processStatusBindings(actor);
        }
        if (shouldProcessConditions) {
            await processConditions(actor, buildActiveEffectConditionEvent({
                eventId: foundry.utils.randomID(),
                operation: "update",
                effect,
                changes
            }));
        }
        if (presentationChanged && (actor.hasPlayerOwner || game.combat)) refreshGMScreen();
    } catch (error) {
        if (isMissingSyntheticActorContextError(error, actor)) return;
        console.warn("GUM | Falha ao sincronizar status após atualizar ActiveEffect.", error);
    }
});


Hooks.on("createActiveEffect", async (effect, options = {}, userId) => {
    const actor = effect?.parent;
    if (!isActorContextAvailable(actor)) return;
    try {
        if (game.user.id === userId && !options.gumEffectBridgeSync && isEffectItemBridgeCarrier(effect)) {
            await activateEffectItemBridgeCarrier(effect, {
                buildTargets: buildActorEffectTargets,
                applyEffect: applyEffectWithResistance
            });
        }
        await processStatusBindings(actor);
        if (game.user.id === userId && !options.gumSkipConditionProcessing) {
            await processConditions(actor, buildActiveEffectConditionEvent({
                eventId: foundry.utils.randomID(),
                operation: "create",
                effect
            }));
        }
        if (actor.hasPlayerOwner || game.combat) refreshGMScreen();
    } catch (error) {
        if (isMissingSyntheticActorContextError(error, actor)) return;
        console.warn("GUM | Falha ao sincronizar status após criar ActiveEffect.", error);
    }
});

// 6. MUDANÇAS NA CENA (Adicionar/Remover tokens)
Hooks.on("canvasReady", refreshGMScreen); // Quando muda de mapa

Hooks.once("ready", async () => {
    if (isPrimaryActiveGM()) {
        await synchronizeWorldEffectItemBridges().catch(error => {
            console.error("GUM | Falha ao sincronizar as pontes ActiveEffect dos Itens Efeito.", error);
        });
    }
    try {
        await migrateRetiredBundledSources();
    } catch (error) {
        console.error("GUM | Falha ao remover fontes internas descontinuadas.", error);
    }
    try {
        await migrateLegacyStatusBindingSource();
    } catch (error) {
        console.error("GUM | Falha ao migrar a fonte legada de Automações de Status.", error);
    }
    try {
        await retireLegacyStatusBindingSources();
    } catch (error) {
        console.error("GUM | Falha ao aposentar as fontes legadas de Automações de Status.", error);
    }
    try {
        const configuration = normalizeWorldStatusConfiguration(game.settings.get("gum", WORLD_STATUS_SETTING));
        const localizedBase = localizeBaseStatuses(GUM.statusEffects, key => game.i18n.localize(key));
        await synchronizeWorldStatusRuntime(resolveWorldStatusRows(localizedBase, configuration));
    } catch (error) {
        console.error("GUM | Falha ao consolidar os status do mundo ao iniciar.", error);
    }
    try {
        await reconcileAllStateEffects();
    } catch (error) {
        console.error("GUM | Falha ao reconciliar os Efeitos de Estado ao iniciar o mundo.", error);
    }
    try {
        await reconcileEquipmentModifierGrantedEffects();
    } catch (error) {
        console.error("GUM | Falha ao reconciliar efeitos concedidos por equipamentos.", error);
    }
});
