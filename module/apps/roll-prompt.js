import { GumPreviewDialog } from "./preview-dialog.js";
import { PurposeQuickView } from "./purpose-quick-view.mjs";
import { performGURPSRoll } from "../../scripts/main.js";
import { getGroupedRollPurposes, getPurposeLabels, matchesRollTags, normalizePurposeIds, normalizePurposeSearch, resolveRollMetadata, searchRollPurposes, shouldIncludeInPermanentNh } from "../utils/roll-purposes.mjs";
import { getContextualPurposeIds, getInitialContextualFilterState, getRelatedPurposeIds, isPurposeRelatedToEntry } from "../utils/contextual-roll-purposes.mjs";
import { normalizeRollTags } from "../utils/roll-tags.mjs";
import { resolveRollPromptImage } from "../utils/roll-prompt-image.mjs";
import { measureGridDistance } from "../utils/grid-distance.mjs";
import { AUTO_SIZE_MODIFIER_MODES, calculateAttackSizeModifier } from "../utils/size-modifier.mjs";
import { contentSourceService } from "../services/content-source-service.mjs";
import { evaluateJavaScriptNumericExpression, resolveConditionalValue } from "../utils/effect-value-expression.mjs";
import { evaluateModifierRollFormulaSync } from "../utils/modifier-roll-formula.mjs";
import { getSkillDisplayName } from "../utils/skill-display-name.mjs";
import { matchesEquipmentGrantedEffectScope } from "../utils/equipment-granted-effects.mjs";
import { availableAmmunition, ammunitionRollModifier } from "../utils/ammunition.mjs";
import { normalizeRequestedAttributeKey } from "../utils/requested-attributes.mjs";
import { DISTANCE_MODIFIER_ENABLED_SETTING, DISTANCE_MODIFIER_TABLE_SETTING, getDistanceModifier } from "../utils/distance-modifier.mjs";
import { collectActiveEquipmentOwnerModifiers } from "../utils/equipment-owner-modifiers.mjs";
import { matchesAbilityClassificationFilters, matchesAbilityRollContext, resolveAbilityRollContext } from "../utils/ability-roll-context.mjs";
import { composeRollModifiers, getRollModifierCompositionOrigin } from "../utils/roll-modifier-composition.mjs";
import { getCurrentRollPrivacyMode, normalizeRollPrivacyMode, rollPrivacyOptions } from "../utils/roll-privacy.mjs";

const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

export class GurpsRollPrompt extends FormApplication {
    static COLLAPSED_WIDTH = 380;
    static EXPANDED_WIDTH = 980;
    
 constructor(actor, rollData, options = {}) {
        super(options);
        this.actor = actor;
        this.rollData = rollData;
        const attack = actor?.items?.get(rollData.itemId)?.system?.ranged_attacks?.[rollData.attackId];
        this.ammunitionOptions = rollData.type === "attack" && attack?.ammunition_ids?.length ? availableAmmunition(actor, attack) : [];
        this.selectedAmmunitionId = "";
        this.selectedModifiers = [];
        this.onRoll = options.onRoll;
        this.rollMode = normalizeRollPrivacyMode(options.rollMode || getCurrentRollPrivacyMode());
        this.baseAttributeOptions = [];
        this.baseAttributeOptionsMap = new Map();
        this.baseDefaultKey = "skill";
        this.baseDefaultLabel = "Perícia";
        this.currentBaseKey = "skill";
        this.currentBaseLabel = "Perícia";
        this.originalBaseValue = parseInt(this.rollData.value) || 10;
        this.currentBaseValue = this.originalBaseValue;
        // Keep the roll's original base separate from the base selected in the
        // prompt. Re-rendering the prompt must not recalculate the relative
        // skill level from an attribute the user has just selected.
        this.originalBaseAttributeKey = this._resolveOriginalBaseAttributeKey();
        this.baseDelta = 0;
        this.baseModifierParts = [];
        this.baseAttributeSourceLabel = "Perícia";
        this.isMenuCollapsed = true;
        this.defenseMode = "normal";
        this.defenseTiming = "before";
        this.requestedPurposeIds = normalizePurposeIds(rollData.requestedPurposeIds);
        this.purposeIds = normalizePurposeIds([...normalizePurposeIds(rollData.purposeIds), ...this.requestedPurposeIds]);
        this.relatedPurposeIds = [];
        this.contextualPurposeFilterActive = true;
        this.purposeSearchQuery = "";
        // As finalidades começam recolhidas para manter o menu compacto.
        this.collapsedPurposeGroups = new Set(["survival", "resistances", "mental", "movement", "environment", "senses", "sources", "vectors", "social", "circumstances"]);

        this.context = this._determineContext();
        this._refreshRelatedPurposeIds();
        this.counterEffectsNotice = null;


        // 1. Carrega modificadores globais (Escudo)
        this._loadGMModifiers();
        this._loadEffectModifiers();
        this._loadEquipmentOwnerModifiers();
        this._loadTargetCounterModifiers();
        this._composeSemanticModifiers();
        this._loadAutoDistanceModifier();
        this._loadAutoSizeModifier();
        
        console.log("GUM | Roll Prompt Iniciado");
        console.log(" -> Dados recebidos:", rollData);
        console.log(" -> Item ID:", rollData.itemId);
        console.log(" -> Contexto Calculado:", this.context);
    }

     _collectActorPurposeModifierEntries() {
        const result = [];
        const accept = (entry, fallback = {}) => {
            if (!entry || !normalizeRollTags(entry.roll_tags ?? entry.rollTags).length) return;
            if (!this._matchesEffectContext(entry.contexts ?? entry.context ?? "all", this.context)) return;
            if (!this._matchesTargetFilter(entry)) return;
            if (this._resolveModifierApplicationSide(entry, fallback) !== "self") return;
            if (shouldIncludeInPermanentNh(entry)) return;
            result.push(entry);
        };
        for (const effect of Array.from(this.actor?.appliedEffects ?? this.actor?.effects ?? [])) {
            if (effect?.disabled || effect?.suppressed || effect?.isSuppressed) continue;
            if (!this._matchesEquipmentEffectScope(effect)) continue;
            const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
            if (!data) continue;
            const entries = Array.isArray(data.entries) && data.entries.length ? data.entries : [data];
            entries.forEach(entry => accept(entry, data));
        }
        const gmModifiers = this.actor?.getFlag?.("gum", "gm_modifiers") || [];
        gmModifiers.forEach(entry => accept(entry));
        for (const item of Array.from(this.actor?.items ?? []).filter(item => item?.type === "gm_modifier")) {
            const entries = Array.isArray(item.system?.modifier_entries) && item.system.modifier_entries.length
                ? item.system.modifier_entries : [item.system];
            entries.forEach(entry => {
                if (!item.system?.modifier_entries?.length && !this._isValidForContext(item, this.context)) return;
                accept(entry);
            });
        }
        return result;
    }

