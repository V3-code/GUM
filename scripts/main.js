// ================================================================== //
//  1. IMPORTAÇÕES 
// ================================================================== //

import { ModifierBrowser } from "../module/apps/modifier-browser.js";
import { ConditionBrowser } from "../module/apps/condition-browser.js";
import { EffectBrowser } from "../module/apps/effect-browser.js";
import { GurpsArmorSheet } from "../module/item/gurps-armor-sheet.js";
import { GurpsActorSheet } from "../module/actor/gurps-actor-sheet.js";
import "../scripts/journal-pdf.js";
import { GurpsItemSheet } from "../module/item/gurps-item-sheet.js";
import { TemplateItemSheet } from "../module/item/template-item-sheet.js";
import { registerSystemSettings } from "../module/settings.js";
import DamageApplicationWindow from './apps/damage-application.js';
import { ConditionSheet } from "./apps/condition-sheet.js";
import { EffectSheet } from './apps/effect-sheet.js';
import { TriggerSheet } from './apps/trigger-sheet.js';
import { applySingleEffect, getEffectActions } from './effects-engine.js';
import { GUM } from '../module/config.js';
import { importFromGCS } from "../module/apps/importers.js";
import { GumGMScreen } from "../module/apps/gm-screen.js";
import { GurpsRollPrompt } from "../module/apps/roll-prompt.js";
import { GurpsDamageRollPrompt } from "../module/apps/damage-roll-prompt.js";
import { getBodyProfile, getBodyLocationDefinition } from "../module/config/body-profiles.js";

const { Actors: ActorsCollection, Items: ItemsCollection } = foundry.documents.collections;
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
            "system.roll_modifier_entries": firstAction.roll_modifier_entries ?? [],
            "system.whisperMode": firstAction.whisperMode ?? "public",
            "system.category": firstAction.category ?? "hp",
            "system.name": firstAction.name ?? "",
            "system.chat_notice": Boolean(firstAction.chat_notice),
            "system.confirm_prompt": Boolean(firstAction.confirm_prompt),
            "system.variable_value": Boolean(firstAction.variable_value),
            "system.statusId": firstAction.statusId ?? "dead"
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

function _getCurrentUserRollMode() {
    return game.settings?.get("core", "rollMode") ?? CONST.DICE_ROLL_MODES.PUBLIC;
}