    _isPurposeRelatedToEntry(purpose, entry) { return isPurposeRelatedToEntry(purpose, entry); }
    _getRelatedPurposeIds() { return getRelatedPurposeIds(this._collectActorPurposeModifierEntries()); }
    _getContextualPurposeIds() {
        return getContextualPurposeIds({ relatedPurposeIds: this.relatedPurposeIds, requestedPurposeIds: this.requestedPurposeIds, selectedPurposeIds: this.purposeIds });
    }
    _refreshRelatedPurposeIds() {
        this.relatedPurposeIds = this._getRelatedPurposeIds();
        if (!getInitialContextualFilterState(this._getContextualPurposeIds())) this.contextualPurposeFilterActive = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configurar Rolagem",
            id: "gurps-roll-prompt",
            template: "systems/gum/templates/apps/roll-prompt.hbs",
            width: GurpsRollPrompt.EXPANDED_WIDTH,
            height: "auto",
            classes: ["gum", "roll-prompt", "theme-dark"],
            closeOnSubmit: true,
            scrollY: [".prompt-menu-column", ".active-mods-container"]
        });
    }

    /**
     * Lê as flags do ator e adiciona aos modificadores selecionados (CORRIGIDO)
     */
    _loadGMModifiers() {
        const gmMods = this.actor.getFlag("gum", "gm_modifiers") || [];
        
        gmMods.forEach(mod => {
            const context = mod?.contexts ?? mod?.context ?? "all";
            if (!this._matchesEffectContext(context, this.context)) return;
            if (!matchesRollTags(mod, this._getRollMetadata().rollTags)) return;

            this.selectedModifiers.push({
                id: mod.id || foundry.utils.randomID(),
                label: mod.name,
                value: this._evaluateModifierValue(mod.value),
                // ✅ CORREÇÃO: Lê o cap da flag, se existir
                nh_cap: (mod.cap !== undefined && mod.cap !== "") ? parseInt(mod.cap) : null,
                isGM: true // Marca para estilizar diferente se quiser (ex: cadeado)
            });
});
    }

    _loadEffectModifiers() {
        const activeEffects = Array.from(this.actor.appliedEffects ?? this.actor.effects ?? []);

        activeEffects.forEach(effect => {
            if (!this._matchesEquipmentEffectScope(effect)) return;
            const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
            if (!data) return;

        const entries = Array.isArray(data.entries) && data.entries.length
                ? data.entries
                : [{
                    value: data.value,
                    cap: data.cap,
                    context: data.context,
                    nh_display_mode: data.nh_display_mode,
                    roll_tags: data.roll_tags,
                    roll_tag_match: data.roll_tag_match,
                    target_values: data.target_values,
                    source_item_ids: data.source_item_ids,
                    application_side: data.applicationSide
                }];

            entries.forEach((entry, index) => {
                const context = entry?.contexts ?? entry?.context ?? "all";
                const sourceItem = this._getRollSourceItem();
                if (entry?.skill_roll_only === true && sourceItem?.type !== "skill") return;
                if (entry?.ability_roll_only === true && !["skill", "spell", "power"].includes(sourceItem?.type)) return;
                if (!this._matchesEffectContext(context, this.context)) return;
                if (!matchesRollTags(entry, this._getRollMetadata().rollTags)) return;
                if (!this._matchesTargetFilter(entry)) return;
                if (shouldIncludeInPermanentNh(entry)) return;
                const applicationSide = this._resolveModifierApplicationSide(entry, data);
                if (applicationSide !== "self") return;

                this.selectedModifiers.push({
                    id: `${effect.id}::${index}`,
                    label: entry?.label?.toString().trim() || effect.name?.toString().trim() || "",
                    sourceLabel: entry?.label?.toString().trim()
                        ? effect.name?.toString().trim() || ""
                        : "",
                    value: this._evaluateModifierEntryValue(entry),
                    nh_cap: (entry?.cap !== undefined && entry?.cap !== "") ? parseInt(entry.cap) : null,
                    isGM: true,
                    isEffect: true,
                    compositionGroup: entry?.composition_group || "",
                    compositionMode: entry?.composition_mode || "sum",
                    compositionPriority: Number(entry?.composition_priority) || 0,
                    compositionOrigin: getRollModifierCompositionOrigin(effect)
                });
            });
        });
    }

    _loadEquipmentOwnerModifiers() {
        const records = collectActiveEquipmentOwnerModifiers(this.actor?.items);
        const reactionRoll = this.rollData?.type === "reaction" || this.context === "reaction";
        for (const record of records) {
            if (record.kind !== "conditional" && !(record.kind === "reaction" && reactionRoll)) continue;
            const value = Number(record.value) || 0;
            if (!value) continue;
            this.selectedModifiers.push({
                id: `equipment-owner-${record.sourceItemId}-${record.id}`,
                label: [record.label, record.situation].filter(Boolean).join(" — ") || record.sourceItemName,
                value,
                isEquipment: true
            });
        }
    }

    _resolveModifierApplicationSide(entry = {}, fallback = {}) {
        const side = entry?.application_side ?? entry?.applicationSide ?? fallback?.applicationSide ?? "self";
        return `${side}`.trim() || "self";
    }

    _isCounterEffectContextSupported() {
        const context = `${this.context ?? ""}`.trim();
        return context.length > 0;
    }

    _buildCounterGroupKey({ entry, effect, entryIndex = 0 }) {
        if (String(entry?.composition_group || "").trim()) return `composition-${effect?.id || "effect"}-${entryIndex}`;
        const byLabel = (entry?.label || "").toString().trim();
        if (byLabel) return byLabel.slugify({ strict: true }) || `entry-${entryIndex}`;
        const byEffect = (effect?.name || "").toString().trim();
        if (byEffect) return byEffect.slugify({ strict: true }) || `entry-${entryIndex}`;
        return `effect-${effect?.id || "unknown"}-${entryIndex}`;
    }

    _isWorseForRoller(candidateValue, currentValue) {
        return Number(candidateValue) < Number(currentValue);
    }

    _collectCounterCandidatesForTarget(targetActor) {
        const entries = [];
        if (!targetActor) return entries;
        const activeEffects = Array.from(targetActor.appliedEffects ?? targetActor.effects ?? []);
        for (const effect of activeEffects) {
            if (!this._matchesEquipmentEffectScope(effect)) continue;
            const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
            if (!data) continue;
        const configuredEntries = Array.isArray(data.entries) && data.entries.length
                ? data.entries
                : [{
                    value: data.value,
                    cap: data.cap,
                    context: data.context,
                    nh_display_mode: data.nh_display_mode,
                    roll_tags: data.roll_tags,
                    roll_tag_match: data.roll_tag_match,
                    target_values: data.target_values,
                    source_item_ids: data.source_item_ids,
                    application_side: data.applicationSide ?? "self"
                }];

            configuredEntries.forEach((entry, entryIndex) => {
                const context = entry?.contexts ?? entry?.context ?? "all";
                const sourceItem = this._getRollSourceItem();
                if (entry?.skill_roll_only === true && sourceItem?.type !== "skill") return;
                if (entry?.ability_roll_only === true && !["skill", "spell", "power"].includes(sourceItem?.type)) return;
                if (!this._matchesEffectContext(context, this.context)) return;
                if (!matchesRollTags(entry, this._getRollMetadata().rollTags)) return;
                if (!this._matchesTargetFilter(entry)) return;
                if (shouldIncludeInPermanentNh(entry)) return;
                if (this._resolveModifierApplicationSide(entry, data) !== "vs_targeter") return;

                entries.push({
                    effect,
                    entry,
                    entryIndex,
                    targetActor
                });
            });
        }
        return entries;
    }

    _loadTargetCounterModifiers() {
        this.counterEffectsNotice = null;
        if (!this._isCounterEffectContextSupported()) return;

        const targetTokens = Array.from(game.user.targets || []).filter((token) => token?.actor);
        if (!targetTokens.length) return;

        if (targetTokens.length > 1) {
            const hasAnyApplicable = targetTokens.some((token) => this._collectCounterCandidatesForTarget(token.actor).length > 0);
            if (hasAnyApplicable) {
                this.counterEffectsNotice = "Contra-efeitos ignorados (múltiplos alvos).";
            }
            return;
        }

        const [targetToken] = targetTokens;
        const candidates = this._collectCounterCandidatesForTarget(targetToken.actor);

        const grouped = new Map();
        for (const candidate of candidates) {
            const value = this._evaluateModifierEntryValue(candidate.entry, { actor: candidate.targetActor });
            const key = this._buildCounterGroupKey(candidate);
            const current = grouped.get(key);
            const capRaw = candidate.entry?.cap ?? candidate.entry?.nh_cap ?? "";
            const cap = capRaw !== "" && capRaw !== null && capRaw !== undefined ? parseInt(capRaw) : null;
            const labelBase = this._buildCounterModifierLabel(candidate);
            const payload = {
                id: `counter::${targetToken.id}::${key}`,
                label: `Alvo: ${labelBase}`,
                value,
                nh_cap: Number.isNaN(cap) ? null : cap,
                isGM: true,
                isEffect: true,
                isCounterEffect: true,
                counterSource: `${targetToken.actor.name} • ${candidate.effect.name}`,
                compositionGroup: candidate.entry?.composition_group || "",
                compositionMode: candidate.entry?.composition_mode || "sum",
                compositionPriority: Number(candidate.entry?.composition_priority) || 0,
                compositionOrigin: getRollModifierCompositionOrigin(candidate.effect)
            };

            if (!current || this._isWorseForRoller(payload.value, current.value)) {
                grouped.set(key, payload);
            }
        }

        const recalculationModifiers = game.gum?.resolveTargetCombatDefenseRecalculationModifiers?.(
            this.actor,
            this.context,
            this.rollData
        ) || [];
        for (const modifier of recalculationModifiers) grouped.set(modifier.id, modifier);

        grouped.forEach((modifier) => this.selectedModifiers.push(modifier));
    }

    _composeSemanticModifiers() {
        this.selectedModifiers = composeRollModifiers(this.selectedModifiers);
    }

    _buildCounterModifierLabel(candidate) {
        const entryLabel = `${candidate?.entry?.label ?? ""}`.trim();
        if (entryLabel) return this._capitalizeCounterLabel(entryLabel);

        const effectName = `${candidate?.effect?.name ?? ""}`.trim();
        if (!effectName) return "Efeito";

        const cleaned = effectName.replace(/^Modificador de Rolagem\s*[-—:]\s*/i, "").trim();
        return this._capitalizeCounterLabel(cleaned || effectName);
    }

    _capitalizeCounterLabel(label) {
        if (!label) return label;
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    _isAutoDistanceContextSupported() {
        const supported = ["attack_melee", "attack_ranged", "spell", "power", "skill"];
        if (supported.includes(this.context)) return true;
        return ["skill_", "spell_", "power_"].some(prefix => this.context.startsWith(prefix));
    }

    _resolveAttackerToken() {
        const controlled = Array.from(canvas.tokens?.controlled || []).find((token) => token?.actor?.id === this.actor?.id);
        if (controlled) return controlled;
        const activeTokens = this.actor?.getActiveTokens?.(true) || [];
        return activeTokens[0] || null;
    }

    _resolveSingleTargetToken() {
        const targets = Array.from(game.user.targets || []).filter((token) => token?.actor);
        if (targets.length !== 1) return null;
        return targets[0];
    }

    _measureDistanceInSceneUnits(fromToken, toToken) {
        if (!fromToken?.center || !toToken?.center) return null;
        return measureGridDistance(
            canvas.grid,
            fromToken.center,
            toToken.center,
            canvas.scene?.grid?.distance ?? 1
        );
    }

    _formatDistanceLabel(distanceMeters) {
        const roundedMeters = Math.max(0, Math.ceil(Number(distanceMeters) || 0));
        return `Distância (${roundedMeters}m)`;
    }

    _loadAutoDistanceModifier() {
        const isEnabled = game.settings.get("gum", DISTANCE_MODIFIER_ENABLED_SETTING);
        if (!isEnabled) return;
        if (!this._isAutoDistanceContextSupported()) return;

        const attackerToken = this._resolveAttackerToken();
        const targetToken = this._resolveSingleTargetToken();
        if (!attackerToken || !targetToken) return;

        const distanceInSceneUnits = this._measureDistanceInSceneUnits(attackerToken, targetToken);
        if (!Number.isFinite(distanceInSceneUnits)) return;

        const distanceMeters = Math.max(0, Number(distanceInSceneUnits) || 0);
        const selectedTable = game.settings.get("gum", DISTANCE_MODIFIER_TABLE_SETTING) || "standard";
        const modifier = getDistanceModifier(distanceMeters, selectedTable);
        if (!Number.isFinite(modifier)) return;

        this.selectedModifiers.push({
            id: "auto_distance",
            label: this._formatDistanceLabel(distanceMeters),
            value: modifier,
            isGM: true,
            isAutoDistance: true
        });
    }

     _loadAutoSizeModifier() {
        const mode = game.settings.get("gum", "autoSizeModifierMode") || AUTO_SIZE_MODIFIER_MODES.OFF;
        if (mode === AUTO_SIZE_MODIFIER_MODES.OFF) return;
        if (!["attack_melee", "attack_ranged"].includes(this.context)) return;

        const targetToken = this._resolveSingleTargetToken();
        if (!targetToken?.actor) return;

        const result = calculateAttackSizeModifier(
            foundry.utils.getProperty(this.actor, "system.attributes.mt.final"),
            foundry.utils.getProperty(targetToken.actor, "system.attributes.mt.final"),
            mode
        );
        if (!result) return;

        this.selectedModifiers.push({
            id: "auto_size_modifier",
            label: result.label,
            value: result.modifier,
            isGM: true,
            isAutoSizeModifier: true
        });
    }

    _splitCommaSeparatedArgs(rawValue) {
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

    _toNumberOrZero(value) {
        if (value === null || value === undefined || value === "") return 0;
        const direct = Number(value);
        if (Number.isFinite(direct)) return direct;
        const match = String(value).match(/[+-]?\d+(\.\d+)?/);
        return match ? Number(match[0]) || 0 : 0;
    }

    _resolveRollItemAttackContext() {
        const itemId = this.rollData?.itemId;
        const itemName = String(this.rollData?.itemName || "").trim().toLowerCase();
        const item = itemId
            ? (this.actor.items.get(itemId) || null)
            : (itemName ? this.actor.items.find((candidate) => candidate.name?.trim().toLowerCase() === itemName) || null : null);
        if (!item) return { item: null, attack: null };

        if (["spell", "power"].includes(item.type) && item.system?.uses_attack) {
            return { item, attack: item.system.attack_roll || null };
        }

        const attackId = this.rollData?.attackId;
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

    _resolveModifierReference(rawReference) {
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

        const { item, attack } = this._resolveRollItemAttackContext();
        if (normalizedRef.startsWith("item.")) {
            const itemPath = normalizedRef.slice("item.".length);
            const itemValue = foundry.utils.getProperty(item?.system ?? {}, itemPath);
            return this._toNumberOrZero(itemValue) + modifier;
        }
        if (normalizedRef.startsWith("attack.") || normalizedRef.startsWith("ataque.")) {
            const attackPath = normalizedRef.split(".").slice(1).join(".");
            const attackValue = foundry.utils.getProperty(attack ?? {}, attackPath);
            return this._toNumberOrZero(attackValue) + modifier;
        }

        const parameterAliases = {
            holdout: item?.system?.holdout,
            ocultamento: item?.system?.holdout,
            precision: attack?.accuracy,
            precisao: attack?.accuracy,
            "precisão": attack?.accuracy,
            prec: attack?.accuracy,
            accuracy: attack?.accuracy,
            magnitude: attack?.mag ?? this.rollData?.magnitude ?? this.rollData?.mag,
            mag: attack?.mag ?? this.rollData?.mag ?? this.rollData?.magnitude
        };
        if (normalizedRef in parameterAliases) {
            return this._toNumberOrZero(parameterAliases[normalizedRef]) + modifier;
        }

        const baseAttr = this._resolveBaseValue(normalizedRef, { fallbackValue: null });
        if (baseAttr !== null && baseAttr !== undefined) {
            return (Number(baseAttr) || 0) + modifier;
        }

        const skill = this.actor.items.find((item) =>
            item.type === "skill" && item.name?.toLowerCase().trim() === normalizedRef
        );
        if (skill) {
            return (Number(skill.system?.final_nh) || 0) + modifier;
        }

        return modifier;
    }

    _evaluateModifierEntryValue(entry = {}, { actor = this.actor } = {}) {
        const value = this._evaluateModifierValue(entry?.value, { actor });
        if (!entry?.defer_value_evaluation || entry?.value_mode !== "per_origin_level") return value;
        const originLevel = Number(entry?.origin_level);
        return value * (Number.isFinite(originLevel) && originLevel > 0 ? originLevel : 1);
    }

    _matchesEquipmentEffectScope(effect) {
        const item = this.actor?.items?.get?.(this.rollData?.itemId) || null;
        const attackId = this.rollData?.attackId;
        const attack = item?.system?.melee_attacks?.[attackId] || item?.system?.ranged_attacks?.[attackId] || null;
        const attackType = item?.system?.melee_attacks?.[attackId] ? "melee"
            : item?.system?.ranged_attacks?.[attackId] ? "ranged" : "";
        return matchesEquipmentGrantedEffectScope(effect, item, attack, attackType);
    }

    _evaluateModifierValue(rawValue, { actor = this.actor } = {}) {
        if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
        if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;

        let conditionalValue = rawValue;
        try {
            conditionalValue = resolveConditionalValue(rawValue, { actor, rollData: this.rollData });
        } catch (error) {
            console.warn("GUM | Falha ao avaliar expressão condicional no prompt de rolagem:", error);
            return 0;
        }

        const source = String(conditionalValue).trim();
        if (!source) return 0;
        if (/^[+-]?\d+(\.\d+)?$/.test(source)) return Number(source) || 0;

        const diceResult = evaluateModifierRollFormulaSync(source, actor?.getRollData?.() || {});
        if (Number.isFinite(diceResult)) return diceResult;

        const javascriptResult = evaluateJavaScriptNumericExpression(source, {
            actor,
            game,
            rollData: this.rollData
        });
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
                    (token) => this._resolveModifierReference(token),
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
            const values = this._splitCommaSeparatedArgs(expressionMatch[2]).map((entry) => {
                const arithmeticEntry = evaluateArithmetic(entry);
                if (Number.isFinite(arithmeticEntry)) return arithmeticEntry;
                return this._resolveModifierReference(entry);
            });
            if (!values.length) return 0;
            return mode === "min" ? Math.min(...values) : Math.max(...values);
        }

        const arithmeticResult = evaluateArithmetic(source);
        if (Number.isFinite(arithmeticResult)) return arithmeticResult;

        return this._resolveModifierReference(source);
    }

    _normalizeContexts(rawContexts) {
        if (!rawContexts) return [];
        if (Array.isArray(rawContexts)) return rawContexts.map(c => `${c}`.trim()).filter(Boolean);
        return `${rawContexts}`
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);
    }

    _matchesEffectContext(modContext, rollContext) {
        if (!modContext) return true;

        if (Array.isArray(modContext)) {
            if (!modContext.length) return true;
            return modContext.some((ctx) => this._matchesEffectContext(ctx, rollContext));
        }

        if (typeof modContext === "string" && modContext.includes(",")) {
            const contextList = modContext
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean);
            if (!contextList.length) return true;
            return contextList.some((ctx) => this._matchesEffectContext(ctx, rollContext));
        }

        const normalized = `${modContext}`.trim();
        if (!normalized || normalized === "all") return true;

        return matchesAbilityRollContext(normalized, rollContext);
    }

    _normalizeFilterTokens(rawValue, { lower = false } = {}) {
        return String(rawValue ?? "")
            .split(",")
 .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => lower ? value.toLowerCase() : value);
    }

    _getRollSourceItem() {
        const itemId = String(this.rollData?.itemId ?? "").trim();
        const itemName = String(this.rollData?.itemName ?? "").trim().toLowerCase();
        if (itemId) return this.actor.items.get(itemId) || null;
        if (!itemName) return null;
        return this.actor.items.find((candidate) => candidate.name?.trim().toLowerCase() === itemName) || null;
    }

    _getRollSourceAttack(item = null) {
        if (!item) return null;
        if (["spell", "power"].includes(item.type) && item.system?.uses_attack) {
            return item.system.attack_roll || null;
        }
        const attackId = String(this.rollData?.attackId ?? "").trim();
        if (attackId) {
            return item.system?.melee_attacks?.[attackId] ?? item.system?.ranged_attacks?.[attackId] ?? null;
        }

        const rangedAttacks = Object.values(item.system?.ranged_attacks || {});
        const meleeAttacks = Object.values(item.system?.melee_attacks || {});
        const allAttacks = [...meleeAttacks, ...rangedAttacks].filter(Boolean);
        return allAttacks.length === 1 ? allAttacks[0] : null;
    }

    _matchesSourceItemFilter(entry = {}, item = null) {
        const filters = this._normalizeFilterTokens(entry?.source_item_ids, { lower: true });
        if (!filters.length) return true;
        if (!item) return false;

        const candidates = [
            item.id,
            item.uuid,
            item.name
        ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);

        return filters.some((filter) => candidates.includes(filter));
    }

    _matchesSourceAttackFilter(entry = {}, item = null) {
        const filters = this._normalizeFilterTokens(entry?.source_attack_ids, { lower: true });
        if (!filters.length) return true;

        const rollAttackId = String(this.rollData?.attackId ?? "").trim();
        const attack = this._getRollSourceAttack(item);
        const candidates = [
            rollAttackId,
            attack?.id,
            attack?.mode,
            attack?.name
        ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);

        return candidates.length > 0 && filters.some((filter) => candidates.includes(filter));
    }

    _matchesTargetFilter(entry = {}) {
        const item = this._getRollSourceItem();
        if (!matchesAbilityClassificationFilters(entry, item)) return false;
        if (!this._matchesSourceItemFilter(entry, item)) return false;
        if (!this._matchesSourceAttackFilter(entry, item)) return false;

        const targets = this._normalizeFilterTokens(entry?.target_values, { lower: true });
        if (!targets.length) return true;

        if (!item) return false;

        const itemCandidates = [item.id, item.uuid, item.name, getSkillDisplayName(item)]
            .map((value) => String(value ?? "").trim().toLowerCase())
            .filter(Boolean);
        // IDs, nome-base e nome de exibição com especialização são aceitos.
        return targets.some((target) => itemCandidates.includes(target));
    }
    
    _determineContext() {
        const type = this.rollData.type;
        const itemId = this.rollData.itemId;
        const attributeKey = normalizeRequestedAttributeKey(this.rollData.attributeKey ?? this.rollData.attribute);
        const senseKeys = ["vision", "hearing", "tastesmell", "touch"];
        const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];
        
        if (type === 'defense') {
            const defenseType = this.rollData.defenseType?.toLowerCase?.();
            if (defenseType === 'dodge') return 'defense_dodge';
            if (defenseType === 'parry') return 'defense_parry';
            if (defenseType === 'block') return 'defense_block';
            return 'defense';
        }

        if (type === 'attack') {
            if (this.rollData.attackType === 'ranged') return 'attack_ranged';
            if (this.rollData.isRanged === true) return 'attack_ranged';
 if (this.rollData.attackType === 'melee') return 'attack_melee';
        }

        if (type === 'spell' || type === 'power') {
            const item = itemId ? this.actor.items.get(itemId) : null;
            return resolveAbilityRollContext(type, { attributeKey: attributeKey || null, item }) || type;
        }

        if (type === 'attribute' && attributeKey) {
            if (attributeKeys.includes(attributeKey)) return `check_${attributeKey}`;
        }

        if (type === 'skill') {
            if (attributeKey && senseKeys.includes(attributeKey)) return `sense_${attributeKey}`;
            let baseAttribute = attributeKey;
            if (!baseAttribute && itemId) {
                const item = this.actor.items.get(itemId);
                if (item?.system?.base_attribute) baseAttribute = item.system.base_attribute.toLowerCase();
            }
            if (baseAttribute && attributeKeys.includes(baseAttribute)) return `skill_${baseAttribute}`;
        }

        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (item) {
                if (item.type === 'spell' || item.type === 'power') return resolveAbilityRollContext(item.type, { item }) || item.type;
                if (item.type === 'ranged_weapon') return 'attack_ranged';
            }
        }

        if (type === 'attack') return 'attack_melee';
        if (type === 'skill' || type === 'attribute') return 'skill';

return 'default';
    }

        _getRollMetadata() {
        return resolveRollMetadata({ context: this.context, purposeIds: this.purposeIds, attributeKey: this.currentBaseKey });
    }

    _normalizeAttributeKey(key) {
        if (!key) return null;
        return normalizeRequestedAttributeKey(key);
    }

    _formatBaseLabelValue(key) {
        if (!key) return "Perícia";
        const normalizedKey = this._normalizeAttributeKey(key);
        const labelMap = {
            st: "ST",
            dx: "DX",
            iq: "IQ",
            ht: "HT",
            per: "Per",
            vont: "Vont"
        };
        if (labelMap[normalizedKey]) return labelMap[normalizedKey];
        const fixedNumber = Number(normalizedKey);
        if (!Number.isNaN(fixedNumber)) return `${fixedNumber}`;
        return key.toString().trim();
    }

    _collectBaseModifiers(sourceItem) {
        if (!sourceItem || !["skill", "spell", "power"].includes(sourceItem.type)) {
            return [];
        }
        const relativeLevel = Number(sourceItem.system?.skill_level) || 0;
        const nhMods = Number(sourceItem.system?.nh_mod) || 0;
        const passiveMods = Number(sourceItem.system?.nh_passive) || 0;
        const tempMods = Number(sourceItem.system?.nh_temp) || 0;
        const parts = [];
        if (relativeLevel !== 0) parts.push(relativeLevel);
        if (nhMods !== 0) parts.push(nhMods);
        if (passiveMods !== 0) parts.push(passiveMods);
        if (tempMods !== 0) parts.push(tempMods);
        return parts;
    }

    _resolveOriginalBaseAttributeKey() {
        const attributeKey = normalizeRequestedAttributeKey(this.rollData.attributeKey ?? this.rollData.attribute);
        if (attributeKey) return attributeKey;
        if (this.rollData.itemId) {
            const item = this.actor.items.get(this.rollData.itemId);
            return item?.system?.base_attribute?.toString?.().trim() || null;
        }
        return null;
    }

    _getBaseAttributeKey() {
        return this.originalBaseAttributeKey;
    }

    _resolveBaseValue(key, { fallbackValue = null } = {}) {
        if (!key) return fallbackValue;
        const normalizedKey = this._normalizeAttributeKey(key);
        const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];

        if (attributeKeys.includes(normalizedKey)) {
            const value = foundry.utils.getProperty(this.actor.system, `attributes.${normalizedKey}.final`);
            return value !== undefined && value !== null ? value : fallbackValue;
        }

        const fixedNumber = Number(normalizedKey);
        if (!Number.isNaN(fixedNumber)) return fixedNumber;

        const normalizedTarget = normalizedKey.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
        const skills = this.actor.items?.filter(item => item.type === "skill") || [];
        const matchedSkill = skills.find(skill => {
            const skillName = skill.name?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
            return skillName === normalizedTarget;
        });

        if (matchedSkill) {
            const nhValue = matchedSkill.system?.final_nh ?? matchedSkill.system?.nh;
            if (nhValue !== undefined && nhValue !== null) return nhValue;
        }

        return fallbackValue;
    }

    _shouldApplyBaseDelta(sourceItem) {
        const rollType = this.rollData.type;
        if (["skill", "spell", "power"].includes(rollType)) return true;
        if (sourceItem && ["skill", "spell", "power"].includes(sourceItem.type)) return true;
        return false;
    }

    _prepareBaseAttributeOptions() {
        this.baseAttributeOptionsMap.clear();
        const baseAttributeKey = this._getBaseAttributeKey();
        const normalizedBaseAttributeKey = this._normalizeAttributeKey(baseAttributeKey);
        const sourceItem = this.rollData.itemId ? this.actor.items.get(this.rollData.itemId) : null;
        const baseAttributeValue = this._resolveBaseValue(baseAttributeKey);
        const canApplyDelta = this._shouldApplyBaseDelta(sourceItem);

        this.baseDelta = canApplyDelta && baseAttributeValue !== null
            ? this.originalBaseValue - baseAttributeValue
            : 0;

        this.baseModifierParts = this._collectBaseModifiers(sourceItem);
        this.baseAttributeSourceLabel = this._formatBaseLabelValue(baseAttributeKey);

        const options = [
            { key: "st", label: "ST", type: "attribute" },
            { key: "dx", label: "DX", type: "attribute" },
            { key: "iq", label: "IQ", type: "attribute" },
            { key: "ht", label: "HT", type: "attribute" },
            { key: "per", label: "Per", type: "attribute" },
            { key: "vont", label: "Vont", type: "attribute" },
            { key: "skill", label: "Habilidade", type: "skill" },
            { key: "fixed_8", label: "8", type: "fixed", value: 8 },
            { key: "fixed_12", label: "12", type: "fixed", value: 12 },
            { key: "fixed_16", label: "16", type: "fixed", value: 16 }
        ];

        const fixedMatch = Number.isNaN(Number(normalizedBaseAttributeKey))
            ? null
            : options.find(option => option.type === "fixed" && option.value === Number(normalizedBaseAttributeKey));

        const requestedInitialBaseKey = this.rollData.initialBaseKey?.toString?.().trim().toLowerCase();
        if (requestedInitialBaseKey && options.some(option => option.key === requestedInitialBaseKey)) {
            this.baseDefaultKey = requestedInitialBaseKey;
        } else if (normalizedBaseAttributeKey && options.some(option => option.key === normalizedBaseAttributeKey)) {
            this.baseDefaultKey = normalizedBaseAttributeKey;
        } else if (fixedMatch) {
            this.baseDefaultKey = fixedMatch.key;
        } else {
            this.baseDefaultKey = "skill";
        }

        options.forEach(option => {
            if (option.type === "attribute") {
                option.value = this._resolveBaseValue(option.key, { fallbackValue: 10 });
            }
        });

        const defaultOption = options.find(option => option.key === this.baseDefaultKey) || options.find(option => option.key === "skill");
        this.baseDefaultLabel = defaultOption?.label || "Perícia";
        this.currentBaseKey = this.baseDefaultKey;
        this.currentBaseLabel = this.baseDefaultLabel;
        this.currentBaseValue = this._computeBaseValueFromOption(defaultOption);

        options.forEach(option => {
            option.isSelected = option.key === this.currentBaseKey;
            this.baseAttributeOptionsMap.set(option.key, option);
        });

        this.baseAttributeOptions = options;
        return options;
    }

    _getCurrentBaseLabelValue(option) {
        if (!option) return this.baseAttributeSourceLabel;
        if (option.type === "skill") return this.baseAttributeSourceLabel;
        if (option.type === "fixed") return `${option.value ?? option.label ?? ""}`;
        return option.label;
    }

    _buildBaseDetailLabel(option) {
        const baseLabelValue = this._getCurrentBaseLabelValue(option);
        if (!this.baseModifierParts.length) return baseLabelValue;
        const modifierText = this.baseModifierParts
            .map(value => `${value >= 0 ? "+" : ""}${value}`)
            .join("");
        return `${baseLabelValue}${modifierText}`;
    }

    _computeBaseValueFromOption(option) {
        if (!option) return this.originalBaseValue;
        if (option.type === "skill") return this.originalBaseValue;
        const optionValue = Number(option.value);
        const resolvedValue = Number.isNaN(optionValue) ? this.originalBaseValue : optionValue;
        return resolvedValue + this.baseDelta;
    }

    async _fetchAndOrganizeModifiers() {
        const contextKey = this.context;
        const blocksMap = new Map();

        const ensureBlock = (groupName) => {
            const label = (groupName || "").toString().trim() || "Geral";
            const key = label.slugify({ strict: true }) || "geral";
            if (!blocksMap.has(key)) {
                blocksMap.set(key, {
                    id: key,
                    title: label,
                    color: "#6e6e6e",
                    items: []
                });
            }
            return blocksMap.get(key);
        };

        const allModifierItems = [];
        const useDefaults = this.actor.getFlag("gum", "useDefaultModifiers");

        if (useDefaults) {
            const { documents } = await contentSourceService.getDocuments("rollModifiers");
            allModifierItems.push(...documents);
        }

        const actorModifiers = this.actor.items.filter(i => i.type === "gm_modifier");
        allModifierItems.push(...actorModifiers);

        const uniqueItemsMap = new Map();
        for (const item of allModifierItems) {
            if (item.parent === this.actor || !uniqueItemsMap.has(item.name)) uniqueItemsMap.set(item.name, item);
        }

        for (const item of uniqueItemsMap.values()) {
            const block = ensureBlock(item.system.group);
            const entryList = Array.isArray(item.system.modifier_entries) && item.system.modifier_entries.length
                ? item.system.modifier_entries
                : null;

            if (entryList) {
                entryList.forEach((entry, index) => {
                    const contexts = this._normalizeContexts(entry?.contexts);
                    if (contexts.length && !this._matchesEffectContext(contexts, contextKey)) return;
                    if (!matchesRollTags(entry, this._getRollMetadata().rollTags)) return;

                    const entryId = `${item.id}::${index}`;
                    block.items.push({
                        id: entryId,
                        label: entry?.label ? `${item.name} — ${entry.label}` : item.name,
                        value: this._evaluateModifierValue(entry?.value),
                        desc: item.system.description || "",
                        nh_cap: entry?.nh_cap ?? entry?.cap ?? "",
                        duration: item.system.duration,
                        ref: item.system.ref || "",
                        img: item.img || "icons/svg/d20.svg",
                        active: this.selectedModifiers.some(m => m.id === entryId),
                        isNative: false
                    });
                });
                continue;
            }

            if (!this._isValidForContext(item, contextKey)) continue;
            if (!matchesRollTags(item.system, this._getRollMetadata().rollTags)) continue;

            block.items.push({
                id: item.id,
                label: item.name,
                value: this._evaluateModifierValue(item.system.modifier),
                desc: item.system.description || "",
                nh_cap: item.system.nh_cap,
                duration: item.system.duration,
                ref: item.system.ref || "",
                img: item.img || "icons/svg/d20.svg",
                active: this.selectedModifiers.some(m => m.id === item.id),
                isNative: false
            });
        }

        const blocks = Array.from(blocksMap.values())
            .map((block) => {
                block.items.sort((a, b) => a.label.localeCompare(b.label));
                return block;
            })
            .filter((block) => block.items.length > 0)
            .sort((a, b) => a.title.localeCompare(b.title));

        return blocks;
    }

    _getNativeCategory(modId) {
        if (modId.startsWith("loc_")) return "location";
        if (modId.startsWith("man_")) return "maneuver";
        if (modId.startsWith("opt_")) return "attack_opt";
        if (modId.startsWith("def_")) return "defense_opt";
        if (modId.startsWith("pos_")) return "posture";
        if (modId.startsWith("range_")) return "range";
        if (modId.startsWith("time_")) return "time";
        if (modId.startsWith("eff_")) return "effort";
        if (modId.startsWith("sit_")) return "situation";
        return "other";
    }

    _isValidForContext(item, context) {
        const targets = item.system.target_type || {};
        if (targets.global) return true;

        const validKeys = [];
        if (context.startsWith('attack')) {
            validKeys.push('combat_all', 'combat_attack_all');
            if (context === 'attack_melee') validKeys.push('combat_attack_melee');
            if (context === 'attack_ranged') validKeys.push('combat_attack_ranged');
        }
        else if (context.startsWith('defense')) {
            validKeys.push('combat_all', 'combat_defense_all');
            if (context === 'defense_dodge') validKeys.push('combat_defense_dodge');
            if (context === 'defense_parry') validKeys.push('combat_defense_parry');
            if (context === 'defense_block') validKeys.push('combat_defense_block');
            if (context === 'defense') validKeys.push('combat_defense_dodge', 'combat_defense_parry', 'combat_defense_block');
        }
        else if (context === 'spell' || context.startsWith('spell_')) {
            validKeys.push('combat_attack_spell', 'attr_iq_all', 'spell_iq', 'combat_all');
        }
        else if (context === 'power' || context.startsWith('power_')) {
             validKeys.push('combat_attack_power', 'power_iq', 'power_ht', 'power_will');
        }
        else if (context === 'skill' || context.startsWith('skill_') || context.startsWith('check_')) {
            validKeys.push('attr_all', 'attr_dx_all', 'attr_iq_all', 'attr_ht_all', 'attr_st_all', 'attr_per_all', 'attr_will_all'); 
            validKeys.push('skill_st', 'skill_dx', 'skill_iq', 'skill_ht', 'skill_per', 'skill_will');
        }

        return validKeys.some(k => targets[k] === true);
    }

   async getData() {
        const context = await super.getData();
        const preservedBaseKey = this._basePrepared ? this.currentBaseKey : null;
        context.actor = this.actor;
        context.label = this.rollData.label || "Teste";
        context.img = this.rollData.img || this.actor.img || "icons/svg/d20.svg";
        context.img = resolveRollPromptImage(this.actor, this.rollData);
        context.baseValue = parseInt(this.rollData.value) || 10;
        context.initialManualMod = parseInt(this.rollData.modifier) || 0;
        context.manualLabel = this.rollData.modifierLabel || "Manual";
        context.lockInitialModifier = this.rollData.lockInitialModifier === true;
        context.fixedModifier = parseInt(this.rollData.fixedModifier) || 0;
        context.ammunitionOptions = this.ammunitionOptions.map(item => ({ id: item.id, name: item.name, quantity: item.system.quantity, selected: item.id === this.selectedAmmunitionId }));
        context.ammunitionId = this.selectedAmmunitionId;
        context.ammunitionModifier = ammunitionRollModifier(this.ammunitionOptions.find(item => item.id === this.selectedAmmunitionId));
        context.ammunitionModifierSummary = game.i18n.format("GUM.Equipment.Ammunition.ModifierSummary", { modifier: context.ammunitionModifier });
        context.fixedModifierLabel = this.rollData.fixedModifierLabel || "Fixo";
        context.baseAttributeOptions = this._prepareBaseAttributeOptions();
        if (preservedBaseKey && this.baseAttributeOptionsMap.has(preservedBaseKey)) {
            const preserved = this.baseAttributeOptionsMap.get(preservedBaseKey);
            this.currentBaseKey = preserved.key;
            this.currentBaseLabel = preserved.label;
            this.currentBaseValue = this._computeBaseValueFromOption(preserved);
            context.baseAttributeOptions.forEach(option => option.isSelected = option.key === preservedBaseKey);
        }
        this._basePrepared = true;
        context.baseAttributePrimary = context.baseAttributeOptions.filter(option => option.type === "attribute");
        context.baseAttributeSecondary = context.baseAttributeOptions.filter(option => option.type !== "attribute");
        const currentOption = this.baseAttributeOptionsMap.get(this.currentBaseKey);
        context.baseAttributeLabel = this._buildBaseDetailLabel(currentOption);
        context.menuCollapsed = this.isMenuCollapsed;
        const purposeSearchActive = Boolean(normalizePurposeSearch(this.purposeSearchQuery));
        const contextualIds = new Set(this._getContextualPurposeIds());
        context.purposeGroups = getGroupedRollPurposes(this.currentBaseKey, this.purposeIds)
            .filter(group => group.id !== "general")
            .map(group => ({ ...group, isOpen: purposeSearchActive || !this.collapsedPurposeGroups.has(group.id), purposes: group.purposes.map(purpose => ({ ...purpose, contextual: contextualIds.has(purpose.id), requested: this.requestedPurposeIds.includes(purpose.id) })) }));
        context.purposeSearchQuery = this.purposeSearchQuery;
        context.purposeSearchActive = purposeSearchActive;
        context.contextualPurposeFilterActive = this.contextualPurposeFilterActive;
        context.contextualPurposeCount = contextualIds.size;
        context.purposeLabels = getPurposeLabels(this.purposeIds, { short: true });
        context.hasPurposes = context.purposeLabels.length > 0;
        context.rollPrivacyOptions = rollPrivacyOptions(this.rollMode, key => game.i18n.localize(key));
        
        context.blocks = await this._fetchAndOrganizeModifiers();
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const inputManual = html.find('input[name="manualMod"]');
        this._applyMenuState(html);

        html.find('.roll-privacy-btn').click(ev => {
            ev.preventDefault();
            this.rollMode = normalizeRollPrivacyMode($(ev.currentTarget).data('roll-mode'));
            html.find('.roll-privacy-btn').each((_index, element) => {
                const selected = element.dataset.rollMode === this.rollMode;
                element.classList.toggle('active', selected);
                element.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        });

        html.find('.step-btn').click(ev => {
            ev.preventDefault();
            const action = $(ev.currentTarget).data('action');
            let val = parseInt(inputManual.val()) || 0;
            inputManual.val(action === 'increase' ? val + 1 : val - 1);
            this._updateTotals(html);
        });

        html.find('.quick-btn').click(ev => {
            ev.preventDefault();
            const add = parseInt($(ev.currentTarget).data('value'));
            inputManual.val((parseInt(inputManual.val()) || 0) + add);
            this._updateTotals(html);
        });

        inputManual.on('input change', () => this._updateTotals(html));

        // Quick View (Info)
        html.find('.mod-view').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation(); 

            const icon = $(ev.currentTarget);
            const button = icon.siblings('.mod-btn'); 
            
            let rawValue = icon.data('value');
            if (rawValue === undefined) rawValue = button.data('value');

            const data = {
                name: icon.data('title') || button.data('label') || "Modificador",
                value: parseInt(rawValue) || 0,
                cap: icon.data('cap') || button.data('cap'),
                duration: icon.data('duration') || button.data('duration'),
                 ref: icon.data('ref') || button.data('ref') || "",
                img: icon.data('img') || button.data('img') || "icons/svg/d20.svg",
                desc: icon.data('desc') || "<i>Sem descrição.</i>",
                type: "Modificador GM"
            };

            const escapeHtml = (value) => foundry.utils.escapeHTML((value ?? "").toString());
            const createTag = (label, value) => {
                if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
                    return `<div class="property-tag"><label>${escapeHtml(label)}</label><span>${value}</span></div>`;
                }
                return '';
            };

            const refTags = this._parseReferenceCodes(data.ref)
                .map(ref => `<a class="open-reference-link" data-ref="${ref.label}" title="Abrir referência">${ref.label}</a>`)
                .join(', ');

            let tagsHtml = createTag('MOD', `${data.value > 0 ? '+' : ''}${data.value}`);
            tagsHtml += createTag('Cap NH', data.cap);
            tagsHtml += createTag('Duração', escapeHtml(data.duration));
            tagsHtml += createTag('REF', refTags);

            const enrichedDesc = await TextEditorImpl.enrichHTML(data.desc, {
                secrets: this.actor.isOwner,
                async: true
            });

            return GumPreviewDialog.show({
                title: data.name,
                type: data.type,
                img: data.img,
                description: enrichedDesc,
                tags: [
                    { label: "MOD", value: `${data.value > 0 ? "+" : ""}${data.value}` },
                    { label: "Cap NH", value: data.cap },
                    { label: "Duração", value: data.duration },
                    { label: "REF", value: data.ref }
                ],
                width: 500
            });

            const content = `
                <div class="gurps-dialog-canvas">
                    <div class="gurps-item-preview-card">
                        <header class="preview-header">
                            <img src="${escapeHtml(data.img)}" class="header-icon"/>
                            <div class="header-text">
                                <h3>${escapeHtml(data.name)}</h3>
                                <span class="preview-item-type">${escapeHtml(data.type)}</span>
                            </div>
                        </header>
                        <div class="preview-content">
                            <div class="preview-properties">${tagsHtml}</div>
                            ${(enrichedDesc && enrichedDesc.trim() !== "<i>Sem descrição.</i>") ? '<hr class="preview-divider">' : ''}
                            <div class="preview-description">${enrichedDesc}</div>
                        </div>
                    </div>
                </div>`;

            new Dialog({
                title: `Detalhes: ${data.name}`,
                content: content,
                buttons: {},
                default: "",
                render: (dialogHtml) => {
                    dialogHtml.find('.open-reference-link').on('click', this._onOpenReferenceLink.bind(this));
                }
            }, {
                classes: ["gurps-item-preview-dialog"],
                width: 480,
                height: "auto",
                resizable: true
            }).render(true);
        });

        // Seleção de Botão
        html.find('.mod-btn').click(ev => {
            ev.preventDefault();
            if ($(ev.target).closest('.mod-view').length) return;
            
            const btn = $(ev.currentTarget);
            const modData = {
                id: btn.data('id'),
                value: Number(btn.data('value')) || 0,
                label: btn.data('label'),
                nh_cap: btn.data('cap')
            };

            const index = this.selectedModifiers.findIndex(m => m.id === modData.id);
            if (index >= 0) {
                this.selectedModifiers.splice(index, 1);
                btn.removeClass('active');
            } else {
                this.selectedModifiers.push(modData);
                btn.addClass('active');
            }
           this._updateTotals(html);
        });

        html.find('.base-attr-btn').click(async ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const key = btn.data('key');
            const option = this.baseAttributeOptionsMap.get(key);

            if (!option) return;

            html.find('.base-attr-btn').removeClass('active');
            btn.addClass('active');

            this.currentBaseKey = option.key;
            this.currentBaseLabel = option.label;
            this.currentBaseValue = this._computeBaseValueFromOption(option);
            if (option.type === "attribute") {
                if (this.rollData.type === "attribute" || this.context.startsWith("check_")) {
                    this.context = `check_${option.key}`;
                } else if (this.rollData.type === "skill" || this.context.startsWith("skill_")) {
                    this.context = `skill_${option.key}`;
                } else if (this.rollData.type === "spell" || this.context.startsWith("spell_")) {
                    this.context = `spell_${option.key}`;
                } else if (this.rollData.type === "power" || this.context.startsWith("power_")) {
                    this.context = `power_${option.key}`;
                }
            }
            this.rollData.modifier = parseInt(inputManual.val()) || 0;
            await this._reloadSemanticModifiers();
            await this.render(false);
         });

        html.find('.purpose-view').on('click keydown', ev => {
            if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            ev.stopPropagation();
            PurposeQuickView.show(`${ev.currentTarget.dataset.purposeId || ''}`);
        });

        

        html.find('.menu-toggle-btn').click(ev => {
            ev.preventDefault();
            this.isMenuCollapsed = !this.isMenuCollapsed;
            this._applyMenuState(html);
        });

        html.find('.purpose-btn, .purpose-general').click(async ev => {
            ev.preventDefault();
            const id = `${$(ev.currentTarget).data('purpose-id') || ''}`;
            const selected = new Set(this.purposeIds);
            if (!id || id === 'general') selected.clear();
            else if (selected.has(id)) selected.delete(id);
            else selected.add(id);
            this.purposeIds = [...selected];
            this.rollData.modifier = parseInt(inputManual.val()) || 0;
            await this._reloadSemanticModifiers();
            await this.render(false);
        });

        html.find('.purpose-context-filter').click(ev => {
            ev.preventDefault();
            this.contextualPurposeFilterActive = !this.contextualPurposeFilterActive;
            this._applyPurposeVisibility(html);
        });
        html.find('.purpose-context-show-all').click(ev => {
            ev.preventDefault();
            this.contextualPurposeFilterActive = false;
            this._applyPurposeVisibility(html);
        });

        const purposeSearch = html.find('.purpose-search-input');
        const applyPurposeSearch = () => {
            const active = Boolean(normalizePurposeSearch(this.purposeSearchQuery));
            const matches = new Set(searchRollPurposes(this.purposeSearchQuery).map(purpose => purpose.id));
            let resultCount = 0;
            html.find('.purpose-group').each((_, element) => {
                const group = $(element);
                let groupHasResults = false;
                group.find('.purpose-item-wrapper').each((__, wrapperElement) => {
                    const wrapper = $(wrapperElement);
                    const id = `${wrapper.find('.purpose-btn').data('purpose-id') || ''}`;
                    const matchesQuery = !active || matches.has(id);
                    const matchesContext = !this.contextualPurposeFilterActive || this._getContextualPurposeIds().includes(id);
                    const visible = active ? matchesQuery : matchesContext;
                    wrapper.toggle(visible);
                    if (visible) { groupHasResults = true; resultCount += 1; }
                });
                group.toggle(groupHasResults);
                element.open = active ? groupHasResults : !this.collapsedPurposeGroups.has(`${element.dataset.groupId || ''}`);
            });
            html.find('.purpose-search-clear').toggleClass('visible', active).prop('disabled', !active);
            html.find('.purpose-search-empty').toggle(active && resultCount === 0);
            html.find('.purpose-context-empty').toggle(!active && this.contextualPurposeFilterActive && resultCount === 0);
            const filter = html.find('.purpose-context-filter');
            filter.toggleClass('active', this.contextualPurposeFilterActive).attr('aria-pressed', String(this.contextualPurposeFilterActive));
            return resultCount;
        };
        purposeSearch.on('input', ev => {
            this.purposeSearchQuery = `${ev.currentTarget.value || ''}`;
            applyPurposeSearch();
        }).on('keydown', ev => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.purposeSearchQuery = '';
                purposeSearch.val('');
                applyPurposeSearch();
            } else if (ev.key === 'Enter') {
                ev.preventDefault();
                if (applyPurposeSearch() === 1) html.find('.purpose-item-wrapper:visible .purpose-btn').first().trigger('click');
            }
        });
        html.find('.purpose-search-clear').click(ev => {
            ev.preventDefault();
            this.purposeSearchQuery = '';
            purposeSearch.val('').trigger('focus');
            applyPurposeSearch();
        });
        applyPurposeSearch();
        if (normalizePurposeSearch(this.purposeSearchQuery)) {
            purposeSearch.trigger('focus');
            purposeSearch[0]?.setSelectionRange(this.purposeSearchQuery.length, this.purposeSearchQuery.length);
        }

        html.find('.purpose-group').on('toggle', ev => {
            if (normalizePurposeSearch(this.purposeSearchQuery)) return;
            const groupId = `${ev.currentTarget.dataset.groupId || ''}`;
            if (!groupId) return;
            if (ev.currentTarget.open) this.collapsedPurposeGroups.delete(groupId);
            else this.collapsedPurposeGroups.add(groupId);
        });

        html.find('.defense-mode-btn').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            this.defenseMode = `${btn.data('defense-mode') || 'normal'}`;
            html.find('.defense-mode-btn').removeClass('active');
            btn.addClass('active');
            const showTiming = this.defenseMode !== "normal";
            html.find('.defense-timing-panel').toggle(showTiming);
            this._updateTotals(html);
        });
        html.find('[name="ammunitionId"]').on('change', ev => {
            this.selectedAmmunitionId = ev.currentTarget.value;
            html.find('.ammunition-modifier-summary').text(game.i18n.format("GUM.Equipment.Ammunition.ModifierSummary", { modifier: ammunitionRollModifier(this.ammunitionOptions.find(item => item.id === this.selectedAmmunitionId)) }));
            this._updateTotals(html);
        });

        html.find('.defense-timing-btn').click(ev => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            this.defenseTiming = `${btn.data('defense-timing') || 'before'}`;
            html.find('.defense-timing-btn').removeClass('active');
            btn.addClass('active');
            this._updateTotals(html);
        });

        // Inicializa
        this._updateTotals(html);
    }

    _applyPurposeVisibility(html) {
        const input = html.find('.purpose-search-input');
        input.trigger('input');
    }

    _applyMenuState(html) {
        html.toggleClass('modifiers-collapsed', this.isMenuCollapsed);
        const toggleBtn = html.find('.menu-toggle-btn');
        toggleBtn.attr('aria-expanded', String(!this.isMenuCollapsed));
        const width = this.isMenuCollapsed ? GurpsRollPrompt.COLLAPSED_WIDTH : GurpsRollPrompt.EXPANDED_WIDTH;
        this.setPosition({ width });
    }

    async _reloadSemanticModifiers() {
        this.selectedModifiers = this.selectedModifiers.filter(mod => !mod.isGM && !mod.isEffect && !mod.isCounterEffect);
        this._loadGMModifiers();
        this._loadEffectModifiers();
        this._loadTargetCounterModifiers();
        this._composeSemanticModifiers();
        this._refreshRelatedPurposeIds();
    }

    _updateTotals(html) {
        const base = parseInt(this.currentBaseValue) || parseInt(this.rollData.value) || 10;
        let manual = parseInt(html.find('input[name="manualMod"]').val()) || 0;
        const ordinaryFixedModifier = parseInt(this.rollData.fixedModifier) || 0;
        const ammunitionModifier = ammunitionRollModifier(this.ammunitionOptions.find(item => item.id === this.selectedAmmunitionId));
        const fixedModifier = ordinaryFixedModifier + ammunitionModifier;
        const fixedModifierLabel = this.rollData.fixedModifierLabel || "Fixo";
        let selected = 0;
        let activeCaps = [];
        const baseChanged = this.currentBaseKey !== this.baseDefaultKey;

        // 1. Soma os modificadores e coleta os tetos
        this.selectedModifiers.forEach(m => {
            selected += m.value;
            if (m.nh_cap !== undefined && m.nh_cap !== null && m.nh_cap !== "") {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
        });
        
        const totalMod = fixedModifier + manual + selected;
        const defenseActive = this.defenseMode !== "normal";
        
        // 2. Calcula o valor matemático (sem corte)
        let mathValue = base + totalMod;
        if (defenseActive) {
            if (this.defenseTiming === "before") {
                const convertedBefore = this._convertToDefenseValue(base + totalMod);
                mathValue = convertedBefore;
            } else {
                const convertedAfter = this._convertToDefenseValue(base);
                mathValue = convertedAfter + totalMod;
            }
        }
        let final = mathValue;
        let capText = "";
        let isCapped = false;

        // 3. Aplica a Regra do Teto
        if (activeCaps.length > 0) {
            const lowestCap = Math.min(...activeCaps);
            if (final > lowestCap) {
                final = lowestCap;
                isCapped = true;
                // Texto explícito para o usuário
                capText = `Teto Aplicado: ${lowestCap}`;
            }
        }

        // --- ATUALIZAÇÃO VISUAL ---

        const stackContainer = html.find('.active-mods-list');
        stackContainer.empty();

        if (baseChanged) {
            stackContainer.append(`<span class="mod-tag locked base-attr-tag">Base: ${this.currentBaseLabel}</span>`);
        }

        if (manual !== 0) {
            stackContainer.append(`<span class="mod-tag locked">Manual <strong>${manual > 0 ? '+' : ''}${manual}</strong></span>`);
        }

        if (ordinaryFixedModifier !== 0) {
            stackContainer.append(`<span class="mod-tag locked gm-locked">${fixedModifierLabel} <strong>${ordinaryFixedModifier > 0 ? '+' : ''}${ordinaryFixedModifier}</strong></span>`);
        }
        if (ammunitionModifier !== 0) stackContainer.append(`<span class="mod-tag locked">${game.i18n.localize("GUM.Equipment.Ammunition.Label")} <strong>${ammunitionModifier > 0 ? '+' : ''}${ammunitionModifier}</strong></span>`);
        
        if (this.selectedModifiers.length === 0 && manual === 0 && fixedModifier === 0 && !baseChanged) {
             stackContainer.append(`<span class="empty-stack-msg" style="color:#666; font-style:italic; font-size:0.8em;">Nenhum modificador.</span>`);
        }

        if (this.counterEffectsNotice) {
            stackContainer.append(`<span class="mod-tag locked" title="Regra de alvo único para contra-efeitos.">${this.counterEffectsNotice}</span>`);
        }

        this.selectedModifiers.forEach(m => {
            let capBadge = m.nh_cap ? `<span class="stack-cap" style="font-size:0.8em; opacity:0.7; margin-right:3px;">[↓${m.nh_cap}]</span>` : '';
            const tagClass = m.isGM ? 'gm-locked' : (m.isEffect ? 'gm-locked' : '');
            const sourceLabel = m.sourceLabel || (m.isCounterEffect ? m.counterSource : "");
            const compositionNote = m.compositionSuppressedCount
                ? `${m.compositionSuppressedCount} fonte(s) equivalente(s) suprimida(s)` : "";
            const titleText = [sourceLabel ? `Origem: ${sourceLabel}` : "", compositionNote].filter(Boolean).join(" · ");
            const title = titleText ? ` title="${foundry.utils.escapeHTML(titleText)}"` : '';
            const safeLabel = foundry.utils.escapeHTML((m.label || "").toString());
            const tag = $(`<span class="mod-tag ${tagClass}"${title}>${capBadge}${safeLabel} <strong>${m.value > 0 ? '+' : ''}${m.value}</strong></span>`);
            tag.click(() => {
                const idx = this.selectedModifiers.findIndex(x => x.id === m.id);
                if (idx >= 0) this.selectedModifiers.splice(idx, 1);
                html.find(`.mod-btn[data-id="${m.id}"]`).removeClass('active');
                this._updateTotals(html);
            });
            stackContainer.append(tag);
        });

        // Cores do Modificador Total
const color = totalMod > 0 ? 'var(--c-accent-gold)' : (totalMod < 0 ? '#e57373' : '#777');
        html.find('.total-mod-val').text((totalMod >= 0 ? '+' : '') + totalMod).css('color', color);

        html.find('.base-value-box .value').text(base);
        const currentOption = this.baseAttributeOptionsMap.get(this.currentBaseKey);
        html.find('.base-attr-label').text(this._buildBaseDetailLabel(currentOption));
        if (!defenseActive) {
            html.find('.base-summary').text(`Base ${base}`);
        } else {
            const modeLabel = this.defenseMode === "defense_standard" ? "Defesa Padrão" : "Defesa Simples";
            const timingLabel = this.defenseTiming === "before" ? "antes" : "depois";
            html.find('.base-summary').text(`${modeLabel} (${timingLabel}) de Base ${base}`);
        }
        
        // Atualiza Valor Final
        const finalEl = html.find('.final-val');
        finalEl.text(final);
        html.find('.calc-label').text(defenseActive ? 'DEFESA FINAL' : 'NH FINAL');
        
        // Atualiza Aviso de Teto
        const capEl = html.find('.cap-warning');
        
        if (isCapped) {
            // Visual de "Cortado"
            capEl.html(`<i class="fas fa-exclamation-triangle"></i> ${capText}`).slideDown(150);
            
            finalEl.css('color', '#e57373'); // Vermelho
            finalEl.addClass('is-capped'); // Classe para CSS extra (riscado, etc)
            
            // Dica: Mostra o valor original no title
            finalEl.attr('title', `Valor original: ${mathValue} (Reduzido pelo teto)`);
        } else {
            // Visual Normal
            capEl.slideUp(150);
            finalEl.css('color', 'var(--c-accent-gold)');
            finalEl.removeClass('is-capped');
            finalEl.attr('title', '');
        }
    }

     async _onOpenReferenceLink(event) {
        event.preventDefault();
        event.stopPropagation();

        const rawRef = (event.currentTarget?.dataset?.ref ?? '').toString().trim();
        if (!rawRef) return ui.notifications.warn("Preencha o campo REF antes de abrir a referência.");

        const parsedList = this._parseReferenceCodes(rawRef);
        if (!parsedList.length) return ui.notifications.warn("Formato de REF inválido. Use ex.: BA23 ou BA23, MA45.");

        if (parsedList.length === 1) return this._openSingleReference(parsedList[0]);
        return this._promptMultipleReferences(parsedList);
    }

    _parseReferenceCodes(rawRef) {
        const text = (rawRef ?? "").toString().trim().toUpperCase();
        if (!text) return [];

        const parts = text.split(/[,;]+|\s+/).map(s => s.trim()).filter(Boolean);
        const out = [];
        for (const part of parts) {
            const normalized = part.replace(/\s+/g, "");
            const delimitedMatch = normalized.match(/^([A-Z]+\d*)[:.](\d+)$/);
            const compactMatch = normalized.match(/^([A-Z]+)(\d+)$/);
            const match = delimitedMatch || compactMatch;
            if (!match) continue;
            out.push({ code: match[1], page: Number(match[2]), label: normalized });
        }
        return out;
    }

    _findPdfPageByCode(code) {
        const journals = game.journal ? Array.from(game.journal) : [];

        for (const journal of journals) {
            const pages = journal?.pages ? Array.from(journal.pages) : [];
            for (const page of pages) {
                if (page?.type !== 'pdf') continue;

                const pageCode = (page.getFlag('gum', 'pdfCode') ?? '').toString().trim().toUpperCase();
                if (!pageCode || pageCode !== code) continue;

                return {
                    journal,
                    page,
                    pageOffset: Number(page.getFlag('gum', 'pageOffset') ?? 0)
                };
            }
        }

        return null;
    }

    _findPdfViewerIframesBySource(sourcePath) {
        const iframes = Array.from(document.querySelectorAll("iframe"));
        if (!iframes.length) return [];

        const want = (sourcePath || "").toString();
        const wantName = want.split("/").pop();

        const matches = (candidate) => {
            if (!candidate) return false;
            if (!want) return true;

            if (candidate.includes(want)) return true;

            if (wantName && (candidate.includes(wantName) || candidate.includes(encodeURIComponent(wantName)))) return true;

            try {
                const u = new URL(candidate, window.location.origin);
                const file = u.searchParams.get("file");
                if (!file) return false;
                const decoded = decodeURIComponent(file);
                return decoded.includes(want) || (wantName && decoded.includes(wantName));
            } catch (_e) {
                return false;
            }
        };

        return iframes.filter((f) => {
            const src = f.getAttribute("src") || "";
            const dataSrc = f.getAttribute("data-src") || f.getAttribute("data-url") || f.dataset?.src || f.dataset?.url || "";
            const cand = src || dataSrc;
            if (!cand) return false;

            const looksLikePdfViewer = /pdfjs|viewer\.html/i.test(cand);
            if (!looksLikePdfViewer) return false;

            return matches(cand);
        });
    }

    _setPageOnPdfViewerIframe(iframe, page) {
        if (!(iframe instanceof HTMLIFrameElement)) return false;
        const target = Math.max(1, Number(page) || 1);

        try {
            const app = iframe.contentWindow?.PDFViewerApplication;
            if (app?.pdfViewer) {
                app.pdfViewer.currentPageNumber = target;
                app.page = target;
                return true;
            }
        } catch (_e) {
            // sandbox/cross-origin ou ainda não carregou
        }

        const current = iframe.getAttribute("src") || "";
        const dataSrc = iframe.getAttribute("data-src") || iframe.getAttribute("data-url") || iframe.dataset?.src || iframe.dataset?.url || "";
        const candidate = current || dataSrc;
        if (!candidate) return false;

        const updated = (() => {
            const [base, rawHash = ""] = candidate.split("#");
            const params = new URLSearchParams(rawHash);
            params.set("page", String(target));
            return `${base}#${params.toString()}`;
        })();

        if (dataSrc) {
            iframe.setAttribute("data-src", updated);
            iframe.setAttribute("data-url", updated);
            iframe.dataset.src = updated;
            iframe.dataset.url = updated;
        }
        iframe.setAttribute("src", updated);

        return true;
    }

    async _openPdfReferencePage(page, targetPage) {
        const journal = page?.parent;
        if (!journal) return false;

        const target = Math.max(1, Number(targetPage) || 1);
        const sourcePath = (page.src ?? page.system?.src ?? "").toString();

        await journal.sheet.render(true, { pageId: page.id, mode: "view" });

        const tryPosition = () => {
            const frames = this._findPdfViewerIframesBySource(sourcePath);
            const fallback = frames.length
                ? frames
                : Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]'));
            if (!fallback.length) return false;

            let ok = false;
            for (const f of fallback) ok = this._setPageOnPdfViewerIframe(f, target) || ok;
            return ok;
        };

        const delays = [0, 80, 180, 350, 600, 900, 1300, 1800, 2500];
        for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            if (tryPosition()) return true;
        }

        const frames = this._findPdfViewerIframesBySource(sourcePath);
        for (const f of frames) {
            f.addEventListener("load", () => {
                try { this._setPageOnPdfViewerIframe(f, target); } catch (_e) {}
            }, { once: true });
        }

        return false;
    }

    async _openSingleReference(parsed) {
        const match = this._findPdfPageByCode(parsed.code);
        if (!match) {
            return ui.notifications.warn(`Nenhum PDF com código "${parsed.code}" foi encontrado nos periódicos.`);
        }

        const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
        await this._openPdfReferencePage(match.page, pageNumber);
    }

    _promptMultipleReferences(parsedList) {
        const buttons = {};
        const missing = [];

        for (const parsed of parsedList) {
            const match = this._findPdfPageByCode(parsed.code);
            if (!match) {
                missing.push(parsed.label || `${parsed.code}${parsed.page}`);
                continue;
            }

            const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
            const key = parsed.label || `${parsed.code}${parsed.page}`;

            buttons[key] = {
                label: key,
                callback: () => this._openPdfReferencePage(match.page, pageNumber)
            };
        }

        if (!Object.keys(buttons).length) {
            return ui.notifications.warn("Nenhuma das referências informadas foi encontrada nos periódicos.");
        }

        const missingHtml = missing.length
            ? `<p style="opacity:.8;margin-top:.5rem"><b>Não encontradas:</b> ${missing.join(", ")}</p>`
            : "";

        new Dialog({
            title: "Múltiplas Referências",
            content: `<p>Escolha qual referência deseja abrir:</p>${missingHtml}`,
            buttons,
            default: Object.keys(buttons)[0]
        }).render(true);
    }