export function applyCurrentRollPrivacy(chatData, { force = false } = {}) {
    if (!chatData || typeof chatData !== "object") return chatData;

    const hasExplicitPrivacy = chatData.whisper !== undefined || chatData.blind !== undefined || chatData.rollMode !== undefined;
    if (hasExplicitPrivacy && !force) return chatData;

    const rollMode = _getCurrentUserRollMode();
    if (typeof ChatMessage.applyRollMode === "function") {
        return ChatMessage.applyRollMode({ ...chatData }, rollMode);
    }

    const nextData = { ...chatData, rollMode };
    delete nextData.whisper;
    delete nextData.blind;

    switch (rollMode) {
        case CONST.DICE_ROLL_MODES.PRIVATE:
            nextData.whisper = ChatMessage.getWhisperRecipients("GM");
            break;
        case CONST.DICE_ROLL_MODES.BLIND:
            nextData.whisper = ChatMessage.getWhisperRecipients("GM");
            nextData.blind = true;
            break;
        case CONST.DICE_ROLL_MODES.SELF:
            nextData.whisper = [game.user.id];
            break;
        default:
            break;
    }

    return nextData;
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

        // --- ETAPA 0: RESETAR VALORES ---
const allAttributes = ['st', 'dx', 'iq', 'ht', 'vont', 'per', 'hp', 'fp', 'mt', 'basic_speed', 'basic_move', 'enhanced_move', 'lifting_st', 'dodge',
            'vision', 'hearing', 'tastesmell', 'touch'];
        allAttributes.forEach(attr => {
            if (attributes[attr]) {
                attributes[attr].temp = 0;
                attributes[attr].passive = 0;
                attributes[attr].override = null;
            }
        });
const activeEffects = Array.isArray(this.effects) ? this.effects : Array.from(this.effects?.values?.() || []);
        for (const effect of activeEffects) {
            const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
            const isPendingCombat = gumDuration.pendingCombat === true;
            const isPendingStart = gumDuration.pendingStart === true;
            if (effect?.disabled || effect?.isSuppressed || isPendingCombat || isPendingStart) continue;
            for (const change of effect?.changes || []) {
                const normalizedPath = normalizeEffectPath(change.key);
                if (!normalizedPath?.startsWith("system.attributes.")) continue;
                if (!normalizedPath.endsWith(".passive") && !normalizedPath.endsWith(".temp") && !normalizedPath.endsWith(".override")) continue;
                let value = change.value;
                if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
                    value = Number(value);
                }
                const currentVal = foundry.utils.getProperty(this, normalizedPath) ?? 0;
                if (change.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) {
                    foundry.utils.setProperty(this, normalizedPath, value);
                } else if (change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY) {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal * numericValue);
                } else if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal + numericValue);
                }
            }
        }
        if (combat.dr_temp_mods) {
            for (const key in combat.dr_temp_mods) combat.dr_temp_mods[key] = 0;
        }
        
        // (Removido: combat.defense_bonus = 0)

        // --- ETAPA 1: PRÉ-PROCESSAMENTO DE ITENS (MODIFICADORES DE EQUIPAMENTO) ---
        for (const item of this.items) {
            if (['equipment', 'armor'].includes(item.type)) {
                const baseWeight = Number(item.system.weight) || 0;
                const baseCost = Number(item.system.cost) || 0;
                
                let totalCF = 0;
                let weightMultiplier = 1;

                const modifiers = item.system.eqp_modifiers || {};
                for (const mod of Object.values(modifiers)) {
                    totalCF += Number(mod.cost_factor) || 0;
                    if (mod.weight_mod) {
                        const wModStr = mod.weight_mod.toString().trim().toLowerCase();
                        if (wModStr.startsWith('x')) {
                            const mult = parseFloat(wModStr.substring(1));
                            if (!isNaN(mult)) weightMultiplier *= mult;
                        }
                    }
                }

                item.system.effectiveWeight = baseWeight * weightMultiplier;
                item.system.effectiveCost = baseCost * Math.max(0, 1 + totalCF);
                
                // (Removido: Lógica de somar DB ao combat.defense_bonus)
            }
        }

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
        const liftingST = attributes.lifting_st.final_computed;
        const basicLift = (liftingST * liftingST) / 10; 
        attributes.basic_lift = { value: basicLift };
        
        let totalWeight = 0;
        const ignoreCarried = this.system.encumbrance.ignore_carried_weight;
        for (let i of this.items) { 
            if ((['equipment', 'armor'].includes(i.type) || i.system.hasOwnProperty('weight'))) {
                const weight = i.system.effectiveWeight !== undefined ? i.system.effectiveWeight : (i.system.weight || 0);
                const quantity = i.system.quantity || 1;
                const loc = i.system.location;
                
                if (loc === 'equipped' || (loc === 'carried' && !ignoreCarried)) {
                    totalWeight += weight * quantity;
                }
            }
        }

        let enc = { level_name: "Nenhuma", level_value: 0, penalty: 0 };
        if (totalWeight > basicLift * 6) enc = { level_name: "M. Pesada (4)", level_value: 4, penalty: -4 };
        else if (totalWeight > basicLift * 3) enc = { level_name: "Pesada (3)", level_value: 3, penalty: -3 };
        else if (totalWeight > basicLift * 2) enc = { level_name: "Média (2)", level_value: 2, penalty: -2 };
        else if (totalWeight > basicLift) enc = { level_name: "Leve (1)", level_value: 1, penalty: -1 };
        
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
  { name: 'Nenhuma', short: '', max: levels.none },
  { name: 'Leve', short: 'L', max: levels.light },
  { name: 'Média', short: 'M', max: levels.medium },
  { name: 'Pesada', short: 'P', max: levels.heavy },
  { name: 'M. Pesada', short: 'MP', max: levels.xheavy }
].map((level, idx, arr) => {
  const numericMax = Number(level.max) || 0;
  const markerPercent = maxEncumbrance > 0
    ? Math.min(100, Math.max(0, (numericMax / maxEncumbrance) * 100))
    : 0;

  // Limite inferior (para texto "acima de")
  const prevMax = idx === 0 ? 0 : (Number(arr[idx - 1].max) || 0);

  // Texto curto para legenda: "até X" / "acima de X"
  const labelShort = idx === 0
    ? `até ${numericMax.toFixed(2)} kg`
    : `acima de ${prevMax.toFixed(2)} kg`;

  // Tooltip mais completo (intervalo)
  const labelRange = idx === 0
    ? `Até ${numericMax.toFixed(2)} kg`
    : (idx === arr.length - 1
        ? `Acima de ${prevMax.toFixed(2)} kg`
        : `Acima de ${prevMax.toFixed(2)} kg até ${numericMax.toFixed(2)} kg`);

  // Penalidade (casando com sua regra enc.level_value)
  const penalty = idx === 0 ? 0 : -idx; // 0, -1, -2, -3, -4

  return {
    ...level,
    marker_percent: Math.round(markerPercent * 100) / 100,

    // Campos novos (não quebram nada se não usados)
    min: Math.round(prevMax * 100) / 100,
    label_short: labelShort,
    barrier_tooltip: `${numericMax.toFixed(2)} kg`,
    tooltip: `${level.name}: ${labelRange} • Penalidade ${penalty >= 0 ? `0` : penalty}`,
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
    short: level.short,
    name: level.name,
    midpoint_percent: Math.round(Math.min(100, Math.max(0, midpoint)) * 100) / 100
  };
});

        // --- DEFESAS ATIVAS ---
        const finalBasicSpeedComputed = attributes.basic_speed.final_computed;
        attributes.dodge.value = Math.floor(finalBasicSpeedComputed) + 3;
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

        // --- ETAPA 6: CÁLCULO FINALÍSSIMO ---
        for (const attr of allAttributes) {
            if (attributes[attr]) {
                const override = attributes[attr].override;
                attributes[attr].final = (override !== null && override !== undefined) ? override : attributes[attr].final_computed;
            }
        }

        // --- ETAPA 7: CÁLCULO DE RD ---
        function _mergeDRObjects(target, source) {
            if (!source || typeof source !== 'object') {
                const value = Number(source) || 0;
                if (value > 0) target.base = (target.base || 0) + value;
                return;
            }
            for (const [type, value] of Object.entries(source)) {
                target[type] = (target[type] || 0) + (Number(value) || 0);
            }
        }
        const profileId = combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);
         const baseLocationKeys = Object.keys(profile.locations || {});
        const locationKeySet = new Set(baseLocationKeys);
        const extraLocationKeys = new Set();
        const drFromArmor = {};

        for (let i of this.items) { 
            const hasArmorDR = (i.type === 'armor' || i.type === 'equipment')
                && i.system.location === 'equipped'
                && i.system.dr_locations;
            if (hasArmorDR) {
                const itemDrLocations = i.system.dr_locations || {};
                for (const [loc, drObject] of Object.entries(itemDrLocations)) {
                    if (!locationKeySet.has(loc)) {
                        if (!getBodyLocationDefinition(loc)) continue;
                        extraLocationKeys.add(loc);
                    }
                }
            }
        }

        const locationKeys = [...baseLocationKeys, ...extraLocationKeys];
        const allLocationKeySet = new Set(locationKeys);

        for (const key of locationKeys) {
            drFromArmor[key] = {};
        }

        for (let i of this.items) { 
            const hasArmorDR = (i.type === 'armor' || i.type === 'equipment')
                && i.system.location === 'equipped'
                && i.system.dr_locations;
            if (hasArmorDR) {
                const itemDrLocations = i.system.dr_locations || {};
                for (const [loc, drObject] of Object.entries(itemDrLocations)) {
                    if (!allLocationKeySet.has(loc)) continue;
                    _mergeDRObjects(drFromArmor[loc], drObject);
                }
            }
        }

        const totalDr = {};
        const drMods = combat.dr_mods || {}; 
        const drTempMods = combat.dr_temp_mods || {}; 
        for (let key of locationKeys) {
            totalDr[key] = {}; 
            _mergeDRObjects(totalDr[key], drFromArmor[key]); 
            _mergeDRObjects(totalDr[key], drMods[key]);      
            _mergeDRObjects(totalDr[key], drTempMods[key]); 
        }
        combat.dr_locations = totalDr; 
        combat.dr_from_armor = drFromArmor;
        
          // --- ETAPA 8: CÁLCULO DE NH ---
        const parseReferenceModifier = (referenceText) => {
            const raw = String(referenceText ?? "").trim();
            const modifierMatch = raw.match(/^(.*?)([+-]\d+)\s*$/);
            if (!modifierMatch) {
                return { reference: raw, modifier: 0 };
            }

            const parsedModifier = Number(modifierMatch[2]);
            if (!Number.isFinite(parsedModifier)) {
                return { reference: raw, modifier: 0 };
            }

            const baseReference = modifierMatch[1].trim();
            if (!baseReference) {
                return { reference: raw, modifier: 0 };
            }

            return { reference: baseReference, modifier: parsedModifier };
        };

        const applyModifierToResolved = (resolvedValue, modifier) => {
            const safeModifier = Number(modifier) || 0;
            if (!safeModifier) return resolvedValue;
            const signedModifier = safeModifier > 0 ? `+${safeModifier}` : String(safeModifier);
            return {
                value: resolvedValue.value + safeModifier,
                label: `${resolvedValue.label}${signedModifier}`
            };
        };

        const resolveRollReference = (rawReference, skillList) => {
            const originalLabel = String(rawReference ?? "").trim();
            const { reference, modifier } = parseReferenceModifier(originalLabel);
            const normalizedRef = reference.toLowerCase();
            const fixedNumber = Number(normalizedRef);
            const refSkill = skillList.find(s => s.name?.toLowerCase().trim() === normalizedRef);
            const attribute = attributes[normalizedRef];

            if (attribute?.final !== undefined) {
                return applyModifierToResolved({
                    value: Number(attribute.final) || 10,
                    label: reference || normalizedRef.toUpperCase()
                }, modifier);
            }

            if (!isNaN(fixedNumber) && normalizedRef !== "") {
                return applyModifierToResolved({ value: fixedNumber, label: reference || String(fixedNumber) }, modifier);
            }

            if (refSkill) {
                return applyModifierToResolved({
                    value: Number(refSkill.system.final_nh) || 10,
                    label: refSkill.name || reference || "N/A"
                }, modifier);
            }

            return applyModifierToResolved({ value: 10, label: reference || "DX" }, modifier);
        };

        const evaluateRollReference = (rawReference, skillList) => {
            const source = String(rawReference ?? "").trim();
            if (!source) return resolveRollReference("dx", skillList);

            const matchExpression = source.match(/^(maior|menor|max|min)\s*\((.*)\)$/i);
            const fallbackReferences = source.split(",").map(ref => ref.trim()).filter(Boolean);

            let mode = "single";
            let references = fallbackReferences;

            if (matchExpression) {
                mode = /^(menor|min)$/i.test(matchExpression[1]) ? "min" : "max";
                references = matchExpression[2].split(",").map(ref => ref.trim()).filter(Boolean);
            } else if (fallbackReferences.length > 1) {
                mode = "max";
            }

            const resolvedEntries = references.map(ref => resolveRollReference(ref, skillList));
            if (!resolvedEntries.length) return resolveRollReference("dx", skillList);

            let selected = resolvedEntries[0];
            if (mode === "max") {
                selected = resolvedEntries.reduce((best, current) => current.value > best.value ? current : best, resolvedEntries[0]);
            } else if (mode === "min") {
                selected = resolvedEntries.reduce((best, current) => current.value < best.value ? current : best, resolvedEntries[0]);
            }
            return selected;
        };

        const skills = this.items.filter(i => i.type === 'skill');
        const spellsAndPowers = this.items.filter(i => ['spell', 'power'].includes(i.type));
        const equipment = this.items.filter(i => ['melee_weapon', 'ranged_weapon', 'equipment', 'armor'].includes(i.type));
        const actorActiveEffects = Array.from(this.appliedEffects ?? this.effects ?? []);

        const matchesEntryTargetForItem = (entry = {}, item = null) => {
            const targets = String(entry?.target_values ?? "")
                .split(",")
                .map((name) => name.trim().toLowerCase())
                .filter(Boolean);
            if (!targets.length) return true;
            const itemName = (item?.name || "").trim().toLowerCase();
            if (!itemName) return false;
            return targets.includes(itemName);
        };

        const matchesEntryContextForItem = (entry = {}, item) => {
            const context = (entry?.contexts ?? entry?.context ?? "all").toString().trim();
            if (!context || context === "all") return true;
            const contexts = context.includes(",") ? context.split(",").map(c => c.trim()) : [context];
            const baseAttr = (item?.system?.base_attribute || "").toString().trim().toLowerCase();
            return contexts.some((ctx) => {
                if (ctx === "skill") return item.type === "skill";
                if (ctx === "spell") return item.type === "spell";
                if (ctx === "power") return item.type === "power";
                if (ctx.startsWith("skill_")) return item.type === "skill" && baseAttr === ctx.replace("skill_", "");
                return false;
            });
        };

        const collectNhBonusesForItem = (item) => {
            const bonus = { passive: 0, temp: 0 };
            for (const effect of actorActiveEffects) {
                const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
                if (!data) continue;
                const entries = Array.isArray(data.entries) && data.entries.length
                    ? data.entries
                    : [{ value: data.value, nh_display_mode: data.nh_display_mode ?? "roll_only", target_kind: data.target_kind ?? "any", target_mode: data.target_mode ?? "all", target_values: data.target_values ?? "" }];
                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                const isPermanent = gumDuration._uiMode === "permanent" || gumDuration.isPermanent === true;
                entries.forEach((entry) => {
                    if ((entry?.nh_display_mode || "roll_only") !== "include_in_nh") return;
                    if (!matchesEntryTargetForItem(entry, item)) return;
                    if (!matchesEntryContextForItem(entry, item)) return;
                    const value = _evaluateModifierValue(this, entry?.value, { itemId: item.id, type: item.type, itemName: item.name });
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
                    const nhBonuses = collectNhBonusesForItem(i);
                    const nhPassive = (Number(i.system.nh_passive) || 0) + nhBonuses.passive;
                    const nhTemp = (Number(i.system.nh_temp) || 0) + nhBonuses.temp;
                    const nhOverride = i.system.nh_override;
                    i.system.final_nh = nhOverride !== null && nhOverride !== "" && nhOverride !== undefined
                        ? Number(nhOverride) || 0
                        : nhBase + nhLevel + nhMod + nhPassive + nhTemp;
                } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
            }
        }
        
        for (const i of spellsAndPowers) {
     try {
                const conjurationBaseVal = evaluateRollReference(i.system.base_attribute, skills).value;
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
                if (i.system.attack_roll?.skill_name) {
                    const resolvedAttackBase = evaluateRollReference(i.system.attack_roll.skill_name, skills);
                    const attackBaseVal = resolvedAttackBase.value;
                    i.system.attack_nh = attackBaseVal + (i.system.attack_roll.skill_level_mod || 0);
                    i.system.attack_roll.resolved_skill_name = resolvedAttackBase.label;
                }
            } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
        }
        
        for (const i of equipment) {
            try {
   if (i.system.melee_attacks) {
                    for (let attack of Object.values(i.system.melee_attacks)) {
                        const resolvedAttackBase = evaluateRollReference(attack.skill_name, skills);
                        const attackBaseVal = resolvedAttackBase.value;
                        attack.final_nh = attackBaseVal + (Number(attack.skill_level_mod) || 0);
                        attack.resolved_skill_name = resolvedAttackBase.label;
                        
                        // Aparar (Parry) - ✅ CORREÇÃO: Removido '+ combat.defense_bonus'
                        if (attack.parry !== "0" && attack.parry !== "No") {
                             const parryBase = Math.floor(attack.final_nh / 2) + 3;
                             const parryMod = Number(attack.parry) || 0;
                             let finalParry = 0;
                             if (parryMod > 5) finalParry = parryMod; 
                             else finalParry = parryBase + parryMod;
                             attack.final_parry = finalParry;
                        }
                        
                        // Bloqueio (Block) - ✅ CORREÇÃO: Removido '+ combat.defense_bonus'
                        if (attack.block !== "0" && attack.block !== "No") {
                             const blockBase = Math.floor(attack.final_nh / 2) + 3;
                             const blockMod = Number(attack.block) || 0;
                             let finalBlock = 0;
                             if (blockMod > 5) finalBlock = blockMod; 
                             else finalBlock = blockBase + blockMod;
                             attack.final_block = finalBlock;
                        }
                    }
                }
                if (i.system.ranged_attacks) {
                    for (let attack of Object.values(i.system.ranged_attacks)) {
                        const resolvedAttackBase = evaluateRollReference(attack.skill_name, skills);
                        const attackBaseVal = resolvedAttackBase.value;
                        attack.final_nh = attackBaseVal + (Number(attack.skill_level_mod) || 0);
                        attack.resolved_skill_name = resolvedAttackBase.label;
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

    if (resolvedRollData.quick && typeof performGURPSRoll !== "undefined") {
        return performGURPSRoll(actor, resolvedRollData);
    }

    if (typeof GurpsRollPrompt !== "undefined") {
        return new GurpsRollPrompt(actor, resolvedRollData).render(true);
    }

    return performGURPSRoll(actor, resolvedRollData);
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

export async function performGURPSRoll(actor, rollData, extraOptions = {}) {
    
    // --- 1. LÓGICA DE VALORES BASE ---
    const hasProcessedData = rollData.originalValue !== undefined;
    let sourceItem = null;
    if (rollData.itemUuid) {
        sourceItem = await fromUuid(rollData.itemUuid).catch(() => null);
    } else if (rollData.itemId && actor?.items) {
        sourceItem = actor.items.get(rollData.itemId) || null;
    }
    
    // Valor Base (Atributo Puro)
    const baseValue = parseInt(hasProcessedData ? rollData.originalValue : rollData.value) || 10;
    
    // Modificador que veio do Prompt (Manual)
    const promptMod = parseInt(rollData.modifier) || 0;
    
    const label = rollData.label || "Teste";

    // --- 2. LÓGICA DE MODIFICADORES GLOBAIS (ESCUDO / CONDIÇÕES) ---    
    
    let globalModValue = 0;
    let lowestCap = extraOptions.effectiveCap !== undefined ? extraOptions.effectiveCap : Infinity; 

    // Só processa globais se NÃO tivermos instrução para ignorar
    if (!extraOptions.ignoreGlobals) {
        const rollContext = _determineRollContext(actor, rollData);
        const globalMods = actor.getFlag("gum", "gm_modifiers") || [];
        
        globalMods.forEach(m => {
            const modContext = m?.contexts ?? m?.context ?? "all";
            if (!_matchesRollContext(modContext, rollContext)) return;

            // Soma o valor
            globalModValue += _evaluateModifierValue(actor, m.value, rollData);
            
            // Verifica o Teto (Cap)
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                // Se achou um teto menor do que o atual, atualiza
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });

        const effectMods = _collectEffectRollModifiers(actor, rollContext, rollData);
        effectMods.forEach(m => {
            globalModValue += _evaluateModifierValue(actor, m.value, rollData);
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });

        const counterEffectMods = _collectTargetCounterRollModifiers(actor, rollContext, rollData);
        counterEffectMods.forEach(m => {
            globalModValue += _evaluateModifierValue(actor, m.value, rollData);
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });
    }

    // --- 3. CÁLCULO FINAL (EVITA DUPLICAÇÃO) ---
    
    // Se o Prompt estiver enviando o valor total (base + globais + manual) no 'value',
    // nós devemos tomar cuidado. Mas assumindo que 'value' é base e 'modifier' é extra:
    
    const totalModifier = promptMod + globalModValue;

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
    const roll = new Roll("3d6");
    await roll.evaluate();
    const total = roll.total;

    // --- 5. RESULTADO ---
    const isSuccess = total <= effectiveLevel;
    const margin = Math.abs(effectiveLevel - total);
    
    let resultLabel = isSuccess ? "Sucesso" : "Falha";
    let statusClass = isSuccess ? "success" : "failure";
    let marginLabel = "Margem";
    const rollOutcome = isSuccess ? "success" : "failure";

    // Críticos
    const isCritSuccess = (total <= 4) || (total === 5 && effectiveLevel >= 15) || (total === 6 && effectiveLevel >= 16);
    const isCritFailure = (total >= 18) || (total === 17 && effectiveLevel <= 15) || (total - effectiveLevel >= 10);

    if (isCritSuccess) {
        resultLabel = "Sucesso Crítico";
        statusClass = "crit-success";
    } else if (isCritFailure) {
        resultLabel = "Falha Crítica";
        statusClass = "crit-failure";
    }

    // --- 7. HTML DO CARD ---
 const diceFaces = roll.dice[0].results.map((d) => `<span class="die-face">${d.result}</span>`).join('');
    const modText = totalModifier !== 0 ? `${totalModifier > 0 ? '+' : ''}${totalModifier}` : '±0';

    const modBreakdown = `M ${promptMod >= 0 ? '+' : ''}${promptMod} | G ${globalModValue >= 0 ? '+' : ''}${globalModValue}`;
    const targetPill = isCapped ? `Alvo ${effectiveLevel} (Cap ${lowestCap})` : `Alvo ${effectiveLevel}`;

    const damageActionData = _buildDamageActionData(actor, sourceItem, rollData);
    const damageActionAttr = damageActionData
        ? encodeURIComponent(JSON.stringify(damageActionData))
        : "";

    const content = `
        <div class="gurps-roll-card premium">
            <header class="card-header">
                <h3>${label}</h3>
                <small>${actor.name}</small>
            </header>

            <div class="card-formula-container">
                <span class="formula-pill">NH ${baseValue}</span>
                <span class="formula-pill">${modText} (${modBreakdown})</span>
            </div>

            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column">
                        <span class="column-label">Dados</span>
                        <div class="roll-total">${total}</div>
                        <div class="individual-dice">${diceFaces}</div>
                    </div>

                    <div class="column-separator"></div>

                    <div class="target-column">
                        <span class="column-label">Alvo</span>
                        <div class="target-value">${effectiveLevel}</div>
                        <div class="target-note">${isCapped ? `Cap ${lowestCap}` : 'Final'}</div>
                    </div>
                </div>
            </div>

            <footer class="card-footer">
                <div class="result-block ${statusClass}">
                    <span class="result-label">${resultLabel}</span>
                    <span class="result-margin">Margem ${margin}</span>
                </div>
                ${damageActionData ? `
                    <div class="roll-chat-actions">
                        <button type="button" class="chat-roll-damage-button" data-damage-action="${damageActionAttr}">
                            <i class="fas fa-burst"></i> Rolar Dano
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
    });
    ChatMessage.create(chatData);

    if (rollData.type === "defense") {
        await processConditions(actor, {
            pulse: true,
            type: "defense_roll",
            defenseType: rollData.defenseType || null,
            inCombat: Boolean(game.combat)
        });
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

    if (sourceItem?.system?.useEventEffects) {
        try {
            await applyUseEventEffects(sourceItem, actor, "activate", extraOptions);
        } catch (err) {
            console.error("GUM | Falha ao aplicar Evento de Uso (activate):", err);
        }
    }
}

function _buildDamageActionData(actor, sourceItem, rollData) {
    if (!actor || !sourceItem) return null;

    const attackId = rollData.attackId || null;
    if (attackId) {
        const attack =
            sourceItem.system?.melee_attacks?.[attackId] ||
            sourceItem.system?.ranged_attacks?.[attackId];
        if (attack?.damage_formula) {
            return {
                actorId: actor.id,
                actorUuid: actor.uuid,
                itemId: sourceItem.id,
                itemUuid: sourceItem.uuid,
                attackId,
                sourceLabel: `${sourceItem.name} (${attack.mode ?? attackId})`
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
        if (attack?.damage_formula) {
            normalizedAttack = {
                name: payload.sourceLabel || `${item.name} (${attack.mode ?? attackId})`,
                formula: attack.damage_formula,
                type: attack.damage_type,
                armor_divisor: attack.armor_divisor,
                follow_up_damage: foundry.utils.duplicate(attack.follow_up_damage || {}),
                fragmentation_damage: foundry.utils.duplicate(attack.fragmentation_damage || {}),
                onDamageEffects: attack.onDamageEffects || {},
                generalConditions: item.system.generalConditions || {}
            };
        }
    } else if (item.system?.damage?.formula) {
        const dmg = item.system.damage;
        normalizedAttack = {
            name: payload.sourceLabel || item.name,
            formula: dmg.formula,
            type: dmg.type,
            armor_divisor: dmg.armor_divisor,
            follow_up_damage: foundry.utils.duplicate(dmg.follow_up_damage || {}),
            fragmentation_damage: foundry.utils.duplicate(dmg.fragmentation_damage || {}),
            onDamageEffects: item.system.onDamageEffects || {},
            generalConditions: item.system.generalConditions || {}
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

    const resolveBaseDamage = (rollActor, formula) => {
        let f = String(formula || "0").toLowerCase();

        const thrust = String(rollActor.system.attributes.thrust_damage || "0").toLowerCase();
        const swing = String(rollActor.system.attributes.swing_damage || "0").toLowerCase();
        const thrustAltRaw = String(rollActor.system.attributes.thrust_damage_alt || "").trim();
        const swingAltRaw = String(rollActor.system.attributes.swing_damage_alt || "").trim();
        const thrustAlt = (thrustAltRaw || thrust).toLowerCase();
        const swingAlt = (swingAltRaw || swing).toLowerCase();

        f = f.replace(/\b(gdpa|thrustalt|thrust_alt|thrusta)\b/gi, `(${thrustAlt})`);
        f = f.replace(/\b(geba|swingalt|swing_alt|swinga)\b/gi, `(${swingAlt})`);
        f = f.replace(/\b(gdpg)\b/gi, `(${thrustAlt})`);
        f = f.replace(/\b(gebg)\b/gi, `(${swingAlt})`);
        f = f.replace(/\b(gdp|thrust)\b/gi, `(${thrust})`);
        f = f.replace(/\b(geb|gdb|swing)\b/gi, `(${swing})`);

        return f;
    };

    const extractMathFormula = (formula) => {
        const match = String(formula).match(/^([0-9dDkK+\-/*\s()]+)/i);
        return match ? match[1].trim() : "0";
    };

    const summarySegments = [];
    const mainDisplayFormula = extractMathFormula(resolveBaseDamage(actor, normalizedAttack.formula));
    summarySegments.push(`${mainDisplayFormula} ${normalizedAttack.type || ""}`.trim());
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
        main: {
            formula: normalizedAttack.formula,
            displayFormula: mainDisplayFormula,
            summaryFormula: summarySegments.join(" • "),
            type: normalizedAttack.type || ""
        },
        followUp: {
            formula: normalizedAttack.follow_up_damage?.formula || "",
            type: normalizedAttack.follow_up_damage?.type || ""
        },
        fragmentation: {
            formula: normalizedAttack.fragmentation_damage?.formula || "",
            type: normalizedAttack.fragmentation_damage?.type || ""
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

    if (promptResult.followUpAdditional) {
        normalizedAttack.follow_up_damage = normalizedAttack.follow_up_damage || { formula: "", type: "", armor_divisor: 1 };
        normalizedAttack.follow_up_damage.formula = appendAdditional(normalizedAttack.follow_up_damage.formula || "0", promptResult.followUpAdditional);
        if (!normalizedAttack.follow_up_damage.type && promptResult.followUpType) normalizedAttack.follow_up_damage.type = promptResult.followUpType;
    }

    if (promptResult.fragmentationAdditional) {
        normalizedAttack.fragmentation_damage = normalizedAttack.fragmentation_damage || { formula: "", type: "", armor_divisor: 1 };
        normalizedAttack.fragmentation_damage.formula = appendAdditional(normalizedAttack.fragmentation_damage.formula || "0", promptResult.fragmentationAdditional);
        if (!normalizedAttack.fragmentation_damage.type && promptResult.fragmentationType) normalizedAttack.fragmentation_damage.type = promptResult.fragmentationType;
    }

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
        sourceName: normalizedAttack.name,
        main: {
            total: mainRoll.total,
            type: normalizedAttack.type || "",
            armorDivisor: normalizedAttack.armor_divisor || 1
        },
        onDamageEffects: combinedOnDamageEffects,
        generalConditions: normalizedAttack.generalConditions
    };

    if (followUpRoll) {
        damagePackage.followUp = {
            total: followUpRoll.total,
            type: normalizedAttack.follow_up_damage.type || "",
            armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
        };
    }

    if (fragRoll) {
        damagePackage.fragmentation = {
            total: fragRoll.total,
            type: normalizedAttack.fragmentation_damage.type || "",
            armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
        };
    }

    const mainDiceHtml = mainRoll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");
    const formulaSegments = [];
    formulaSegments.push(`${mainFormula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor !== 1 ? `(${normalizedAttack.armor_divisor})` : ""} ${normalizedAttack.type || ""}`.trim());
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
        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">Dados</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>
            <div class="column-separator"></div>
            <div class="target-column">
              <span class="column-label">Dano Total</span>
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
                <div class="extra-damage-label">Acompanhamento</div>
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
                <div class="extra-damage-label">Fragmentação</div>
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
            <i class="fas fa-crosshairs"></i> Aplicar ao Alvo
          </button>
        </footer>
      </div>
    `;

    const chatData = applyCurrentRollPrivacy({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        rolls
    });
    await ChatMessage.create(chatData);
}

function _determineRollContext(actor, rollData) {
    const type = rollData.type;
    const itemId = rollData.itemId;
    const attributeKey = rollData.attributeKey?.toLowerCase?.() || rollData.attribute?.toLowerCase?.();
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

    if (type === 'spell') return 'spell';
    if (type === 'power') return 'power';

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
            if (item.type === 'spell') return 'spell';
            if (item.type === 'power') return 'power';
            if (item.type === 'ranged_weapon') return 'attack_ranged';
        }
    }

  if (type === 'attack') return 'attack_melee';
    if (type === 'skill' || type === 'attribute') return 'skill';

    return 'default';
}

function _matchesRollContext(modContext, rollContext) {
    if (!modContext || modContext === 'all') return true;
    if (Array.isArray(modContext)) return modContext.includes(rollContext);
    if (typeof modContext === 'string' && modContext.includes(',')) {
        return modContext.split(',').map(c => c.trim()).includes(rollContext);
    }
    if (modContext === 'attack') return rollContext.startsWith('attack');
    if (modContext === 'defense') return rollContext.startsWith('defense');
 if (modContext === 'skill') return rollContext.startsWith('skill_') || rollContext === 'skill';
    return modContext === rollContext;
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

function _evaluateModifierValue(actor, rawValue, rollData = {}) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
    if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;

    const source = String(rawValue).trim();
    if (!source) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(source)) return Number(source) || 0;

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

function _matchesRollTargetFilter(actor, rollData = {}, entry = {}) {
    const targets = String(entry?.target_values ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
    if (!targets.length) return true;
    const item = rollData?.itemId ? actor?.items?.get(rollData.itemId) : null;
    const itemName = (item?.name || "").trim().toLowerCase();
    if (!itemName) return false;
    return targets.includes(itemName);
}

function _collectEffectRollModifiers(actor, rollContext, rollData = {}) {
    const activeEffects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
    const mods = [];
    for (const effect of activeEffects) {
        const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
        if (!data) continue;
        const entries = Array.isArray(data.entries) && data.entries.length
            ? data.entries
            : [{ value: data.value, cap: data.cap, context: data.context, application_side: data.applicationSide ?? "self" }];

        entries.forEach((entry, index) => {
            const context = entry?.contexts ?? entry?.context ?? data.context ?? "all";
            if (!_matchesRollContext(context, rollContext)) return;
            if (!_matchesRollTargetFilter(actor, rollData, entry)) return;
            if ((entry?.nh_display_mode || "roll_only") === "include_in_nh") return;
            const applicationSide = _resolveRollModifierApplicationSide(entry, data);
            if (applicationSide !== "self") return;
            mods.push({
                id: `${effect.id}::${index}`,
                value: entry?.value ?? data.value,
                cap: entry?.cap ?? entry?.nh_cap ?? data.cap
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

function _collectCounterCandidatesFromTarget(targetActor, rollContext, rollData = {}) {
    const candidates = [];
    if (!targetActor) return candidates;
    const activeEffects = Array.from(targetActor.appliedEffects ?? targetActor.effects ?? []);

    for (const effect of activeEffects) {
        const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
        if (!data) continue;

        const entries = Array.isArray(data.entries) && data.entries.length
            ? data.entries
            : [{ value: data.value, cap: data.cap, context: data.context, application_side: data.applicationSide ?? "self" }];

        entries.forEach((entry, entryIndex) => {
            const context = entry?.contexts ?? entry?.context ?? data.context ?? "all";
            if (!_matchesRollContext(context, rollContext)) return;
            if (!_matchesRollTargetFilter(targetActor, rollData, entry)) return;
            if ((entry?.nh_display_mode || "roll_only") === "include_in_nh") return;
            if (_resolveRollModifierApplicationSide(entry, data) !== "vs_targeter") return;
            candidates.push({ effect, entry, entryIndex });
        });
    }

    return candidates;
}

function _collectTargetCounterRollModifiers(actor, rollContext, rollData = {}) {
    if (!actor || !_isCounterContextSupported(rollContext)) return [];

    const targets = _resolveCounterTargetsForRoll(rollData);
    if (targets.length !== 1) return [];

    const [targetToken] = targets;
    const candidates = _collectCounterCandidatesFromTarget(targetToken.actor, rollContext, rollData);
    if (!candidates.length) return [];

    const grouped = new Map();
    for (const candidate of candidates) {
        const key = _buildCounterGroupKey(candidate.entry, candidate.effect, candidate.entryIndex);
        const value = candidate.entry?.value ?? 0;
        const cap = candidate.entry?.cap ?? candidate.entry?.nh_cap ?? "";
        const current = grouped.get(key);
        if (!current || Number(value) < Number(current.value)) {
            grouped.set(key, {
                id: `counter::${targetToken.id}::${key}`,
                value,
                cap
            });
        }
    }
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
                const activeTokens = actor.getActiveTokens();
                finalTargets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
            } else {
                finalTargets = Array.from(game.user.targets);
            }

            if (finalTargets.length === 0) {
                 // Se o alvo for 'target' mas nenhum foi selecionado, podemos usar o próprio ator como fallback ou avisar.
                 // Usar o próprio ator como fallback pode ser um bom padrão.
                 if (effectData.recipient === 'target') {
                    ui.notifications.warn(`O efeito "${effectItem.name}" precisa de um alvo. Aplicando em si mesmo como padrão.`);
                 }
                 const activeTokens = actor.getActiveTokens();
                 finalTargets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
            }
            // Se o efeito tiver barreira de resistência ativada, disparamos o prompt antes de aplicar.
            const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
            const suppressResistanceCard = effectItem.system?.resistanceRoll?.skipPromptCard || activationOptions.suppressResistanceCard;
            if (requiresResistance && !suppressResistanceCard) {
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
    if (!item || !actor) return;
    const normalizedTrigger = `${trigger || ""}`.trim().toLowerCase();
    if (!normalizedTrigger) return;

    const useEventEffects = item.system?.useEventEffects || {};
    const effectsList = Object.values(useEventEffects).filter((effectData) => {
        const entryTrigger = `${effectData?.useEventTrigger || "consume"}`.trim().toLowerCase();
        return entryTrigger === normalizedTrigger;
    });
    if (!effectsList.length) return;

    for (const effectData of effectsList) {
        const effectItem = await fromUuid(effectData.effectUuid).catch(() => null);
        if (!effectItem) continue;

        let finalTargets = [];
        if (effectData.recipient === "self") {
            const activeTokens = actor.getActiveTokens();
            finalTargets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
        } else {
            finalTargets = Array.from(game.user.targets || []);
        }

        if (finalTargets.length === 0) {
            if (effectData.recipient === "target") {
                ui.notifications.warn(`O efeito "${effectItem.name}" precisa de um alvo. Aplicando em si mesmo como padrão.`);
            }
            const activeTokens = actor.getActiveTokens();
            finalTargets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
        }

        const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
        const suppressResistanceCard = effectItem.system?.resistanceRoll?.skipPromptCard || options.suppressResistanceCard;
        if (requiresResistance && !suppressResistanceCard) {
            for (const targetToken of finalTargets) {
                await _promptActivationResistance(effectItem, targetToken, actor, item, effectData.id, {
                    ...options,
                    mode: options.mode || "use-event"
                });
            }
        } else {
            await applySingleEffect(effectItem, finalTargets, { actor, origin: item });
        }
    }
}

/**
 * Cria uma mensagem de chat solicitando o teste de resistência de um efeito de ativação.
 * O teste usa os dados de barreira configurados no item efeito.
 */
async function _promptActivationResistance(effectItem, targetToken, sourceActor, originItem, effectLinkId, options = {}) {
    const rollData = effectItem.system?.resistanceRoll || {};
    const suppressResistanceCard = rollData.skipPromptCard || options.suppressResistanceCard;
    if (suppressResistanceCard) {
        const conditionContext = options.conditionId ? { conditionId: options.conditionId } : {};
        await applySingleEffect(effectItem, [targetToken], {
            actor: sourceActor,
            origin: originItem || effectItem,
            ...conditionContext
        });
        return;
    }
    const applyOnText = rollData.applyOn === 'success' ? 'Em sucesso' : 'Em falha';
    const marginValue = (rollData.margin !== undefined && rollData.margin !== null && rollData.margin !== '') ? rollData.margin : '—';
    const rawModifier = (rollData.modifier ?? "").toString().trim();
    const previewModifier = evaluateNumericFormula(rawModifier, { actor: targetToken.actor });
    const previewModifierSigned = previewModifier > 0 ? `+${previewModifier}` : `${previewModifier}`;
    const isExpressionModifier = rawModifier && !/^[+-]?\d+(\.\d+)?$/.test(rawModifier);
    const testLabel = `${(rollData.attribute || 'HT').toUpperCase()}${rawModifier && previewModifier !== 0 ? ` ${previewModifierSigned}` : ''}`;
    const resistanceChatText = (rollData.chatText || "").toString().trim();
    const resistanceChatTextHtml = resistanceChatText
        ? `<div class="info-row resistance-note-row"><span class="value resistance-note-text">${foundry.utils.escapeHTML(resistanceChatText)}</span></div>`
        : "";

 const chatPayload = {
        mode: options.mode || "activation",
        targetActorId: targetToken.actor?.id,
        targetTokenId: targetToken.id,
        effectItemUuid: effectItem.uuid || null,
        effectItemData: effectItem.toObject(),
        sourceActorId: sourceActor?.id || null,
        originItemUuid: originItem?.uuid || null,
        effectLinkId: effectLinkId || null,
        conditionId: options.conditionId || null
    };

 const content = `
        <div class="gurps-roll-card resistance-roll-card roll-pending">
            <header class="card-header">
                <div class="header-left">
                    <div class="header-icon"><img src="${effectItem.img}"></div>
                    <div class="header-title">
                        <h3>${effectItem.name}</h3>
                        <small>Teste de Resistência Necessário</small>
                    </div>
                </div>
            </header>
            <div class="card-content">
                <div class="resistance-info resistance-info-compact">
                    <div class="info-row">
                        <span class="label">Origem</span>
                        <span class="value">${sourceActor?.name || originItem?.name || 'Origem desconhecida'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Alvo</span>
                        <span class="value with-img">
                             <img src="${targetToken.actor?.img || targetToken.document?.texture?.src || "icons/svg/mystery-man.svg"}" class="actor-token-icon">
                            ${targetToken.name || targetToken.actor?.name || "Alvo"}
                        </span>
                    </div>
                    ${resistanceChatTextHtml}
                    <div class="resistance-test-block">
                        <div class="test-main">Teste de ${testLabel}</div>
                        <div class="test-sub">${applyOnText} | Margem mín: ${marginValue}</div>
                    </div>

                    <div class="pill-row action-row">
                        <button type="button" class="resistance-roll-button full-width" data-roll-data='${JSON.stringify(chatPayload)}'>
                            <i class="fas fa-dice-d6"></i> Rolar Resistência
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;


    const chatData = applyCurrentRollPrivacy({
        speaker: ChatMessage.getSpeaker({ actor: targetToken.actor || sourceActor }),
        content
    });
    ChatMessage.create(chatData);
}


// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() { 
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    game.gum = {};
    game.gum.importFromGCS = importFromGCS;
    game.gum.rollFromHotbar = rollFromHotbar;
    game.gum.applyUseEventEffects = applyUseEventEffects;

    CONFIG.statusEffects = GUM.statusEffects;
    CONFIG.Actor.documentClass = GurpsActor;

    registerSystemSettings();

    Hooks.on("hotbarDrop", (bar, data, slot) => {
        if (data?.type !== "GUM.Roll") return;
        return createGumRollMacro(data, slot);
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
    ItemsCollection.registerSheet("gum", GurpsArmorSheet, { types: ["armor"], makeDefault: true, label: "Ficha de Armadura" });
        ItemsCollection.registerSheet("gum", TemplateItemSheet, {
        types: ["template"],
        makeDefault: true,
        label: "Modelo"
    });

    
    

    // ==================================================================
    // ▼▼▼ BLOCO DE HOOKS CENTRALIZADOS AQUI ▼▼▼
    // ==================================================================
    
// ✅ HOOK DE CRIAÇÃO DE ATOR (POPULA CONDIÇÕES E MODIFICADORES)
    Hooks.on("createActor", async (actor, options, userId) => {
        if (game.user.id !== userId) return;
        if (actor.type !== "character") return;
        
        // Verifica configuração global (se existir)
        if (!game.settings.get("gum", "addDefaultRules")) return;
    
        console.log(`GUM | Populando novo ator: ${actor.name}`);
        const itemsToCreate = [];

        // 1. REGRAS / CONDIÇÕES PASSIVAS
        const rulesPack = game.packs.get("gum.regras")
            || game.packs.find(p => p.metadata.label === "[GUM] Condições Passivas");
  if (rulesPack) {
            const rules = await rulesPack.getDocuments();
            rules.forEach(item => {
                if (item.type === "condition" && item.system?.bindingMode === "status-link") return;
                const data = item.toObject();
                // Vincula ao compêndio para futuras atualizações
                data._stats = { compendiumSource: item.uuid }; 
                itemsToCreate.push(data);
            });
            console.log(`GUM | Preparadas ${rules.length} condições passivas para cópia.`);
        } else {
            console.warn("GUM | Compêndio de Condições Passivas não encontrado.");
        }

        // 2. MODIFICADORES BÁSICOS (A Correção que você pediu)
        // Tenta achar pelo ID do sistema ou pelo Nome
        const modsPack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
        
        if (modsPack) {
            const mods = await modsPack.getDocuments();
            mods.forEach(item => {
                const data = item.toObject();
                // Vincula ao compêndio
                data._stats = { compendiumSource: item.uuid };
                itemsToCreate.push(data);
            });
            console.log(`GUM | Preparados ${mods.length} modificadores básicos para cópia.`);
        } else {
            console.warn("GUM | Compêndio de Modificadores Básicos não encontrado.");
        }

        // 3. CRIAÇÃO EM LOTE (Muito mais rápido)
        if (itemsToCreate.length > 0) {
            try {
                await actor.createEmbeddedDocuments("Item", itemsToCreate);
                console.log(`GUM | Sucesso! ${itemsToCreate.length} itens iniciais adicionados a ${actor.name}.`);
            } catch (err) {
                console.error("GUM | Falha ao popular ator:", err);
            }
        }
    });

    // Gatilho principal para quando os dados do ator mudam (HP, etc.)
    Hooks.on("updateActor", async (actor, data, options = {}, userId) => {
        if (game.user.id !== userId) return;
        try {
            await processConditions(actor, options.gumEventData);
            await processStatusBindings(actor);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        } catch (error) {
            console.error("GUM | Falha no hook updateActor durante processamento de condições/status binding.", error);
        }
    });

Hooks.on("createItem", async (item, options, userId) => {
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

            const activeTokens = actor.getActiveTokens();
            const targets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
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
    });

    Hooks.on("updateItem", async (item, changes, options, userId) => {
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
        if (item.system.passiveEffects) {
            
            // 1. Encontra e Deleta TODOS os ActiveEffects existentes originados deste item
            const updatedItemId = item.id;
            const effectsToDelete = actor.effects.filter(effect => 
                foundry.utils.getProperty(effect, "flags.gum.originItemId") === updatedItemId
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
                const activeTokens = actor.getActiveTokens();
                const targets = activeTokens.length ? activeTokens : [buildFallbackTokenForActor(actor)];
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
                                originItemId: item.id
                            });
                        } catch (err) {
                            console.error(`[GUM] Falha ao criar ActiveEffect passivo (update):`, err);
                        }
                    }
                }
            }
        } // Fim do if (item.system.passiveEffects)
        // =============================================================
        
        // --- Chamada final de atualização ---
        // Sempre reavalia e redesenha após QUALQUER atualização de item no ator
        await processConditions(actor);
        await processStatusBindings(actor);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    });

   Hooks.on("deleteItem", async (item, options, userId) => {
        // Só executa para o usuário que fez a ação e se o item pertencia a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent; // Define o ator uma vez
        const deletedItemId = item.id; // ID do item que foi removido

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
        
        // ==========================================================
        // ✅ BLOCO DE CORREÇÃO DO ÍCONE (INÍCIO)
        // ==========================================================
        // Se o combate foi desativado (encerrado) ou o round resetado para null
        if (changed.active === false || (changed.hasOwnProperty('round') && changed.round === null)) {
            console.log("GUM | Combate encerrado. Limpando ícones dos tokens.");
            if (game.user.isGM) {
                await handleCombatEnd(combat);
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

        if (!game.user.isGM) return;

        if (changed.active === true) {
            await handleCombatStart(combat);
        }

        // --- Lógica de Início de Turno (Seu código original, sem alteração) ---
        if (changed.round !== undefined || (changed.turn !== undefined && combat.combatant)) {
            const currentCombatant = combat.combatant;
            if (currentCombatant?.actor) {
                await handleCombatTurnStart(currentCombatant);
                await processConditions(currentCombatant.actor, { reason: "turnStart", combatId: combat.id }); 
                currentCombatant.token?.object?.drawEffects(); 
            }
        }

        // --- Lógica de Fim de Turno (Seu código original, sem alteração) ---
        if (changed.turn !== undefined && combat.previous.combatantId) {
            const previousCombatant = combat.combatants.get(combat.previous.combatantId);
            if (previousCombatant?.actor) {
                const actor = previousCombatant.actor;
                await manageActiveEffectDurations(actor); 
                await processConditions(actor); 
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
        // Apenas GMs podem ver o botão
        if (!game.user.isGM) return;

        const button = $(`
            <button class="gcs-import-button" type="button" style="width: 100%; margin-bottom: 5px;">
                <i class="fas fa-file-import"></i> Importar do GCS
            </button>
        `);
        
        button.on("click", () => {
            // Chama a função de importação que está em importers.js
            game.gum.importFromGCS();
        });

        // ✅ A CORREÇÃO REAL ESTÁ AQUI:
        // Usamos $(html) em vez de $(html[0]).
        // Isso lida corretamente com o parâmetro 'html'
        // e permite o uso da função .find().
        $(html).find(".directory-header .header-actions").append(button);
    });

});


// ================================================================== //
//  2.1 HOOK DE PRONTO (`ready`)
// ================================================================== //
Hooks.once('ready', async function() {
    console.log("GUM | Fase 'ready': Aplicando configurações.");

    await migrateEffectTokenIconPolicy();
    await migrateEffectActionsSchema();

    if (game.user?.isGM) {
        const ensureCompendiumFolder = async ({ name, color, parent = null }) => {
            const existing = game.folders?.find(folder =>
                folder.type === "Compendium" &&
                folder.name === name &&
                ((folder.folder?.id ?? folder.folder ?? null) === (parent?.id ?? null))
            );
            if (existing) {
                const updates = {};
                if (color && existing.color !== color) updates.color = color;
                if (Object.keys(updates).length > 0) await existing.update(updates);
                return existing;
            }

            return Folder.create({
                name,
                type: "Compendium",
                color,
                folder: parent?.id ?? null
            });
        };

        const movePacksToFolder = async (packs, targetFolder) => {
            for (const pack of packs) {
                if (!pack || !targetFolder) continue;
                if (pack.folder?.id === targetFolder.id || pack.folder === targetFolder.id) continue;
                try {
                    await pack.configure({ folder: targetFolder.id });
                } catch (error) {
                    console.warn(`GUM | Não foi possível mover o compêndio "${pack.collection}" para a pasta "${targetFolder.name}".`, error);
                }
            }
        };

        const pastaSistema = await ensureCompendiumFolder({
            name: "[GUM] SISTEMA",
            color: "#4f3c11"
        });
        const pastaCondicoesEfeitos = await ensureCompendiumFolder({
            name: "[GUM] Condições e Efeitos",
            color: "#7a5d1a",
            parent: pastaSistema
        });
        const pastaModificadores = await ensureCompendiumFolder({
            name: "[GUM] Modificadores",
            color: "#7a5d1a",
            parent: pastaSistema
        });
        const pastaCenario = await ensureCompendiumFolder({
            name: "[GUM] CENÁRIO",
            color: "#11501b"
        });

        const packsSistemaCondicoesEfeitos = [
            game.packs.get("gum.conditions"),
            game.packs.get("gum.Regras"),
            game.packs.get("gum.efeitos"),
            game.packs.get("gum.gatilhos")
        ].filter(Boolean);

        const packsSistemaModificadores = [
            game.packs.get("gum.modifiers"),
            game.packs.get("gum.eqp_modifiers"),
            game.packs.get("gum.gm_modifiers")
        ].filter(Boolean);

        const idsSistema = new Set([
            ...packsSistemaCondicoesEfeitos.map(pack => pack.collection),
            ...packsSistemaModificadores.map(pack => pack.collection)
        ]);
        const packsCenario = game.packs
            .filter(pack => pack.metadata?.packageType === "system" && pack.metadata?.packageName === "gum")
            .filter(pack => !idsSistema.has(pack.collection));

        await movePacksToFolder(packsSistemaCondicoesEfeitos, pastaCondicoesEfeitos);
        await movePacksToFolder(packsSistemaModificadores, pastaModificadores);
        await movePacksToFolder(packsCenario, pastaCenario);
    }

    $('body').on('click', '.apply-damage-button', (ev) => {
    ev.preventDefault();
    console.log("GUM | DEBUG: Botão 'Aplicar Dano' clicado.");

    const button = ev.currentTarget;

    // 1. Pega o token alvo selecionado
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 1) {
        console.error("GUM | DEBUG: Falha na Etapa 1. Nenhum token ou múltiplos tokens selecionados.");
        return ui.notifications.warn("Por favor, selecione exatamente um token como alvo.");
    }
    const targetActor = controlled[0].actor;
    console.log(`GUM | DEBUG: Etapa 1 OK. Alvo: ${targetActor.name}`);

    // 2. Lê o pacote de dados
    const damagePackageJSON = button.dataset.damage;
    if (!damagePackageJSON) {
        console.error("GUM | DEBUG: Falha na Etapa 2. Pacote de dados de dano não encontrado no botão.");
        return ui.notifications.error("Erro crítico: Pacote de dados de dano ausente.");
    }
    const damagePackage = JSON.parse(damagePackageJSON);
    console.log("GUM | DEBUG: Etapa 2 OK. Pacote de dados lido:", damagePackage);

    // 3. Encontra o ator atacante pela ID
    const attackerActor = game.actors.get(damagePackage.attackerId);
    if (!attackerActor) {
        console.error(`GUM | DEBUG: Falha na Etapa 3. Ator atacante com ID "${damagePackage.attackerId}" não encontrado.`);
        return ui.notifications.error("Erro: Ator atacante não encontrado. A mensagem de chat pode ser antiga.");
    }
    console.log(`GUM | DEBUG: Etapa 3 OK. Atacante: ${attackerActor.name}`);

    // 4. Cria e renderiza nossa nova janela
    console.log("GUM | DEBUG: Etapa 4. Tudo pronto para abrir a janela.");
    new DamageApplicationWindow(damagePackage, attackerActor, targetActor).render(true);
});
    

 const normalizeTestKey = (value) => value?.toString?.().trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const resolveActorTestValue = (actor, rawKey) => {
    if (!actor) return null;
    const key = rawKey?.toString?.().trim();
    if (!key) return null;

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey) && key !== "") return numericKey;

    const attributeCandidates = [key, key.toLowerCase(), key.toUpperCase()];
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
    const attributeKey = key.toLowerCase();
    const standardAttributes = new Set(["st", "dx", "iq", "ht", "will", "per"]);
    if (standardAttributes.has(attributeKey)) {
        return attributeKey.toUpperCase();
    }
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
                onRoll: async (_actor, promptPayload) => {
                    await performGURPSRoll(actor, {
                        label: rollLabel,
                        value: rollValue,
                        modifier: promptPayload.modifier || 0
                    });
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

$('body').on('click', '.chat-message .chat-show-details', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const button = ev.currentTarget;
        const messageEl = button.closest('.message');
        const cardEl = button.closest('.gurps-item-preview-card');
        if (!messageEl || !cardEl) return;

        const messageId = messageEl.dataset.messageId;
        const message = messageId ? game.messages.get(messageId) : null;
        if (!message) return;

        const title = cardEl.querySelector('.header-text h3')?.textContent?.trim() || 'Detalhes do Item';
        const type = cardEl.querySelector('.preview-item-type')?.textContent?.trim() || '';
        const icon = cardEl.querySelector('.header-icon')?.getAttribute('src') || 'icons/svg/item-bag.svg';
        const descriptionHTML = cardEl.querySelector('.chat-description-payload')?.innerHTML?.trim() || '<i>Sem descrição.</i>';

        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card chat-details-dialog">
                    <header class="preview-header">
                        <img src="${icon}" class="header-icon"/>
                        <div class="header-text">
                            <h3>${title}</h3>
                            <span class="preview-item-type">${type}</span>
                        </div>
                    </header>
                    <div class="preview-content">
                        <div class="preview-description">${descriptionHTML}</div>
                    </div>
                </div>
            </div>
        `;

        new Dialog({
            title: `Detalhes: ${title}`,
            content,
            buttons: {},
            default: "",
            options: {
                classes: ["dialog", "gurps-item-preview-dialog"],
                width: 520,
                height: "auto",
                resizable: true
            }
        }).render(true);
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


$('body').on('click', '.resistance-roll-button', async ev => {
    ev.preventDefault();
    const button = ev.currentTarget;

    // Acessa o pacote de dados completo
    const rollData = JSON.parse(button.dataset.rollData);
    
    // ✅ CORREÇÃO AQUI: Lemos o 'effectItemData' completo que salvamos antes.
    const { effectItemData, sourceName, effectLinkId } = rollData;
    const mode = rollData.mode || "activation";
    const rollConfig = effectItemData?.system?.resistanceRoll || {};
    if (!effectItemData) {
        ui.notifications.warn("Dados do efeito não encontrados para o teste de resistência.");
        button.disabled = false;
        return;
    }

    const resolveActorForRoll = () => {
        const messageId = $(button).closest('.message').data('messageId');
        const message = messageId ? game.messages.get(messageId) : null;
        const speakerActor = message ? ChatMessage.getSpeakerActor(message.speaker) : null;
        if (speakerActor) return speakerActor;

        const controlled = canvas.tokens?.controlled || [];
        if (controlled.length > 0) return controlled[0].actor;

        if (game.user.character) return game.user.character;

 if (rollData.targetActorId) return game.actors.get(rollData.targetActorId);
        return null;
    };

    const buildFallbackToken = (fallbackActor) => ({
        actor: fallbackActor,
        id: null,
        name: fallbackActor?.name || "Alvo",
        document: { texture: { src: fallbackActor?.img || "icons/svg/mystery-man.svg" } }
    });

   const computeTargetValue = (actor, extraModifier = 0, { includesEffectModifier = false } = {}) => {
        if (!actor) return { finalTarget: rollData.finalTarget || 10, base: 10 };
        const attributeKey = rollConfig.attribute || "ht";
        const resolvedBaseValue = resolveRollBaseValue(actor, attributeKey);
        const baseAttributeValue = (resolvedBaseValue !== null && resolvedBaseValue !== undefined)
            ? resolvedBaseValue
            : 10;

        const effectModifier = evaluateNumericFormula(rollConfig.modifier, { actor, eventData: rollData }) || 0;
        const totalModifier = includesEffectModifier ? extraModifier : effectModifier + extraModifier;
        return {
            finalTarget: baseAttributeValue + totalModifier,
            base: baseAttributeValue,
            modifier: totalModifier,
            effectModifier,
            extraModifier,
            attributeLabel: attributeKey.toString().toUpperCase()
        };
    };

    const resistingActor = resolveActorForRoll();
    if (!resistingActor) {
        ui.notifications.warn("Nenhum ator encontrado para rolar a resistência.");
        return;
    }

    const performResistanceRoll = async (extraModifier = 0, options = {}) => {
        button.disabled = true;
        const targetCalc = computeTargetValue(resistingActor, extraModifier, options);
        const finalTarget = targetCalc.finalTarget;

        const roll = new Roll("3d6");
        await roll.evaluate();

        const margin = finalTarget - roll.total;
        const success = roll.total <= finalTarget;
        const achievedMargin = Math.abs(margin);
        const minMargin = parseInt(rollConfig.margin) || 0;
        const marginOk = achievedMargin >= minMargin;
        const applyOnSuccess = rollConfig.applyOn === 'success';
        const shouldApply = marginOk && ((applyOnSuccess && success) || (!applyOnSuccess && !success));

        let resultText = success ? `Sucesso com margem de ${margin}` : `Fracasso por uma margem de ${-margin}`;
        let resultLabel = success ? "Sucesso" : "Falha";
        let resultClass = success ? 'success' : 'failure';

        if (roll.total <= 4 || (roll.total <= 6 && margin >= 10)) {
            resultText = `Sucesso Crítico!`;
            resultLabel = "Sucesso Crítico";
            resultClass = 'crit-success';
        } else if (roll.total >= 17 || (roll.total === 16 && margin <= -10)) {
            resultText = `Falha Crítica!`;
            resultLabel = "Falha Crítica";
            resultClass = 'crit-failure';
        }

        // Comunica o resultado de volta para a janela de dano
        if (game.gum.activeDamageApplication) {
            // ✅ CORREÇÃO AQUI: Passamos apenas o 'system' do efeito, que é o que a função espera.
            game.gum.activeDamageApplication.updateEffectCard(effectLinkId, {
                isSuccess: success,
                resultText: resultText,
                shouldApply: shouldApply
            }, effectItemData.system); // Passamos os dados do sistema como terceiro argumento
        }

        // Aplica o efeito no alvo
        if (shouldApply && mode !== "damage") {
            const effectItem = rollData.effectItemUuid
                ? await fromUuid(rollData.effectItemUuid).catch(() => null)
                : await Item.fromSource(effectItemData);
            if (effectItem) {
     const resolveTargets = () => {
                    const targets = [];
                    if (rollData.targetTokenId) {
                        const token = canvas.tokens?.get(rollData.targetTokenId);
                        if (token) targets.push(token);
                    }
                    if (targets.length === 0 && resistingActor) {
                        const activeTokens = resistingActor.getActiveTokens();
                        if (activeTokens.length > 0) {
                            targets.push(...activeTokens);
                        } else {
                            targets.push(buildFallbackToken(resistingActor));
                        }
                    }
                    if (targets.length === 0 && rollData.targetActorId) {
                        const actor = game.actors.get(rollData.targetActorId);
                        if (actor) {
                            const activeTokens = actor.getActiveTokens();
                            if (activeTokens.length > 0) {
                                targets.push(...activeTokens);
                            } else {
                                targets.push(buildFallbackToken(actor));
                            }
                        }
                    }
                    return targets;
                };


                const targets = resolveTargets();
                if (targets.length > 0) {
                    const originItem = rollData.originItemUuid ? await fromUuid(rollData.originItemUuid).catch(() => null) : null;
                    const originActor = rollData.sourceActorId ? game.actors.get(rollData.sourceActorId) : null;

                    ui.notifications.info(`${resistingActor.name} foi afetado por: ${effectItem.name}!`);
                  const conditionContext = mode === "condition" && rollData.conditionId
                        ? { conditionId: rollData.conditionId }
                        : {};
                    await applySingleEffect(effectItem, targets, {
                        actor: originActor,
                        origin: originItem || effectItem,
                        ...conditionContext
                    });
                } else {
                    ui.notifications.warn("Não foi possível encontrar um alvo para aplicar o efeito.");
                }
            }
        }

        // Monta o card de resultado no chat usando o mesmo layout da rolagem base
        const diceFaces = roll.dice[0].results.map(r => `<span class="die-face">${r.result}</span>`).join('');
        const modifierText = targetCalc.modifier !== 0 ? `${targetCalc.modifier > 0 ? '+' : ''}${targetCalc.modifier}` : '±0';
        const modBreakdownParts = [];
        if (targetCalc.effectModifier) {
            modBreakdownParts.push(`Ef ${targetCalc.effectModifier > 0 ? '+' : ''}${targetCalc.effectModifier}`);
        }
        if (targetCalc.extraModifier) {
            modBreakdownParts.push(`Mod ${targetCalc.extraModifier > 0 ? '+' : ''}${targetCalc.extraModifier}`);
        }
        const modBreakdown = modBreakdownParts.length > 0 ? modBreakdownParts.join(' | ') : 'Sem modificadores';
        const marginValue = Math.abs(margin);

        const flavor = `
            <div class="gurps-roll-card premium roll-result">
                <header class="card-header">
                    <h3>Teste de Resistência</h3>
                    <small>${resistingActor?.name || 'Alvo'}</small>
                </header>

                <div class="card-formula-container">
                    <span class="formula-pill">${targetCalc.attributeLabel} ${targetCalc.base}</span>
                    <span class="formula-pill">${modifierText} (${modBreakdown})</span>
                </div>

                <div class="card-content">
                    <div class="card-main-flex">
                        <div class="roll-column">
                            <span class="column-label">Dados</span>
                            <div class="roll-total">${roll.total}</div>
                            <div class="individual-dice">${diceFaces}</div>
                        </div>

                        <div class="column-separator"></div>

                        <div class="target-column">
                            <span class="column-label">Alvo</span>
                            <div class="target-value">${finalTarget}</div>
                            <div class="target-note">Final</div>
                        </div>
                    </div>
                </div>

                <footer class="card-footer">
                    <div class="result-block ${resultClass}">
                        <span class="result-label">${resultLabel}</span>
                        <span class="result-margin">Margem ${marginValue}</span>
                    </div>
                </footer>
            </div>
        `;

        // Publica o resultado em uma nova mensagem para evitar conflitos com hooks
        // de renderizacao que dependem do HTML original da solicitacao de resistencia.
        const resultChatData = applyCurrentRollPrivacy({
            speaker: ChatMessage.getSpeaker({ actor: resistingActor }),
            content: flavor,
            rolls: [roll]
        });
        await ChatMessage.create(resultChatData);
    };

    if (ev.shiftKey) {
        await performResistanceRoll();
        return;
    }

    const promptTarget = computeTargetValue(resistingActor, 0);
    const promptData = {
        label: "Teste de Resistência",
        type: "attribute",
        attribute: rollConfig.attribute || "ht",
        value: promptTarget.base,
        modifier: 0,
        fixedModifier: promptTarget.effectModifier,
        fixedModifierLabel: "Barreira",
        img: effectItemData?.img || resistingActor.img
    };

    new GurpsRollPrompt(resistingActor, promptData, {
        onRoll: async (_actor, promptPayload) => {
            await performResistanceRoll(promptPayload.modifier || 0, { includesEffectModifier: true });
        }
    }).render(true);
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

const normalizeLookupKey = (value) => value
    ?.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const resolveRollBaseValue = (actor, rollAttribute) => {
    if (!actor || !rollAttribute) return null;
    const normalizedKey = normalizeLookupKey(rollAttribute);
    if (!normalizedKey) return null;

    const attributes = actor.system?.attributes || {};
    const attrKey = Object.keys(attributes).find((key) => normalizeLookupKey(key) === normalizedKey);
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
const processingStatusBindingActors = new Set();
const STATUS_BINDINGS_CACHE_TTL_MS = 15_000;
const statusBindingsCache = {
    packId: null,
    docs: [],
    loadedAt: 0
};

const getConfiguredStatusBindingsPack = () => {
    const configuredId = (game.settings.get("gum", "statusBindingsCompendium") || "").trim();
    if (configuredId && game.packs.has(configuredId)) return game.packs.get(configuredId);
    if (game.packs.has("gum.conditions")) return game.packs.get("gum.conditions");
    return null;
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
    const pack = getConfiguredStatusBindingsPack();
    if (!pack) return [];
    if (statusBindingsCache.packId === pack.collection
        && (now - statusBindingsCache.loadedAt) < STATUS_BINDINGS_CACHE_TTL_MS) {
        return statusBindingsCache.docs;
    }

    const docs = await pack.getDocuments();
    const statusRules = docs.filter((doc) => doc?.type === "condition"
        && doc.system?.bindingMode === "status-link");
    statusBindingsCache.packId = pack.collection;
    statusBindingsCache.docs = statusRules;
    statusBindingsCache.loadedAt = now;
    return statusRules;
};

async function processStatusBindings(actor) {
    if (!actor || processingStatusBindingActors.has(actor.id)) return;
    processingStatusBindingActors.add(actor.id);
    try {
        const activeStatuses = getActorActiveNativeStatusSet(actor);
        const statusRules = await loadStatusBindingRules();
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

            const existingRuleEffects = actor.effects.filter((effect) =>
                foundry.utils.getProperty(effect, "flags.gum.source") === "statusBinding"
                && foundry.utils.getProperty(effect, "flags.gum.statusBindingRuleUuid") === rule.uuid
                && foundry.utils.getProperty(effect, "flags.gum.statusBindingStatusId") === statusId
            );

            if (!shouldBeActive) {
                if (removeOnStatusOff && existingRuleEffects.length) {
                    effectsToDelete.push(...existingRuleEffects.map((effect) => effect.id));
                }
                continue;
            }

            for (const link of effectLinks) {
                const effectUuid = link?.uuid;
                if (!effectUuid) continue;
                const siblings = existingRuleEffects
                    .filter((effect) => foundry.utils.getProperty(effect, "flags.gum.effectUuid") === effectUuid)
                    .sort((a, b) => a.id.localeCompare(b.id));

                if (stackMode === "replace" && siblings.length) {
                    effectsToDelete.push(...siblings.map((effect) => effect.id));
                } else if (stackMode === "refresh" && siblings.length) {
                    const updates = siblings.map((effect) => ({
                        _id: effect.id,
                        duration: foundry.utils.duplicate(effect.duration || {})
                    }));
                    await actor.updateEmbeddedDocuments("ActiveEffect", updates);
                    continue;
                } else if (stackMode === "stack" && siblings.length >= stackLimit) {
                    continue;
                }

                const effectItem = await fromUuid(effectUuid).catch(() => null);
                if (!effectItem?.system) continue;
                const targets = actor.getActiveTokens();
                const finalTargets = targets.length ? targets : [buildFallbackTokenForActor(actor)];
                await applySingleEffect(effectItem, finalTargets, {
                    actor,
                    origin: rule,
                    source: "statusBinding",
                    statusBindingRuleUuid: rule.uuid,
                    statusBindingStatusId: statusId
                });
            }
        }

        const uniqueIds = [...new Set(effectsToDelete)];
        if (uniqueIds.length) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", uniqueIds);
        }
    } finally {
        processingStatusBindingActors.delete(actor.id);
    }
}

async function processConditions(actor, eventData = null) {
    // FOCO ÚNICO: Avaliar ITENS de Condição e executar ações únicas (macro, chat, flag)
    // baseadas na MUDANÇA DE ESTADO desses ITENS.
    // **NÃO GERENCIA MAIS ÍCONES DE STATUS.**
    
    if (!actor || evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);

 try {
        const conditions = actor.items.filter(i => i.type === "condition");
        const buildFallbackToken = (fallbackActor) => ({
            actor: fallbackActor,
            id: null,
            name: fallbackActor?.name || "Alvo",
            document: { texture: { src: fallbackActor?.img || "icons/svg/mystery-man.svg" } }
        });
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
            // Condições que dependem de "eventData" devem ser tratadas como gatilhos pulsados:
            // ativam no evento e não entram em ciclo ligar/desligar persistente.
            return /(^|[^.\w])eventData([.\[]|$)/.test(when);
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
             const isPulseEvent = Boolean(eventData?.pulse);
             const isTurnStartEvent = eventData?.reason === "turnStart";
             const shouldRepeatOnTurnStart = condition.system?.triggerOnTurnStartWhileActive === true;
             const isCurrentCombatantTurn = Boolean(
                game.combat?.started
                && game.combat?.combatant?.actorId === actor.id
             );
             // Condições dirigidas por evento (ex.: dano > metade do PV via eventData)
             // não devem alternar estado persistente entre avaliações fora do evento.
             const stateChanged = isEventDriven
                 ? false
                 : isEffectivelyActiveNow !== wasActive;
             const shouldExecuteActivation = (stateChanged && isEffectivelyActiveNow)
                || (isPulseEvent && isEffectivelyActiveNow)
                || (isTurnStartEvent && shouldRepeatOnTurnStart && isCurrentCombatantTurn && isEffectivelyActiveNow);

             if (stateChanged) {
                 // Salva o novo estado
                 await condition.setFlag("gum", "wasActive", isEffectivelyActiveNow);
             }

             const effectLinks = condition.system.effects || []; // Pega os links de efeito dentro da condição

             if (shouldExecuteActivation) { // Condição acabou de LIGAR OU gatilho pulsado
                     for (const link of effectLinks) {
                        if(!link.uuid) continue; // Pula se não for um link válido
                        const effectItem = await fromUuid(link.uuid); // Carrega o Item Efeito original
                        if (!effectItem?.system) continue;
                        const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
                        if (requiresResistance) {
                            const activeTokens = actor.getActiveTokens();
                            const resistanceTargets = activeTokens.length ? activeTokens : [buildFallbackToken(actor)];
                            for (const targetToken of resistanceTargets) {
                                await _promptActivationResistance(
                                    effectItem,
                                    targetToken,
                                    actor,
                                    condition,
                                    link.id || null,
                                    { mode: "condition", conditionId: condition.id }
                                );
                            }
                            continue;
                        }

                        const actions = getEffectActions(effectItem.system || {});
                        const hasPersistentActions = actions.some((action) => ["attribute", "roll_modifier", "status", "flag"].includes(action.type));
                        const existingConditionEffect = actor.effects.find((effect) =>
                            effect?.flags?.gum?.conditionId === condition.id
                            && effect?.flags?.gum?.effectUuid === effectItem.uuid
                        );
                        const skipPersistentEffects = Boolean(existingConditionEffect && !isPulseEvent);

                        if (!hasPersistentActions || !skipPersistentEffects || isPulseEvent) {
                            const activeTokens = actor.getActiveTokens();
                            const targetsForApply = activeTokens.length ? activeTokens : [buildFallbackToken(actor)];
                            await applySingleEffect(effectItem, targetsForApply, {
                                actor,
                                origin: condition,
                                source: "condition",
                                conditionId: condition.id,
                                skipPersistentEffects
                            });
                        }
                     }
                 }

                 if (!isEventDriven && stateChanged && !isEffectivelyActiveNow) { // Condição acabou de DESLIGAR
                     for (const link of effectLinks) {
                        if(!link.uuid) continue;
                        const effectItem = await fromUuid(link.uuid);
                        if (!effectItem?.system) continue;

                        const actions = getEffectActions(effectItem.system || {});
                        for (const action of actions) {
                            if (action.type === "flag" && action.key) {
                                await actor.unsetFlag("gum", action.key);
                            }
                        }
                        if (actions.some((action) => ["attribute", "roll_modifier", "status", "flag"].includes(action.type))) {
                            const effectsToRemove = actor.effects.filter((effect) => {
                                const sameConditionSource = effect?.flags?.gum?.conditionId === condition.id
                                    && effect?.flags?.gum?.effectUuid === effectItem.uuid;
                                if (!sameConditionSource) return false;

                                const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};
                                const finiteGumDuration = !isEffectDurationPermanent(gumDuration)
                                    && (
                                        (Number.isFinite(Number(gumDuration.value)) && Number(gumDuration.value) > 0)
                                        || effect.duration?.rounds
                                        || effect.duration?.turns
                                        || effect.duration?.seconds
                                    );

                                // Efeitos temporários devem expirar pela própria duração, não
                                // por desligamento da condição (evita remoção precoce em fluxos
                                // acionados por evento, ex.: dano + resistência).
                                if (finiteGumDuration) return false;
                                return true;
                            });
                            if (effectsToRemove.length) {
                                await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove.map(effect => effect.id));
                            }
                        }
                        // Outras ações de "desligar" poderiam ir aqui no futuro
                     }
                 }
        } // Fim do loop de Conditions

        // Nenhuma lógica de sincronização de ícones ('toggleStatusEffect') aqui.

    } finally {
        evaluatingActors.delete(actor.id); // Libera o ator para a próxima avaliação
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
        onClick: () => {
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

    // 5. INJEÇÃO SEGURA NA LISTA DE FERRAMENTAS
    const toolsCollection = targetLayer.tools;

    if (Array.isArray(toolsCollection)) {
        // V12: É um Array
        toolsCollection.push(gmScreenTool);
    } 
    else if (toolsCollection instanceof Map) {
        // V13 (Possível): É um Map
        toolsCollection.set("gm-screen", gmScreenTool);
    } 
    else if (typeof toolsCollection === 'object') {
        // V13 (Provável): É um Objeto
        // Verifica se já existe para evitar loop
        if (!toolsCollection["gm-screen"]) {
            toolsCollection["gm-screen"] = gmScreenTool;
        }
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
Hooks.on("updateActor", (actor) => {
    // Renderiza se for PJ ou se houver um combate rolando (para monstros)
    if (actor.hasPlayerOwner || game.combat) {
        refreshGMScreen();
    }
});

// 4. MUDANÇAS NOS TOKENS (Para garantir sincronia visual imediata)
Hooks.on("updateToken", (tokenDocument) => {
    if (game.combat) refreshGMScreen();
});

// 5. MUDANÇAS DIRETAS EM EFEITOS ATIVOS (remoção)
// Mantemos somente a remoção aqui para evitar renders intermediários durante
// aplicações em lote (ex.: 2+ efeitos no mesmo clique no Escudo do Mestre).
const rebalanceEffectCarrier = async (actor, effectUuid) => {
    if (!actor || !effectUuid) return;
    try {
        const siblings = actor.effects
            .filter((candidate) =>
                foundry.utils.getProperty(candidate, "flags.gum.effectUuid") === effectUuid
                && !candidate.disabled
            )
            .sort((a, b) => {
                const ai = Number(foundry.utils.getProperty(a, "flags.gum.actionIndex") ?? 9999);
                const bi = Number(foundry.utils.getProperty(b, "flags.gum.actionIndex") ?? 9999);
                return ai - bi;
            });

        if (siblings.length === 0) return;

        const effectItem = await fromUuid(effectUuid).catch(() => null);
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
                && effectItem?.img
                && shouldShowTokenIconForSystem(effectItem.system || {}, carrierDuration);

            if (shouldDisplayCarrier) {
                const carrierStatusId = `${effectItem.name.slugify({ strict: true })}-carrier`;
                nextStatuses.push(carrierStatusId);
                updateData.img = effectItem.img;
                updateData["flags.core.statusId"] = nativeStatuses[0] || carrierStatusId;
            } else {
                updateData.img = nativeStatuses[0]
                    ? ((CONFIG.statusEffects || []).find(status => status.id === nativeStatuses[0])?.icon
                        || (CONFIG.statusEffects || []).find(status => status.id === nativeStatuses[0])?.img
                        || null)
                    : null;
                if (nativeStatuses[0]) updateData["flags.core.statusId"] = nativeStatuses[0];
                else updateData["flags.core.-=statusId"] = null;
            }

            updateData.statuses = [...new Set(nextStatuses)];
            updates.push(updateData);
        }

        if (updates.length) {
            await actor.updateEmbeddedDocuments("ActiveEffect", updates);
            actor.getActiveTokens().forEach((token) => token.drawEffects());
        }
    } catch (error) {
        console.warn("GUM | Não foi possível reequilibrar ícone carrier após remover ActiveEffect.", error);
    }
};

const refreshFromDeletedActiveEffect = async (effect) => {
    const actor = effect?.parent;
    if (!actor) return;
    const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
    if (effectUuid) await rebalanceEffectCarrier(actor, effectUuid);
    await processStatusBindings(actor);

    if (actor.hasPlayerOwner || game.combat) {
        refreshGMScreen();
    }
};

Hooks.on("deleteActiveEffect", refreshFromDeletedActiveEffect);
Hooks.on("updateActiveEffect", async (effect, changes) => {
    const actor = effect?.parent;
    if (!actor) return;
    const disabledChanged = Object.prototype.hasOwnProperty.call(changes || {}, "disabled");
    const statusesChanged = Object.prototype.hasOwnProperty.call(changes || {}, "statuses")
        || Object.prototype.hasOwnProperty.call(changes?.flags?.core || {}, "statusId");
    if (!disabledChanged && !statusesChanged) return;

    const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
    if (effectUuid) await rebalanceEffectCarrier(actor, effectUuid);
    await processStatusBindings(actor);
});


Hooks.on("deleteActiveEffect", refreshFromDeletedActiveEffect);
Hooks.on("createActiveEffect", async (effect) => {
    const actor = effect?.parent;
    if (!actor) return;
    await processStatusBindings(actor);
});

// 6. MUDANÇAS NA CENA (Adicionar/Remover tokens)
Hooks.on("canvasReady", refreshGMScreen); // Quando muda de mapa