async _updateObject(event, formData) {
        const manualMod = parseInt(formData.manualMod) || 0;
        const fixedModifier = (parseInt(this.rollData.fixedModifier) || 0) + ammunitionRollModifier(this.ammunitionOptions.find(item => item.id === this.selectedAmmunitionId));
        let buttonsMod = 0;
        let activeCaps = [];
        const baseValue = parseInt(this.currentBaseValue) || parseInt(this.rollData.value) || 10;

        this.selectedModifiers.forEach(m => {
            buttonsMod += m.value;
            // Verifica o cap de forma segura
            if (m.nh_cap !== undefined && m.nh_cap !== null && m.nh_cap !== "") {
                const cap = parseInt(m.nh_cap);
                if (!isNaN(cap)) activeCaps.push(cap);
            }
        });

        const totalMod = fixedModifier + manualMod + buttonsMod;
        const defenseActive = this.defenseMode !== "normal";
        let computedValue = baseValue + totalMod;
        if (defenseActive) {
            if (this.defenseTiming === "before") computedValue = this._convertToDefenseValue(baseValue + totalMod);
            else computedValue = this._convertToDefenseValue(baseValue) + totalMod;
        }
        
        // Calcula qual é o teto mais baixo (ou Infinity se não tiver nenhum)
        let lowestCap = Infinity;
        if (activeCaps.length > 0) {
            lowestCap = Math.min(...activeCaps);
        }

        // Importante: Não precisamos calcular o 'finalValue' cortado aqui,
        // pois vamos mandar o 'lowestCap' para o main.js fazer a matemática visual correta.
        
const rollPayload = {
            ...this.rollData,
            ammunitionId: this.selectedAmmunitionId || null,
            ammunitionModifierIncluded: this.ammunitionOptions.length > 0,
            ammunitionPromptModifier: ammunitionRollModifier(this.ammunitionOptions.find(item => item.id === this.selectedAmmunitionId)),
            // Enviamos o valor matemático puro, o performGURPSRoll aplica o corte visualmente
            value: computedValue,
            originalValue: baseValue,
            modifier: totalMod,
            defenseMode: this.defenseMode,
            defenseTiming: this.defenseTiming
        };
        Object.assign(rollPayload, this._getRollMetadata());
        rollPayload.purposeIds = normalizePurposeIds(rollPayload.purposeIds);
        rollPayload.requestedPurposeIds = normalizePurposeIds(this.requestedPurposeIds);
        const rollOptions = {
            ignoreGlobals: true, // Já processamos os globais aqui no prompt
            effectiveCap: lowestCap, // ✅ O SEGREDO: Enviamos o teto calculado aqui!
            rollMode: this.rollMode
        };

        if (typeof this.onRoll === "function") {
            await this.onRoll(this.actor, rollPayload, rollOptions);
            return;
        }

        performGURPSRoll(this.actor, rollPayload, rollOptions);
    }

    _convertToDefenseValue(value) {
        const baseHalf = Math.floor((parseInt(value) || 0) / 2);
        if (this.defenseMode === "defense_standard") return baseHalf + 3;
        if (this.defenseMode === "defense_simple") return baseHalf;
        return parseInt(value) || 0;
    }
}
