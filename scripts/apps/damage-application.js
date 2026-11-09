import { applyContingentCondition, applyCurrentRollPrivacy, evaluateNumericFormula } from "../main.js";
import { applySingleEffect } from "../effects-engine.js";
import { getBodyProfile, getBodyProfileLocationKeys, localizeBodyLocationLabel } from "../../module/config/body-profiles.js";
import { getActiveEffectFlagSources, hasActiveEffectFlag } from "../../module/utils/active-effect-flags.mjs";
import { resolveCharacterImage } from "../../module/utils/character-image.mjs";
import { evaluateBarrierConsequence, normalizeResistanceRoll } from "../../module/utils/roll-request-data.mjs";
import { executeRollRequest } from "../../module/services/roll-request-service.js";
import { getPurposeLabels } from "../../module/utils/roll-purposes.mjs";
import { renderPendingResistanceRequest } from "../../module/utils/roll-request-view.mjs";
import { buildDamageNatureSearchOptions, formatDamageNature, resolveDamageNature } from "../../module/utils/damage-nature.mjs";
import { equipmentIntegrityCurrentUpdate, equipmentIntegrityRecord, equipmentLinkedReserve, equipmentReserveBalanceUpdate } from "../../module/utils/equipment-resolution.mjs";
import { buildDamageApplicationEvent, calculateShockPenalty, classifyDamageTargetPool } from "../../module/utils/damage-application-event.mjs";
import { GUM_API_HOOKS, emitGumLifecycleHook, resolveGumSourceToken } from "../../module/api/gum-hooks.mjs";

export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        this.attackerToken = options.attackerToken ?? null;
        this.targetToken = options.targetToken ?? null;
        
        this.effectState = {};
        this.isApplying = false;
        this.pendingResistanceEffects = new Set();
        this.isDialogClosed = false;

        this.state = {
            finalInjury: 0,
            targetDR: 0,
            activeDamageKey: 'main'
        };

 this.options.title = game.i18n.format("GUM.DamageApplication.Title", { name: this.targetActor?.name || game.i18n.localize("GUM.DamageApplication.Target") });
    }

    _t(key) { return game.i18n.localize(`GUM.DamageApplication.${key}`); }
    _f(key, data) { return game.i18n.format(`GUM.DamageApplication.${key}`, data); }

    _attackerImage() {
        return resolveCharacterImage(this.attackerActor, {
            token: this.attackerToken,
            tokenImg: this.damageData.attackerTokenImg,
            sourceActor: game.actors.get(this.attackerActor?.id)
        });
    }

    _targetImage() {
        return resolveCharacterImage(this.targetActor, {
            token: this.targetToken,
            sourceActor: game.actors.get(this.targetActor?.id)
        });
    }

async _resolveOnDamageEffects() {
        const resolved = [];
        const effects = this.damageData.onDamageEffects || {};

        const entries = Array.isArray(effects)
            ? effects.map((data, index) => [data?.id ?? `effect-${index}`, data])
            : Object.entries(effects);

        const seenEffectUuids = new Set();

        for (const [id, data] of entries) {
            if (!data) continue;
            const effectUuid = data.effectUuid || data.uuid;

            if (effectUuid) {
                if (seenEffectUuids.has(effectUuid)) continue;
                seenEffectUuids.add(effectUuid);
            }

            let effectItem = null;
            if (effectUuid) {
                effectItem = await fromUuid(effectUuid).catch(() => null);
            }

            const activationChance = (data.activationChance === undefined || data.activationChance === null || data.activationChance === "")
                ? 100
                : (parseInt(data.activationChance) || 0);

            resolved.push({
                id: id ?? data.id,
                ...data,
                effectUuid,
                item: effectItem,
                minInjury: parseInt(data.minInjury) || 0,
                activationChance,
                requiredDamageType: (data.requiredDamageType || "").toLowerCase().trim()
            });
        }

        return resolved;
    }

     _toNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === "") return fallback;
        const normalized = String(value).replace(",", ".").replace(/[^0-9.+-]/g, "");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    _formatWeight(value) {
        const numeric = this._toNumber(value, 0);
        return numeric.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    _getSourceAttackWeight() {
        const explicitWeight = this._toNumber(this.damageData?.sourceWeight, NaN);
        if (Number.isFinite(explicitWeight) && explicitWeight > 0) return explicitWeight;

        const sourceItemId = this.damageData?.sourceItemId || this.damageData?.itemId;
        const item = sourceItemId && this.attackerActor?.items?.get ? this.attackerActor.items.get(sourceItemId) : null;
        return this._toNumber(item?.system?.weight, 0);
    }

    _hasDefenseAttackMode(item) {
        const meleeAttacks = item?.system?.melee_attacks || {};
        return Object.values(meleeAttacks).some(attack => attack && typeof attack === "object");
    }

    _getDefenseOptions() {
        if (!this.targetActor?.items) return [];

        return this.targetActor.items
            .filter(item => ["equipment", "melee_weapon", "ranged_weapon"].includes(item.type))
            .filter(item => this._hasDefenseAttackMode(item))
            .filter(item => this._toNumber(item.system?.weight, 0) > 0)
            .sort((a, b) => {
                const aEquipped = a.system?.equipped === true ? 0 : 1;
                const bEquipped = b.system?.equipped === true ? 0 : 1;
                if (aEquipped !== bEquipped) return aEquipped - bEquipped;
                return a.name.localeCompare(b.name);
            })
            .map(item => ({
                id: item.id,
                name: item.name,
                weight: this._toNumber(item.system?.weight, 0),
                equipped: item.system?.equipped === true,
                defenseBonus: this._toNumber(item.system?.defense_bonus, 0)
            }));
    }

    _evaluateHeavyWeaponDefense({ attackWeight, defenseWeight, basicLift, defenseMode, quality }) {
        const absoluteLimit = defenseMode === "two-handed" ? basicLift * 2 : basicLift;
        const exceedsAbsoluteLimit = attackWeight > 0 && absoluteLimit > 0 && attackWeight > absoluteLimit;
        const ratio = defenseWeight > 0 ? attackWeight / defenseWeight : Infinity;

        let baseBreakChance = 0;
        if (ratio >= 7) baseBreakChance = 6;
        else if (ratio >= 6) baseBreakChance = 5;
        else if (ratio >= 5) baseBreakChance = 4;
        else if (ratio >= 4) baseBreakChance = 3;
        else if (ratio >= 3) baseBreakChance = 2;

        const qualityModifier = {
            cheap: 2,
            normal: 0,
            fine: -1,
            veryFine: -2
        }[quality] ?? 0;

        const adjustedBreakChance = baseBreakChance > 0 ? baseBreakChance + qualityModifier : 0;

        return {
            absoluteLimit,
            exceedsAbsoluteLimit,
            ratio,
            baseBreakChance,
            adjustedBreakChance,
            offersNoResistance: adjustedBreakChance > 6
        };
    }

    _updateHeavyWeaponDefenseAdvisor(form) {
        const advisor = form.querySelector(".heavy-defense-advisor");
        if (!advisor) return null;

        const attackWeightInput = form.querySelector('[name="heavy_attack_weight"]');
        const defenseWeightInput = form.querySelector('[name="heavy_defense_weight"]');
        const basicLiftInput = form.querySelector('[name="heavy_basic_lift"]');
        const defenseModeInput = form.querySelector('[name="heavy_defense_mode"]');
        const qualityInput = form.querySelector('[name="heavy_defense_quality"]');
        const summaryEl = form.querySelector(".heavy-defense-summary");

        const attackWeight = this._toNumber(attackWeightInput?.value, 0);
        const defenseWeight = this._toNumber(defenseWeightInput?.value, 0);
        const basicLift = this._toNumber(basicLiftInput?.value, this._toNumber(this.targetActor?.system?.attributes?.basic_lift?.value, 0));
        const defenseMode = defenseModeInput?.value || "one-handed";
        const quality = qualityInput?.value || "normal";

        if (!attackWeight || !defenseWeight || !basicLift) {
            advisor.dataset.status = "incomplete";
            if (summaryEl) summaryEl.textContent = this._t("HeavyIncomplete");
            return null;
        }

        const result = this._evaluateHeavyWeaponDefense({ attackWeight, defenseWeight, basicLift, defenseMode, quality });
        const ratioText = Number.isFinite(result.ratio) ? result.ratio.toFixed(2).replace(".", ",") : "∞";
        let status = "ok";
        let headline = this._t("HeavyOK");
        const details = [
            this._f("HeavyRatio", { attack: this._formatWeight(attackWeight), defense: this._formatWeight(defenseWeight), ratio: ratioText }),
            this._f("HeavyLimit", { lift: this._formatWeight(basicLift), limit: this._formatWeight(result.absoluteLimit) })
        ];

        if (result.exceedsAbsoluteLimit) {
            status = "danger";
            headline = this._t("HeavyExceeded");
            details.push(this._t("HeavyExceededDetail"));
        } else if (result.offersNoResistance) {
            status = "danger";
            headline = this._t("HeavyNoResistance");
            details.push(this._f("HeavyNoResistanceDetail", { chance: result.adjustedBreakChance }));
        } else if (result.adjustedBreakChance > 0) {
            status = "warning";
            headline = this._t("HeavyRisk");
            details.push(this._f("HeavyRiskDetail", { chance: result.adjustedBreakChance, base: result.adjustedBreakChance !== result.baseBreakChance ? this._f("HeavyBaseChance", { chance: result.baseBreakChance }) : "" }));
            details.push(this._t("HeavyRiskDefense"));
        } else {
            details.push(this._t("HeavyNoRisk"));
        }

        advisor.dataset.status = status;
        if (summaryEl) {
            summaryEl.innerHTML = `<strong>${headline}</strong><ul>${details.map(detail => `<li>${detail}</li>`).join("")}</ul>`;
        }
        return { ...result, attackWeight, defenseWeight, basicLift, status, headline };
    }


    _normalizeLookupText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    _getTargetAttributeValue(attributeKey, fallback = 10) {
        const attr = this.targetActor?.system?.attributes?.[attributeKey] || {};
        return this._toNumber(attr.final ?? attr.value ?? attr.passive, fallback);
    }

    _getTargetSkillLevel(skillNames) {
        const normalizedNames = skillNames.map(name => this._normalizeLookupText(name));
        const skill = this.targetActor?.items?.find?.(item => {
            if (item.type !== "skill") return false;
            const itemName = this._normalizeLookupText(item.name);
            return normalizedNames.some(name => itemName === name || itemName.includes(name));
        });
        return skill ? this._toNumber(skill.system?.final_nh ?? skill.system?.skill_level, 0) : 0;
    }

    _targetHasPerfectBalance() {
        return !!this.targetActor?.items?.some?.(item => {
            if (item.type !== "advantage") return false;
            const name = this._normalizeLookupText(item.name);
            return name.includes("equilibrio perfeito") || name.includes("perfect balance");
        });
    }

    _evaluateKnockback({ basicDamage, targetST, useHP, damageType, penetratedDR, onlyKnockback, perfectBalance }) {
        const normalizedType = this._normalizeLookupText(damageType);
        const isCrushing = ["cont", "contusao", "cr", "crushing"].includes(normalizedType);
        const isCutting = ["cort", "corte", "cut", "cutting"].includes(normalizedType);
        const eligible = isCrushing || (isCutting && !penetratedDR) || onlyKnockback;
        const resistanceValue = Math.max(0, this._toNumber(targetST, 0));
        const threshold = resistanceValue <= 3 ? 1 : Math.max(1, resistanceValue - 2);
        const distance = eligible ? Math.floor(Math.max(0, basicDamage) / threshold) : 0;
        const fallPenalty = distance > 1 ? -(distance - 1) : 0;
        const dx = this._getTargetAttributeValue("dx", 10);
        const acrobatics = this._getTargetSkillLevel(["Acrobacia", "Acrobatics"]);
        const judo = this._getTargetSkillLevel(["Judô", "Judo", "Judô"]);
        const bestBase = Math.max(dx, acrobatics, judo);
        const balanceBonus = perfectBalance ? 4 : 0;
        return { eligible, isCrushing, isCutting, threshold, distance, fallPenalty, dx, acrobatics, judo, bestBase, balanceBonus, targetNumber: bestBase + fallPenalty + balanceBonus, usesHp: useHP };
    }

    _updateKnockbackAdvisor(form, { basicDamage, damageTypeKey, penetratingDamage } = {}) {
        const advisor = form.querySelector(".knockback-advisor");
        if (!advisor) return null;
        const stInput = form.querySelector('[name="knockback_target_st"]');
        const useHpInput = form.querySelector('[name="knockback_use_hp"]');
        const onlyKnockbackInput = form.querySelector('[name="special_only_knockback"]');
        const perfectBalanceInput = form.querySelector('[name="knockback_perfect_balance"]');
        const summaryEl = form.querySelector(".knockback-summary");
        const useHP = !!useHpInput?.checked;
        const targetST = this._toNumber(stInput?.value, useHP ? this._toNumber(this.targetActor?.system?.attributes?.hp?.final, 0) : this._getTargetAttributeValue("st", 10));
        const result = this._evaluateKnockback({ basicDamage: this._toNumber(basicDamage, 0), targetST, useHP, damageType: damageTypeKey, penetratedDR: penetratingDamage > 0, onlyKnockback: !!onlyKnockbackInput?.checked, perfectBalance: !!perfectBalanceInput?.checked });
        let status = result.distance > 0 ? "warning" : "ok";
        if (!result.eligible) status = "incomplete";
        const typeReason = result.eligible
            ? this._t(onlyKnockbackInput?.checked ? "KnockbackOnlyReason" : result.isCrushing ? "KnockbackCrushingReason" : "KnockbackCuttingReason")
            : this._t("KnockbackIneligible");
        const details = [
            typeReason,
            this._f("KnockbackDistance", { damage: Math.floor(this._toNumber(basicDamage, 0)), threshold: result.threshold, distance: result.distance }),
            result.distance > 0
                ? this._f("KnockbackFall", { dx: result.dx, acrobatics: result.acrobatics || "—", judo: result.judo || "—", penalty: result.fallPenalty, balance: result.balanceBonus ? `${this._t("PerfectBalance")}. ` : "", target: result.targetNumber })
                : this._t("KnockbackNoDistance")
        ];
        if (result.distance > 0) details.push(this._t("KnockbackCollision"));
        advisor.dataset.status = status;
        if (summaryEl) summaryEl.innerHTML = `<strong>${this._f("KnockbackEstimated", { distance: result.distance })}</strong><ul>${details.map(detail => `<li>${detail}</li>`).join("")}</ul>`;
        return { ...result, status };
    }


    _getDynamicDR(locationKey, damageType) {
        if (!locationKey) return 0;
        // Custom DR comes from user input
        if (locationKey === 'custom') {
            const customInput = this.form?.querySelector('input[name="custom_dr"]');
            return parseInt(customInput?.value || 0);
        }

        // Pull DR data from actor (supports per-type modifiers)
        const drData = foundry.utils.getProperty(this.targetActor, `system.combat.dr_locations.${locationKey}`) || {};
        const baseDR = typeof drData === "object" ? (parseInt(drData.base) || 0) : (parseInt(drData) || 0);
        if (!damageType || damageType === "base") return baseDR;

        const typeMod = typeof drData === "object" ? (parseInt(drData[damageType]) || 0) : 0;
 return Math.max(0, baseDR + typeMod);
    }

    _getDRSignature(drObject) {
        if (!drObject || typeof drObject !== "object") {
            const base = Number(drObject) || 0;
            return base ? JSON.stringify([["base", base]]) : "[]";
        }
        const normalized = {};
        for (const [key, value] of Object.entries(drObject)) {
            const numeric = Number(value) || 0;
            if (numeric === 0) continue;
            normalized[key] = numeric;
        }
const sortedEntries = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(sortedEntries);
    }

    _getLargeAreaInjuryDR(form, damageTypeKey) {
        const torsoDR = this._getDynamicDR("torso", damageTypeKey);
        const markedRow = form.querySelector(".location-row.large-area-selected")
            || form.querySelector(".location-row.active")
            || form.querySelector('.location-row[data-location-key="torso"]');
        const markedLocationKey = markedRow?.dataset.locationKey || "torso";
        let markedDR = torsoDR;

        if (markedLocationKey === "custom") {
            const customDR = parseInt(form.querySelector('input[name="custom_dr"]')?.value);
            markedDR = isNaN(customDR) ? 0 : Math.max(0, customDR);
        } else {
            markedDR = Math.max(0, this._getDynamicDR(markedLocationKey, damageTypeKey));
        }

        return {
            torsoDR,
            markedDR,
            markedLocationKey,
            markedLabel: markedRow?.querySelector(".label")?.textContent?.trim() || "Torso",
            effectiveDR: Math.ceil((torsoDR + markedDR) / 2)
        };
    }

    _buildLocationRows(profile, drLocations, effectiveLocations = null) {
        const locationsData = effectiveLocations?.definitions || profile.locations || {};
        const locationOrder = effectiveLocations?.order || getBodyProfileLocationKeys(profile);

        const items = [];
        for (const key of locationOrder) {
            const data = locationsData[key];
            if (!data) continue;
            const drData = drLocations[key] || {};
            const baseDR = typeof drData === "object" ? (parseInt(drData.base) || 0) : (parseInt(drData) || 0);

            items.push({
                key,
                label: localizeBodyLocationLabel(key, data, localizationKey => game.i18n.localize(localizationKey)),
                roll: data.roll ?? "--",
                totalDR: baseDR,
                groupKey: data.groupKey,
                groupLabel: data.groupLabel,
                groupPlural: data.groupPlural,
                drSignature: this._getDRSignature(drData)
            });
        }

        const groupedKeys = new Set();
        const groups = new Map();

        for (const item of items) {
            if (!item.groupKey) continue;
            if (!groups.has(item.groupKey)) groups.set(item.groupKey, []);
            groups.get(item.groupKey).push(item);
        }

        const groupSummaries = new Map();
        for (const [groupKey, groupItems] of groups.entries()) {
            if (groupItems.length < 2) continue;
            const signature = groupItems[0].drSignature;
            const isUniform = groupItems.every(member => member.drSignature === signature);
            if (!isUniform) continue;
            groupItems.forEach(member => groupedKeys.add(member.key));

            const labelBase = groupItems[0].groupPlural || groupItems[0].groupLabel || groupKey;
            const rollLabel = groupItems.map(member => member.roll).filter(Boolean).join(", ");
            const groupTranslationKey = `GUM.Combat.DR.BodyPartPlurals.${groupKey}`;
            const groupTranslation = game.i18n.localize(groupTranslationKey);
            groupSummaries.set(groupKey, {
                key: groupItems[0].key,
                isGroup: true,
                label: `${groupTranslation === groupTranslationKey ? labelBase : groupTranslation} (${groupItems.length})`,
                roll: rollLabel || "--",
                totalDR: groupItems[0].totalDR
            });
        }

        const rows = [];
        const renderedGroups = new Set();
        for (const item of items) {
            if (item.groupKey && groupSummaries.has(item.groupKey)) {
                if (renderedGroups.has(item.groupKey)) continue;
                rows.push(groupSummaries.get(item.groupKey));
                renderedGroups.add(item.groupKey);
                continue;
            }
            if (groupedKeys.has(item.key)) continue;
            rows.push({
                key: item.key,
                label: item.label,
                roll: item.roll,
                totalDR: item.totalDR,
                isGroup: false
            });
        }

        return rows;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: game.i18n.localize("GUM.DamageApplication.ApplyDamage"),
            template: "systems/gum/templates/apps/damage-application.hbs",
            classes: ["dialog", "gurps", "damage-application-dialog"],
            width: 760,
            height: "auto",
            resizable: true,
            buttons: {}
        });
    }

    async getData() {
        // ... (Seu método getData, 100% preservado e sem alterações)
        const context = await super.getData();
        context.damage = this.damageData;
        context.ammunition = this.damageData.ammunition || null;
        context.rapidFire = this.damageData.rapidFire || null;
        context.natureOptions = buildDamageNatureSearchOptions();
        context.activeNature = formatDamageNature(this.damageData.main?.nature);
        context.attacker = {
            id: this.attackerActor?.id,
            name: this.attackerActor?.name,
            img: this._attackerImage()
        };
        context.target = {
            id: this.targetActor?.id,
            name: this.targetActor?.name,
            img: this._targetImage()
        };
        const ignoreShockSources = getActiveEffectFlagSources(this.targetActor, "ignoreShock");
        context.targetIgnoresShock = ignoreShockSources.length > 0;
        context.ignoreShockSourceNames = ignoreShockSources
            .map(effect => effect.name)
            .filter(Boolean)
            .join(", ");
        context.heavyDefense = {
            attackWeight: this._getSourceAttackWeight(),
            basicLift: this._toNumber(this.targetActor?.system?.attributes?.basic_lift?.value, 0),
            defenseOptions: this._getDefenseOptions()
        };

        context.knockback = {
            targetST: this._getTargetAttributeValue("st", 10),
            targetHP: this._toNumber(this.targetActor?.system?.attributes?.hp?.final, 0),
            hasPerfectBalance: this._targetHasPerfectBalance()
        };

        const damageablePools = [];
        damageablePools.push({ path: 'system.attributes.hp.value', label: this._t("HP") });
        damageablePools.push({ path: 'system.attributes.fp.value', label: this._t("FP") });
               const combatMeters = this.targetActor.system.combat.combat_meters || {};
        for (const [key, meter] of Object.entries(combatMeters)) {
            const meterPath = `system.combat.combat_meters.${key}.${meter.current !== undefined ? "current" : "value"}`;
            damageablePools.push({
                path: meterPath,
                label: meter.name,
                type: "combat-meter",
                dr: Math.max(0, Number(meter.dr) || 0)
            });
        }
        const spellReserves = this.targetActor.system.spell_reserves || {};
        for (const [key, reserve] of Object.entries(spellReserves)) {
            const reservePath = `system.spell_reserves.${key}.${reserve.current !== undefined ? "current" : "value"}`;
            damageablePools.push({ path: reservePath, label: `RM:${reserve.name}` });
        }
 const powerReserves = this.targetActor.system.power_reserves || {};
        for (const [key, reserve] of Object.entries(powerReserves)) {
            const reservePath = `system.power_reserves.${key}.${reserve.current !== undefined ? "current" : "value"}`;
            damageablePools.push({ path: reservePath, label: `RP:${reserve.name}` });
        }
        for (const item of this.targetActor.items.filter(entry => entry.type === "equipment")) {
            const reserve = equipmentLinkedReserve(item, item.system?.equipmentResolution);
            if (reserve) {
                const prefix = reserve.type === "spell" ? "RM" : reserve.type === "power" ? "RP" : "REG";
                damageablePools.push({ path: `equipment:${item.id}`, label: `${prefix}:${reserve.name}`, type: reserve.type === "combat" ? "combat-meter" : "equipment-reserve", dr: 0 });
            }
            const integrity = equipmentIntegrityRecord(item, item.system?.equipmentResolution);
            if (integrity) damageablePools.push({ path: `equipment-integrity:${item.id}`, label: `INT:${integrity.name}`, type: "combat-meter", dr: integrity.dr });
        }
        context.damageablePools = damageablePools;
        this.preparedOnDamageEffects = await this._resolveOnDamageEffects();
        game.gum = game.gum || {};
        game.gum.activeDamageApplication = this;
        (game.gum.damageApplications ??= new Map()).set(String(this.appId), this);
const profileId = this.targetActor.system.combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);
        const totalDrLocations = this.targetActor.system.combat.dr_locations || {};
        const effectiveLocations = {
            order: this.targetActor.system.combat?.dr_location_order || getBodyProfileLocationKeys(profile),
            definitions: this.targetActor.system.combat?.dr_location_definitions || profile.locations
        };

        context.locations = this._buildLocationRows(profile, totalDrLocations, effectiveLocations);

        context.locations.push({ key: "custom", label: this._t("OtherLocation"), roll: "--", totalDR: 0, custom: true });

        const hasNumericRoll = context.locations.some(loc => {
            const firstRoll = parseInt(loc.roll.split(/[,-]/)[0]);
            return !isNaN(firstRoll);
        });

        if (hasNumericRoll) {
            context.locations.sort((a, b) => {
                const firstRollA = parseInt(a.roll.split(/[,-]/)[0]);
                const firstRollB = parseInt(b.roll.split(/[,-]/)[0]);
                if (isNaN(firstRollA)) return 1;
                if (isNaN(firstRollB)) return -1;
                return firstRollA - firstRollB;
            });
        }
        const mainDamageType = this.damageData.main?.type?.toLowerCase() || '';
        const woundingModifiersList = ["qmd", "cor", "tox", "cont", "cort", "perf", "pi", "pi-", "pi+", "pi++"].map(abrev => ({ type: this._t(`Wounding.${abrev}`), abrev, mult: { cort: 1.5, perf: 2, "pi-": 0.5, "pi+": 1.5, "pi++": 2 }[abrev] ?? 1 }));
        let defaultModFound = false;
        context.woundingModifiers = woundingModifiersList.map(mod => { mod.checked = (mod.abrev === mainDamageType); if (mod.checked) defaultModFound = true; return mod; });
        context.noModChecked = !defaultModFound;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html[0];
        this.form = form;        

        const damageTargetPool = form.querySelector('[name="damage_target_pool"]');
        damageTargetPool?.addEventListener("change", () => {
            const selectedPool = damageTargetPool.selectedOptions?.[0];
            if (selectedPool?.dataset.poolType !== "combat-meter") return;
            const customDR = form.querySelector('input[name="custom_dr"]');
            if (customDR) {
                customDR.value = String(Math.max(0, Number(selectedPool.dataset.dr) || 0));
            }
            const customLocation = form.querySelector('.location-row[data-location-key="custom"]');
            customLocation?.click();
        });

// --- SEUS LISTENERS ORIGINAIS (INTACTOS) ---
        form.querySelectorAll('.damage-card').forEach(card => {
            card.addEventListener('click', ev => {
                form.querySelectorAll('.damage-card.active').forEach(c => c.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                const newDamage = this.damageData[ev.currentTarget.dataset.damageKey];
                const damageType = String(newDamage?.type || '').trim().toLowerCase();
                this.damageTypeAbrev = damageType || this.damageTypeAbrev;
                const applyAsHealCheckbox = form.querySelector('[name="special_apply_as_heal"]');
                if (damageType) {
                    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                    let matched = false;
                    allRadios.forEach(r => {
                        const abrev = r.closest('.wounding-row')?.dataset?.abrev?.toLowerCase() || '';
                        if (abrev === damageType) { r.checked = true; matched = true; }
                    });
                    if (!matched) { const noModRadio = form.querySelector('.wounding-row[data-wounding-kind="none"] input[name="wounding_mod_type"]'); if (noModRadio) noModRadio.checked = true; }

                    if (damageType === 'cura') {
                        const customRadio = form.querySelector('input[name="wounding_mod_type"][value="custom"]');
                        const customInput = form.querySelector('input[name="custom_wounding_mod"]');
                        if (customInput) customInput.value = 1;
                        if (customRadio) { customRadio.checked = true; matched = true; }
                        if (applyAsHealCheckbox) { applyAsHealCheckbox.checked = true; applyAsHealCheckbox.dataset.autoSet = "true"; }
                    } else if (applyAsHealCheckbox?.dataset.autoSet === "true") {
                        applyAsHealCheckbox.checked = false;
                        delete applyAsHealCheckbox.dataset.autoSet;
                    }
                } else {
                    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                    for (const r of allRadios) { if (r.closest('.wounding-row')?.dataset.woundingKind === 'none') { r.checked = true; break; } }
                }
                const damageInput = form.querySelector('[name="damage_rolled"]');
                const armorInput = form.querySelector('[name="armor_divisor"]');
                const natureInput = form.querySelector('[name="damage_nature"]');
                if (damageInput) damageInput.value = newDamage.total || 0;
                if (armorInput) armorInput.value = newDamage.armorDivisor || 1;
                if (natureInput) natureInput.value = formatDamageNature(newDamage.nature);
                this._updateDamageCalculation(form);
            });
        });

         form.querySelectorAll('.large-area-marker').forEach(marker => {
            marker.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const row = ev.currentTarget.closest('.location-row');
                form.querySelectorAll('.location-row.large-area-selected').forEach(r => r.classList.remove('large-area-selected'));
                if (row) row.classList.add('large-area-selected');
                this._updateDamageCalculation(form);
            });
        });

        const largeAreaCheckbox = form.querySelector('[name="large_area_injury"]');
        const syncLargeAreaMode = () => {
            const enabled = largeAreaCheckbox?.checked;
            form.classList.toggle('large-area-mode', !!enabled);
            if (enabled && !form.querySelector('.location-row.large-area-selected')) {
                const activeRow = form.querySelector('.location-row.active') || form.querySelector('.location-row[data-location-key="torso"]');
                if (activeRow) activeRow.classList.add('large-area-selected');
            }
        };
        largeAreaCheckbox?.addEventListener('change', () => {
            syncLargeAreaMode();
            this._updateDamageCalculation(form);
        });
        
        form.querySelectorAll('.location-row').forEach(row => {
            row.addEventListener('click', ev => {
                form.querySelectorAll('.location-row.active').forEach(r => r.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                const targetDR = ev.currentTarget.dataset.dr;
                form.querySelector('[name="target_dr"]').value = targetDR;
                const locationKey = ev.currentTarget.dataset.locationKey;
                const newMods = this._getAdjustedWoundingModifiers(locationKey);
                const modTable = form.querySelector('.wounding-table');

                if (modTable) {
                    const selectedRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
  let selectedAbrev = '';
                    if (selectedRadio) { 
                        selectedAbrev = selectedRadio.closest('.wounding-row')?.dataset?.abrev || '';
                        if (!selectedAbrev) {
                            const labelSpan = selectedRadio.closest('.wounding-row')?.querySelector('.type'); 
                            selectedAbrev = labelSpan?.textContent?.match(/\(([^)]+)\)/)?.[1] || ''; 
                        }
                    }

                    // 1. Constrói a parte dinâmica da lista
                    let htmlContent = newMods.map(mod => `<div class="wounding-row mod-group-${mod.group || 'x'}" data-abrev="${mod.abrev}"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}/><span class="type">${mod.type} (${mod.abrev})</span><span class="dots"></span><span class="mult">x${mod.mult}</span></label></div>`).join('');

                    // 2. Adiciona as opções estáticas ("Sem Modificador" e "Outros")
                    htmlContent += `<hr style="margin-top: 6px; margin-bottom: 6px;">`;

                    htmlContent += `
                        <div class="wounding-row" data-wounding-kind="none">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="1" ${selectedAbrev === '' ? 'checked' : ''}/>
                                <span>${this._t("Wounding.None")}</span>
                                <span class="dots"></span>
                                <span class="mult">x1</span>
                            </label>
                        </div>`;

                    htmlContent += `
                        <div class="wounding-row" data-wounding-kind="custom">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="custom"/>
                                <span>${this._t("Wounding.Custom")}:</span>
                                <input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/>
                            </label>
                        </div>`;

                    // 3. Insere o HTML completo na tabela
                    modTable.innerHTML = htmlContent;

                    // 4. Reativa os "ouvintes" nos novos botões que acabamos de criar
                    modTable.querySelectorAll('input[name="wounding_mod_type"]').forEach(input => {
                        input.addEventListener('change', () => this._updateDamageCalculation(form));
                    });

                    const customModInput = modTable.querySelector('input[name="custom_wounding_mod"]');
                    if (customModInput) {
                        customModInput.addEventListener('input', () => this._updateDamageCalculation(form));
                    }
                }
                
                this._updateDamageCalculation(form);
            });
        });
        
        form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => this._updateDamageCalculation(form));
            input.addEventListener('input', () => this._updateDamageCalculation(form));
        });

        const defenseItemSelect = form.querySelector('[name="heavy_defense_item"]');
        defenseItemSelect?.addEventListener('change', () => {
            const selected = defenseItemSelect.selectedOptions?.[0];
            const weightInput = form.querySelector('[name="heavy_defense_weight"]');
            const weight = selected?.dataset?.weight;
            if (weightInput && weight !== undefined) weightInput.value = weight;
            this._updateDamageCalculation(form);
        });

        const knockbackUseHp = form.querySelector('[name="knockback_use_hp"]');
        knockbackUseHp?.addEventListener('change', () => {
            const stInput = form.querySelector('[name="knockback_target_st"]');
            if (stInput) {
                stInput.value = knockbackUseHp.checked
                    ? this._toNumber(this.targetActor?.system?.attributes?.hp?.final, stInput.value)
                    : this._getTargetAttributeValue("st", stInput.value);
            }
            this._updateDamageCalculation(form);
        });
        
        // --- ✅ NOVOS LISTENERS ADICIONADOS AO FINAL ---
        html.on('change', '.contingent-effect-toggle', ev => {
            const effectId = $(ev.currentTarget).closest('.effect-card').data('effectId');
            if (this.effectState[effectId]) this.effectState[effectId].checked = ev.currentTarget.checked;
            this._updateDamageCalculation(form);
        });

        html.on('click', '.npc-resistance-roll', ev => {
            const effectId = $(ev.currentTarget).closest('.effect-card').data('effectId');
            this._onNpcResistanceRoll(effectId);
        });
        html.on('click', '.publish-resistance-result', ev => {
            const effectId = $(ev.currentTarget).closest('.effect-card').data('effectId');
            this._publishResistanceResult(effectId);
        });

        html.find('button[data-action="proposeTests"]').on('click', () => this._onProposeTests(form));
        html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
        html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
        html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
        html.find('button[data-action="publishAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, true));
        
        // --- Disparo Inicial (Preservando sua lógica de "Torso") ---
        const torsoRow = form.querySelector('.location-row[data-location-key="torso"]');
        if (torsoRow) {
            torsoRow.click();
        } else {
            this._updateDamageCalculation(form);
        }
        syncLargeAreaMode();
    }

async _updateDamageCalculation(form) {
    const activeCard = form.querySelector('.damage-card.active');
    const activeDamageKey = activeCard ? activeCard.dataset.damageKey : 'main';
    const activeDamage = this.damageData[activeDamageKey] || this.damageData.main;
    const damageRolledInput = form.querySelector('[name="damage_rolled"]');
    const armorDivisorInput = form.querySelector('[name="armor_divisor"]');
    let damageRolled = parseFloat(damageRolledInput?.value);
    let armorDivisor = parseFloat(armorDivisorInput?.value);

    // ✅ CORREÇÃO: Lendo TODAS as checkboxes no início da função
    const halfDamageChecked = form.querySelector('[name="special_half_damage"]')?.checked;
    const explosionChecked = form.querySelector('[name="special_explosion"]')?.checked;
    const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
    const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
    const onlyKnockbackChecked = form.querySelector('[name="special_only_knockback"]')?.checked;


    const explosionDistance = parseInt(form.querySelector('[name="special_explosion_distance"]')?.value) || 0;
    const toleranceType = form.querySelector('[name="tolerance_type"]')?.value || null;
    const damageReductionEnabled = form.querySelector('[name="damage_reduction_enabled"]')?.checked;
    const rawDamageReductionValue = parseInt(form.querySelector('[name="damage_reduction_value"]')?.value);
    const damageReductionValue = [2, 3, 4].includes(rawDamageReductionValue) ? rawDamageReductionValue : 2;
    const largeAreaInjury = form.querySelector('[name="large_area_injury"]')?.checked;
    if (isNaN(damageRolled)) { damageRolled = activeDamage.total; if (damageRolledInput) damageRolledInput.value = damageRolled; }
    const rawRolledDamage = damageRolled;
    if (!armorDivisor || armorDivisor <= 0) { armorDivisor = activeDamage.armorDivisor || 1; if (armorDivisorInput) armorDivisorInput.value = armorDivisor; }
    const effects = [];
    let originalBase = damageRolled;
    let modifiedBase = damageRolled;
    if (halfDamageChecked) { modifiedBase = Math.floor(modifiedBase / 2); effects.push(`🟡 ${this._f("HalfDamageEffect", { before: originalBase, after: modifiedBase })}`); originalBase = modifiedBase; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); const preExplosion = modifiedBase; modifiedBase = Math.floor(modifiedBase / divisor); effects.push(`🔴 ${this._f("ExplosionEffect", { before: preExplosion, after: modifiedBase, divisor })}`); }
    damageRolled = modifiedBase;
    const selectedModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
    const selectedRowForMod = selectedModRadio?.closest('.wounding-row');
    const damageAbrev = selectedRowForMod?.dataset?.abrev?.toLowerCase() || selectedRowForMod?.querySelector('.type')?.textContent?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '';
    const damageTypeKey = damageAbrev || this.damageTypeAbrev || 'base';
    this.damageTypeAbrev = damageTypeKey;

    // Atualiza visualização de RD por local de acordo com o tipo de dano
    form.querySelectorAll('.location-row').forEach(row => {
        const locKey = row.dataset.locationKey;
        if (locKey === 'custom') return;
        const dynamicDR = this._getDynamicDR(locKey, damageTypeKey);
        row.dataset.dr = dynamicDR;
        const drEl = row.querySelector('.dr');
        if (drEl) drEl.textContent = dynamicDR;
    });

    let selectedLocationDR = 0;
    const activeRow = form.querySelector('.location-row.active');
    if (activeRow) {
        const locKey = activeRow.dataset.locationKey;
        selectedLocationDR = this._getDynamicDR(locKey, damageTypeKey);
    }
    let largeAreaDRData = null;
    if (largeAreaInjury) {
        largeAreaDRData = this._getLargeAreaInjuryDR(form, damageTypeKey);
        selectedLocationDR = largeAreaDRData.effectiveDR;
        effects.push(`🟠 ${this._f("LargeAreaEffect", { effective: selectedLocationDR, torso: largeAreaDRData.torsoDR, marked: largeAreaDRData.markedDR, location: largeAreaDRData.markedLabel })}`);
    }
    const ignoreDR = form.querySelector('[name="ignore_dr"]')?.checked;
    const effectiveDR = ignoreDR ? 0 : Math.floor(selectedLocationDR / armorDivisor);
    let penetratingDamage = Math.max(0, damageRolled - effectiveDR);
    this.currentPenetratingDamage = penetratingDamage;
    let woundingMod = 1;
    if (selectedModRadio) { if (selectedModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } else { woundingMod = parseFloat(selectedModRadio.value) || 1; } }
    if (toleranceType === "nao-vivo") { const table = { "perf": 1, "pi": 1 / 3, "pi-": 0.2, "pi+": 0.5, "pi++": 1 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push(`⚙️ ${this._t("ToleranceUnlivingEffect")}`); } }
    if (toleranceType === "homogeneo") { const table = { "perf": 0.5, "pi": 0.2, "pi-": 0.1, "pi+": 1 / 3, "pi++": 0.5 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push(`⚙️ ${this._t("ToleranceHomogeneousEffect")}`); } }
    if (toleranceType === "difuso") { woundingMod = 1; effects.push(`⚙️ ${this._t("ToleranceDiffuseEffect")}`); }
    let finalInjury = Math.floor(penetratingDamage * woundingMod);
    if (toleranceType === "difuso") finalInjury = Math.min(1, finalInjury);
    if (damageReductionEnabled) {
        const preReductionInjury = finalInjury;
        finalInjury = Math.floor(finalInjury / damageReductionValue);
        effects.push(`🛡️ ${this._f("ReductionEffect", { before: preReductionInjury, after: finalInjury, divisor: damageReductionValue })}`);
    }
    if (effectsOnlyChecked) { finalInjury = 0; } // Zera a lesão se a opção estiver marcada
    if (effectsOnlyChecked || onlyKnockbackChecked) { finalInjury = 0; } // Zera a lesão se a opção estiver marcada

    const selectedLocationLabel = form.querySelector('.location-row.active .label')?.textContent || this._t("SelectedLocation");
    const selectedLocationKey = activeRow?.dataset.locationKey || "torso";
    const bodyProfileId = this.targetActor.system.combat?.body_profile || "humanoid";
    const bodyProfile = getBodyProfile(bodyProfileId);
    const selectedLocationData = bodyProfile.locations?.[selectedLocationKey] || {};
    const selectedLocationRoll = activeRow?.querySelector(".roll")?.textContent?.trim() || selectedLocationData.roll || null;
    const drLabel = ignoreDR
        ? this._t("IgnoreDRLabel")
        : largeAreaInjury
            ? this._f("LargeAreaDRLabel", { torso: largeAreaDRData?.torsoDR ?? 0, location: largeAreaDRData?.markedLabel ?? this._t("SelectedLocation"), marked: largeAreaDRData?.markedDR ?? 0 })
            : selectedLocationLabel;
    const drDisplay = ignoreDR
        ? '0'
        : (armorDivisor && armorDivisor !== 1)
            ? `${selectedLocationDR} ÷ ${armorDivisor} = ${effectiveDR}`
            : `${selectedLocationDR}`;
    let modName = '';
        if (selectedModRadio) {
            // Pega o texto da linha inteira do radio button selecionado
            const selectedRow = selectedModRadio.closest('.wounding-row');

            if (selectedModRadio.value === 'custom') {
                modName = this._t("WoundingCustomShort");
            } else if (selectedRow?.dataset.woundingKind === 'none') {
                modName = this._t("WoundingNoneShort");
            } else {
                modName = selectedRow?.dataset.abrev || 'mod';
            }
        }
    const field = (sel) => form.querySelector(`[data-field="${sel}"]`);
    if (field("base_damage_note")) { if (halfDamageChecked && explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ 2 ÷ ${3 * explosionDistance} = ${modifiedBase}`; } else if (halfDamageChecked) { field("base_damage_note").textContent = `÷ 2 = ${modifiedBase}`; } else if (explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ ${3 * explosionDistance} = ${modifiedBase}`; } else { field("base_damage_note").textContent = ''; } }
    if (field("damage_rolled")) field("damage_rolled").textContent = damageRolled;
    if (field("target_dr")) field("target_dr").textContent = `${drDisplay} (${drLabel})`;
    if (field("armor_divisor")) field("armor_divisor").textContent = armorDivisor;
    if (field("penetrating_damage")) field("penetrating_damage").textContent = penetratingDamage;
    const reductionSuffix = damageReductionEnabled ? ` ÷ ${damageReductionValue}` : "";
    if (field("wounding_mod")) field("wounding_mod").textContent = `x${woundingMod}(${modName})${reductionSuffix}`;
    if (field("final_injury")) field("final_injury").textContent = finalInjury;
    const effectsList = form.querySelector(".effects-list");
    if (effectsList) { effectsList.innerHTML = ""; for (let effect of effects) { effectsList.innerHTML += `<li>${effect}</li>`; } }
    this.finalInjury = finalInjury;
    this.state.activeDamageKey = activeDamageKey;
    this.state.calculation = {
        rolled: rawRolledDamage,
        modified: modifiedBase,
        penetrating: penetratingDamage,
        injury: finalInjury,
        damageType: damageTypeKey,
        armorDivisor,
        woundingModifier: woundingMod,
        rawDR: selectedLocationDR,
        effectiveDR,
        ignoreDR: ignoreDR === true,
        hitLocation: {
            profileId: bodyProfileId,
            key: selectedLocationKey,
            groupKey: selectedLocationData.groupKey || null,
            label: selectedLocationLabel.trim(),
            roll: selectedLocationRoll,
            custom: selectedLocationKey === "custom",
            grouped: activeRow?.classList.contains("is-group") === true,
            largeArea: largeAreaInjury === true,
            markedKey: largeAreaDRData?.markedLocationKey || null,
            markedLabel: largeAreaDRData?.markedLabel || null
        },
        modifiers: {
            halfDamage: halfDamageChecked === true,
            explosion: explosionChecked === true,
            explosionDistance,
            tolerance: toleranceType,
            damageReduction: damageReductionEnabled === true ? damageReductionValue : null,
            effectsOnly: effectsOnlyChecked === true,
            knockbackOnly: onlyKnockbackChecked === true
        }
    };

    // --- ✅ BLOCO DE FEEDBACK E NOTAS (VERSÃO UNIFICADA E CORRIGIDA) ---
    const notesContainer = form.querySelector(".calculation-notes");
    const injuryLabel = form.querySelector(".final-injury-compact label");
    const injuryValue = form.querySelector(".final-injury-compact span");
    let notesHtml = "";

    if (effectsOnlyChecked) {
        notesHtml += `<li class="feedback-note">${this._t("NoteEffectsOnly")}</li>`;
    }

    if (onlyKnockbackChecked) {
        notesHtml += `<li class="feedback-note">${this._t("NoteKnockbackOnly")}</li>`;
    }

    if (applyAsHeal) {
    notesHtml += `<li class="feedback-note">${this._t("NoteHealing")}</li>`;
    if (injuryLabel) {
        injuryLabel.textContent = this._t("Restoration");
        injuryLabel.style.color = "#3b7d3b"; // ✅ Cor do label adicionada
    }
    if (injuryValue) injuryValue.style.color = "#3b7d3b"; // Verde
    } else {
    // Garante que volta ao normal se a caixa for desmarcada
    if (injuryLabel) {
        injuryLabel.textContent = this._t("Injury");
        injuryLabel.style.color = "#c53434"; // ✅ Cor do label resetada
    }
    if (injuryValue) injuryValue.style.color = "#c53434"; // Vermelho
    }

    if (halfDamageChecked) { notesHtml += `<li>${this._t("NoteHalfDamage")}</li>`; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); notesHtml += `<li>${this._f("NoteExplosion", { divisor })}</li>`; }
    if (largeAreaInjury) { notesHtml += `<li>${this._t("NoteLargeArea")}</li>`; }
    if (ignoreDR) { notesHtml += `<li>${this._t("NoteIgnoreDR")}</li>`; }
    if (toleranceType) { const toleranceName = this._t({ "nao-vivo": "Unliving", "homogeneo": "Homogeneous", "difuso": "Diffuse" }[toleranceType]); notesHtml += `<li>${this._f("NoteTolerance", { name: toleranceName })}</li>`; }
    if (damageReductionEnabled) { notesHtml += `<li>${this._f("NoteReduction", { divisor: damageReductionValue })}</li>`; }
    const knockbackResult = this._updateKnockbackAdvisor(form, { basicDamage: damageRolled, damageTypeKey, penetratingDamage });
    if (knockbackResult?.distance > 0) {
        notesHtml += `<li>${this._f("NoteKnockback", { distance: knockbackResult.distance, target: knockbackResult.targetNumber })}</li>`;
    }
    const heavyDefenseResult = this._updateHeavyWeaponDefenseAdvisor(form);
    if (heavyDefenseResult?.status === "warning") {
        notesHtml += `<li>${this._f("NoteDefenseWeight", { headline: heavyDefenseResult.headline })}</li>`;
    } else if (heavyDefenseResult?.status === "danger") {
        notesHtml += `<li class="feedback-note">${this._f("NoteAttention", { headline: heavyDefenseResult.headline })}</li>`;
    }

    if (notesContainer) { notesContainer.innerHTML = notesHtml ? `<ul>${notesHtml}</ul>` : ""; }
    
    // --- LÓGICA DE PREVIEW DE EFEITOS "AO CAUSAR DANO" ---
    const effectsSummaryEl = form.querySelector(".effects-list-summary");
    const actionButtonsEl = form.querySelector(".action-buttons");
    if (!effectsSummaryEl || !actionButtonsEl) return;
    let potentialEffectsHTML = '';
    let hasPotentialEffects = false;
    let needsResistanceRoll = false;

    this.availableOnDamageEffects = [];
    for (const effect of this.preparedOnDamageEffects || []) {
        hasPotentialEffects = true;
        const meetsInjury = this.finalInjury >= effect.minInjury;
        const requiredType = effect.requiredDamageType;
        const meetsType = !requiredType || requiredType === damageTypeKey;
        const meetsRequirements = meetsInjury && meetsType;
        if (this.effectState[effect.id] === undefined) {
            this.effectState[effect.id] = { checked: meetsRequirements };
        }
        const effectState = this.effectState[effect.id];
        const isChecked = effectState.checked && meetsRequirements;
        const resistanceData = effect.item?.system?.resistanceRoll;
        const requiresResistance = resistanceData?.isResisted;
        const chanceText = effect.activationChance < 100 ? this._f("EffectChance", { chance: effect.activationChance }) : null;
        const reqTexts = [];
        if (effect.minInjury) reqTexts.push(this._f("EffectMinInjury", { value: effect.minInjury }));
        if (requiredType) reqTexts.push(this._f("EffectType", { type: requiredType.toUpperCase() }));
        const disabledAttr = meetsRequirements ? "" : "disabled";
        const statusText = this._t(!meetsRequirements ? "EffectRequirementsMissing" : requiresResistance ? "EffectNeedsResistance" : "EffectDirect");
        const resistanceClass = requiresResistance ? "eff-type" : "eff-type muted";
        const resistanceStatus = effectState.resistanceResult
            ? effectState.resistanceResult.shouldApply
                ? `(${this._t("EffectApplicable")})`
                : `(${this._t("EffectBlocked")})`
            : statusText;

        if (isChecked && requiresResistance && !effectState.resistanceResult) {
            needsResistanceRoll = true;
        }

        this.availableOnDamageEffects.push({
            ...effect,
            meetsRequirements,
            requiresResistance,
            resistanceResult: effectState.resistanceResult
        });

        const resistanceRollText = requiresResistance && resistanceData?.attribute
            ? `(${this._f("EffectTest", { attribute: resistanceData.attribute.toUpperCase() })})`
            : `(${this._t("EffectAutomatic")})`;

        const resistanceResultText = effectState.resistanceResult?.resultText
            ? `<div class="eff-status">${effectState.resistanceResult.resultText}</div>`
            : "";
        const canPublishResistanceResult = requiresResistance && !!effectState.resistanceResult?.resultText;
        const publishedClass = effectState.resistanceResult?.publishedToChat ? "published" : "";
        const publishTitle = this._t(effectState.resistanceResult?.publishedToChat ? "EffectPublished" : "EffectPublish");

        potentialEffectsHTML += `
            <div class="effect-card ${meetsRequirements ? '' : 'disabled'}" data-effect-id="${effect.id}">
                <label class="custom-checkbox">
                    <input type="checkbox" class="contingent-effect-toggle" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                    <span>${effect.item?.name || this._t("EffectUnknown")}</span>
                </label>
                <div class="${resistanceClass}">
                    ${resistanceRollText} ${chanceText ? `• ${chanceText}` : ''}
                </div>
                ${reqTexts.length ? `<div class="eff-meta">${reqTexts.join(" • ")}</div>` : ''}
                | ${resistanceResultText} <div class="eff-meta">${resistanceStatus}</div>
                ${requiresResistance ? `<a class="npc-resistance-roll" data-effect-id="${effect.id}" title="${this._t("EffectRollTarget")}"><i class="fas fa-dice-d20"></i></a>` : ''}
                ${canPublishResistanceResult ? `<a class="publish-resistance-result ${publishedClass}" data-effect-id="${effect.id}" title="${publishTitle}"><i class="fas fa-bullhorn"></i></a>` : ''}
            </div>
        `;
    }

    effectsSummaryEl.innerHTML = hasPotentialEffects ? potentialEffectsHTML : `<div class="placeholder">${this._t("NoAdditionalEffects")}</div>`;
    const proposeButton = actionButtonsEl.querySelector('button[data-action="proposeTests"]');
    if (proposeButton) {
        proposeButton.disabled = false;
        proposeButton.textContent = this._t("ProposeTests");
        if (needsResistanceRoll) { proposeButton.style.display = 'inline-block'; } else { proposeButton.style.display = 'none'; }
    }
}
    
        _onProposeTests(form) {
        const effectsNeedingRoll = (this.availableOnDamageEffects || []).filter(e => {
            const state = this.effectState[e.id];
            return e.requiresResistance && e.meetsRequirements && state?.checked && !state.resistanceResult;
        });

        if (effectsNeedingRoll.length === 0) {
            return ui.notifications.info(this._t("NoResistanceSelected"));
        }

        ui.notifications.info("Enviando propostas de teste para o chat...");
        for (const effect of effectsNeedingRoll) {
            this._promptResistanceRoll(effect);
        }
        this.element.find('button[data-action="proposeTests"]').prop('disabled', true).text('Testes Propostos');
    }
    
async _onNpcResistanceRoll(effectId) {
    const effect = (this.availableOnDamageEffects || []).find(e => e.id === effectId);
    if (!effect?.requiresResistance || !effect.item) return;
    const rollData = effect.item.system?.resistanceRoll || {};
    const normalized = normalizeResistanceRoll(rollData);
    const target = this.targetActor;
    let totalModifier = evaluateNumericFormula(rollData.modifier, {
        actor: target,
        eventData: { damage: this.finalInjury, target, attacker: this.attackerActor }
    }) || 0;
     if (rollData.dynamicModifier) {
        try { totalModifier += Function("actor", "event", `return (${rollData.dynamicModifier})`)(target, { damage: this.finalInjury, target, attacker: this.attackerActor }); } catch(e) { console.warn(`GUM | Erro ao avaliar modificador dinâmico:`, e); }
    }
    const targetToken = this.targetToken || target?.getActiveTokens?.()[0] || null;
    const targetKey = targetToken?.document?.uuid || target?.uuid;
    const request = {
        id: foundry.utils.randomID(), title: game.i18n.format("GUM.RollRequest.ResistanceTitle", { name: effect.item.name }),
        origin: { type: "damage-barrier", sourceActorUuid: this.attackerActor?.uuid, effectUuid: effect.item.uuid, effectLinkId: effectId },
        targets: [{ targetKey, actorUuid: target?.uuid, tokenUuid: targetToken?.document?.uuid || null, actorName: target?.name, recipientUserIds: [] }],
        test: { ...normalized.test, fixedModifier: totalModifier }, consequence: normalized.consequence
    };
    const outcome = await executeRollRequest(request, targetKey, { prompt: false, onResult: async result => {
        const barrier = evaluateBarrierConsequence(result, normalized.consequence);
        const outcomeKey = `GUM.RollCard.Outcome.${result.outcome}`;
        const outcomeLabel = game.i18n.localize(outcomeKey);
        const simpleResultText = `${result.total} vs ${result.effectiveTarget} — ${outcomeLabel !== outcomeKey ? outcomeLabel : result.resultLabel}`;
        const chatResultText = `<div class="gurps-roll-card premium roll-result"><header class="card-header"><h3>${game.i18n.localize("GUM.RollCard.ResistanceTest")}</h3><small>${target?.name || game.i18n.localize("GUM.RollCard.Target")}</small></header><div class="card-content"><p>${simpleResultText}</p><p>${game.i18n.format("GUM.RollRequest.Margin", { value: result.margin })}</p></div></div>`;
        await this.updateEffectCard(effectId, { isSuccess: barrier.success, shouldApply: barrier.shouldApply, branchId: barrier.branchId, branchLabel: barrier.branchLabel, actionIds: barrier.actionIds, resultText: simpleResultText, chatResultText, result }, effect.item.system, { autoApply: false });
    }});
    if (!outcome.accepted) ui.notifications.warn(outcome.reason || this._t("ResistanceUnavailable"));
}
    
    _publishResistanceResult(effectId) {
        const state = this.effectState?.[effectId];
        const resultText = state?.resistanceResult?.chatResultText || state?.resistanceResult?.resultText;
        if (!resultText) return;
        const chatData = applyCurrentRollPrivacy({ content: resultText });
        ChatMessage.create(chatData);
        state.resistanceResult.publishedToChat = true;
        if (this.form) this._updateDamageCalculation(this.form);
    }
    
    async _applyShockEffect(injury) {
        if (hasActiveEffectFlag(this.targetActor, "ignoreShock", true)) return 0;
        if (!this.targetActor || !game.combat) return 0;

        const shockIncrement = calculateShockPenalty(
            injury,
            this.targetActor.system.attributes.hp?.final
        );
        if (shockIncrement <= 0) return 0;

        const allShockEffects = this.targetActor.effects.filter((effect) =>
            foundry.utils.getProperty(effect, "flags.gum.specialEffect") === "shock"
        );
        const pendingShockEffects = allShockEffects.filter((effect) =>
            foundry.utils.getProperty(effect, "flags.gum.duration.pendingStart") === true
        );

        const extraPending = pendingShockEffects.slice(1);
        if (extraPending.length > 0) {
            await this.targetActor.deleteEmbeddedDocuments("ActiveEffect", extraPending.map((effect) => effect.id));
        }

        const pendingShock = pendingShockEffects[0] || null;
        const currentPendingValue = Math.max(0, Number(foundry.utils.getProperty(pendingShock, "flags.gum.shockValue")) || 0);
        const nextShockValue = Math.min(4, currentPendingValue + shockIncrement);

        const rollContext = ["check_dx", "skill_dx", "check_iq", "skill_iq", "attack_melee", "attack_ranged"].join(",");

        const effectPayload = {
            name: this._f("ShockApplied", { value: nextShockValue }),
            img: pendingShock?.img || "icons/svg/daze.svg",
            changes: [],
            statuses: [],
            flags: {
                gum: {
                    specialEffect: "shock",
                    shockValue: nextShockValue,
                    rollModifier: {
                        value: -nextShockValue,
                        cap: "",
                        context: rollContext
                    },
                    duration: {
                        inCombat: true,
                        value: 1,
                        unit: "turns",
                        startMode: "nextTurnStart",
                        endMode: "turnEnd",
                        pendingStart: true
                    }
                }
            },
            duration: {
                turns: 1,
                combat: game.combat?.id ?? null
            },
            disabled: true
        };

        if (pendingShock) {
            await pendingShock.update(effectPayload);
        } else {
            await this.targetActor.createEmbeddedDocuments("ActiveEffect", [effectPayload]);
        }

        return nextShockValue;
    }

     _buildAttackSummaryContent({ finalInjury, poolLabel, applyAsHeal, effectsOnlyChecked, damageKey = "main", penetrated = false, appliedEffectNames = [], contingentApplied = [], pendingEffectNames = [], preventedEffectNames = [] }) {
        let resultLine = '';

        if (applyAsHeal && finalInjury > 0) {
            resultLine = `<p>${this._f("SummaryHealed", { target: this.targetActor.name, value: finalInjury, pool: poolLabel })}</p>`;
        } else if (finalInjury > 0 && !effectsOnlyChecked) {
            resultLine = `<p>${this._f("SummaryInjured", { target: this.targetActor.name, value: finalInjury, pool: poolLabel })}</p>`;
        } else if (!applyAsHeal && finalInjury <= 0 && !effectsOnlyChecked) {
            resultLine = `<p>${this._t(penetrated ? "SummaryNoInjury" : "SummaryStopped")}</p>`;
        }

        return `
            <div class="gurps-roll-card premium attack-summary-card">
                <header class="card-header">
                    <h3>${this._t("SummaryTitle")} · ${this._t(`SummaryComponent.${damageKey}`)}</h3>
                </header>
                <div class="card-content">
                    <div class="summary-actors vertical">
                        <div class="actor-line">
                            <img src="${this._attackerImage()}" class="actor-token-icon">
                            <strong>${this.attackerActor.name}</strong>
                        </div>
                        <div class="arrow-line"><i class="fas fa-arrow-right"></i></div>
                        <div class="actor-line">
                            <img src="${this._targetImage()}" class="actor-token-icon">
                            <strong>${this.targetActor.name}</strong>
                        </div>
                    </div>
                    ${resultLine ? `
                    <div class="summary-block result-card">
                        <div class="minicard-title">${this._t("SummaryResult")}</div>
                        ${resultLine}
                    </div>` : ''}
                    ${appliedEffectNames.length > 0 || contingentApplied.length > 0 ? `
                    <div class="summary-block effects-card">
                        <div class="minicard-title">${this._t("SummaryAppliedEffects")}</div>
                        ${[...appliedEffectNames, ...contingentApplied].map(name => `<p><strong>${name}</strong></p>`).join('')}
                    </div>` : ''}
                    ${pendingEffectNames.length > 0 ? `
                    <div class="summary-block pending-card">
                        <div class="minicard-title">${this._t("SummaryPendingEffects")}</div>
                        <p>${this._t("SummaryAwaitResistance")}</p>
                        ${pendingEffectNames.map(name => `<p><strong>${name}</strong></p>`).join('')}
                    </div>` : ''}
                    ${preventedEffectNames.length > 0 ? `
                    <div class="summary-block prevented-card">
                        <div class="minicard-title">${this._t("SummaryPreventedEffects")}</div>
                        ${preventedEffectNames.map(name => `<p><strong>${name}</strong></p>`).join('')}
                    </div>` : ''}
                </div>
            </div>`;
    }

    async _onApplyDamage(form, shouldClose, shouldPublish) {
        const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
        if (this.isApplying) return;
        const activeDamageKey = form.querySelector('.damage-card.active')?.dataset.damageKey || 'main';
        await this._updateDamageCalculation(form);
        this.isApplying = true;
        try {
            const finalInjury = this.finalInjury || 0;
            const primaryPenetrated = this.currentPenetratingDamage > 0;
            const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
            const ignoreShockSources = getActiveEffectFlagSources(this.targetActor, "ignoreShock");
            const targetIgnoresShock = ignoreShockSources.length > 0;
            const applyShock = !targetIgnoresShock && (form.querySelector('[name="special_apply_shock"]')?.checked ?? true);
            const selectedPoolPath = form.querySelector('[name="damage_target_pool"]').value;
            const targetPoolKind = classifyDamageTargetPool(selectedPoolPath);
            const appliedToHP = targetPoolKind === "hp";
            if (!selectedPoolPath) { this.isApplying = false; return ui.notifications.error(this._t("NoTargetPool")); }
            const isIntegrityRecord = selectedPoolPath.startsWith("equipment-integrity:");
            const linkedEquipment = isIntegrityRecord
                ? this.targetActor.items.get(selectedPoolPath.slice("equipment-integrity:".length))
                : selectedPoolPath.startsWith("equipment:")
                    ? this.targetActor.items.get(selectedPoolPath.slice("equipment:".length))
                : null;
            const linkedReserve = linkedEquipment ? equipmentLinkedReserve(linkedEquipment, linkedEquipment.system?.equipmentResolution) : null;
            const linkedIntegrity = isIntegrityRecord ? equipmentIntegrityRecord(linkedEquipment, linkedEquipment?.system?.equipmentResolution) : null;
            if (isIntegrityRecord && !linkedIntegrity) { this.isApplying = false; return ui.notifications.error(this._t("MissingEquipmentReserve")); }
            if (selectedPoolPath.startsWith("equipment:") && !linkedReserve) { this.isApplying = false; return ui.notifications.error(this._t("MissingEquipmentReserve")); }
            const currentPoolValue = linkedIntegrity?.current ?? linkedReserve?.current ?? foundry.utils.getProperty(this.targetActor, selectedPoolPath);
            const updatePool = (value, options = {}) => linkedIntegrity
                ? linkedEquipment.update(equipmentIntegrityCurrentUpdate(linkedEquipment, value, linkedEquipment.system?.equipmentResolution), options)
                : linkedReserve
                    ? linkedEquipment.update(equipmentReserveBalanceUpdate(linkedEquipment, value, linkedEquipment.system?.equipmentResolution), options)
                : this.targetActor.update({ [selectedPoolPath]: value }, options);
            const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;            
            const natureRaw = form.querySelector('[name="damage_nature"]')?.value || "";
            const damageNature = natureRaw ? resolveDamageNature(natureRaw) : null;
            if (natureRaw && !damageNature) { this.isApplying = false; return ui.notifications.error(this._t("InvalidNature")); }
            let summaryMessage = null;
            let eventData = null;
            
            // Reserve the chat position before updating the actor. Actor updates run
            // passive-condition hooks, which may publish their own trigger cards.
            if (shouldPublish) {
                const summaryChatData = applyCurrentRollPrivacy({
                    speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }),
                    content: this._buildAttackSummaryContent({ finalInjury, poolLabel, applyAsHeal, effectsOnlyChecked, damageKey: activeDamageKey, penetrated: primaryPenetrated })
                });
                summaryMessage = await ChatMessage.create(summaryChatData);
            }

            if (!applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                const newPoolValue = currentPoolValue - finalInjury;
                const calculation = this.state.calculation || {};
                const attackerToken = this.attackerToken || this.attackerActor?.getActiveTokens?.()[0] || null;
                const targetToken = this.targetToken || this.targetActor?.getActiveTokens?.()[0] || null;
                const attackerTokenUuid = attackerToken?.document?.uuid || attackerToken?.uuid || null;
                const targetTokenUuid = targetToken?.document?.uuid || targetToken?.uuid || null;
                const targetPoolMaximum = targetPoolKind === "hp"
                    ? this.targetActor.system.attributes.hp?.final
                    : targetPoolKind === "fp"
                        ? this.targetActor.system.attributes.fp?.final
                        : null;
                eventData = buildDamageApplicationEvent({
                    eventId: foundry.utils.randomID(),
                    applicationId: String(this.appId),
                    damage: {
                        rolled: calculation.rolled,
                        modified: calculation.modified,
                        penetrating: calculation.penetrating,
                        injury: finalInjury,
                        type: this.damageTypeAbrev,
                        nature: damageNature?.id || null,
                        natureLabel: damageNature?.label || null,
                        armorDivisor: calculation.armorDivisor,
                        woundingModifier: calculation.woundingModifier,
                        component: activeDamageKey,
                        shockPenalty: appliedToHP
                            ? calculateShockPenalty(finalInjury, this.targetActor.system.attributes.hp?.final)
                            : 0,
                        modifiers: calculation.modifiers
                    },
                    targetPool: {
                        kind: targetPoolKind,
                        path: selectedPoolPath,
                        label: poolLabel,
                        before: currentPoolValue,
                        after: newPoolValue,
                        applied: finalInjury,
                        maximum: targetPoolMaximum
                    },
                    hitLocation: calculation.hitLocation,
                    protection: {
                        rawDR: calculation.rawDR,
                        effectiveDR: calculation.effectiveDR,
                        ignored: calculation.ignoreDR
                    },
                    source: {
                        actorUuid: this.attackerActor?.uuid || null,
                        tokenUuid: attackerTokenUuid,
                        itemUuid: this.damageData.sourceItemUuid || null,
                        attackId: this.damageData.sourceAttackId || null,
                        attackType: this.damageData.sourceAttackType || null,
                        name: this.damageData.sourceName || null
                    },
                    target: {
                        actorUuid: this.targetActor?.uuid || null,
                        tokenUuid: targetTokenUuid
                    },
                    combat: game.combat ? {
                        id: game.combat.id,
                        round: game.combat.round,
                        turn: game.combat.turn
                    } : null
                });
                await updatePool(newPoolValue, { gumEventData: eventData });
            } else {
                const sign = applyAsHeal ? 1 : -1;
                const newPoolValue = currentPoolValue + (sign * finalInjury);
                await updatePool(newPoolValue);
            }

            if (form.querySelector('[name="register_wound"]')?.checked && !applyAsHeal && !effectsOnlyChecked && finalInjury > 0) {
                await this._registerWound(form, { amount: finalInjury, poolPath: selectedPoolPath, poolLabel, nature: damageNature });
            }

            const appliedEffectNames = [];
            const pendingEffectNames = [];
            const preventedEffectNames = [];
            if (targetIgnoresShock && game.combat && appliedToHP && !applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                const sourceNames = ignoreShockSources.map(effect => effect.name).filter(Boolean).join(", ");
                preventedEffectNames.push(sourceNames ? this._f("ShockIgnoredFrom", { sources: sourceNames }) : this._t("ShockIgnored"));
            }
            let shockAppliedValue = 0;
            const pendingResistanceQueue = [];
            let pendingResistance = false;
            const effectTargets = this._resolveEffectTargets();
            for (const effect of this.availableOnDamageEffects || []) {
                const state = this.effectState[effect.id];
                if (!state?.checked || !effect.meetsRequirements || !effect.item || state.applied) continue;

                if (effect.activationChance < 100) {
                    const chanceRoll = await (new Roll("1d100")).evaluate({ async: true });
                    state.activationRoll = chanceRoll.total;
                    if (chanceRoll.total > effect.activationChance) continue;
                }

                let resistanceActionIds = null;
                if (effect.requiresResistance) {
                    const resistanceResult = state.resistanceResult;
                    if (!resistanceResult) {
                        pendingResistance = true;
                        pendingEffectNames.push(effect.item.name);
                        this.pendingResistanceEffects.add(effect.id);
                        pendingResistanceQueue.push(effect);
                        continue;
                    }
                    if (!resistanceResult.shouldApply) {
                        this.pendingResistanceEffects.delete(effect.id);
                        continue;
                    }
                    resistanceActionIds = resistanceResult.actionIds ?? null;
                }

                if (effectTargets.length > 0) {
                    await applySingleEffect(effect.item, effectTargets, { actor: this.attackerActor, origin: effect.item, actionIds: resistanceActionIds });
                    appliedEffectNames.push(effect.item.name);
                    state.applied = true;
                    this.pendingResistanceEffects.delete(effect.id);
                }
            }
                if (applyShock && appliedToHP && !applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                shockAppliedValue = await this._applyShockEffect(finalInjury);
                if (shockAppliedValue > 0) {
                    appliedEffectNames.push(this._f("ShockApplied", { value: shockAppliedValue }));
                }
            }


            const contingentApplied = [];
            const contingentEffects = this.damageData.contingentEffects || {};
            if (contingentEffects) {
                const eventContext = { damage: finalInjury, target: this.targetActor, attacker: this.attackerActor };
                for (const [id, state] of Object.entries(this.effectState)) {
                    const effect = contingentEffects[id];
                    if (!effect || !state?.checked) continue;
                    if (!effect.resistanceRoll) {
                        await this._executeContingentAction(effect, eventContext);
                        const conditionItem = await fromUuid(effect.payload);
                        if (conditionItem) contingentApplied.push(conditionItem.name);
                    }
                }
            }

            if (pendingResistance) {
                ui.notifications.info(this._t("PendingResistance"));
            }

            if (summaryMessage) {
                await summaryMessage.update({
                    content: this._buildAttackSummaryContent({
                        finalInjury,
                        poolLabel,
                        applyAsHeal,
                        effectsOnlyChecked,
                        damageKey: activeDamageKey,
                        penetrated: primaryPenetrated,
                        appliedEffectNames,
                        contingentApplied,
                        pendingEffectNames,
                        preventedEffectNames
                    })
                });
            }

            for (const effect of pendingResistanceQueue) {
                await this._promptResistanceRoll(effect);
            }

            if (eventData) {
                const sourceItem = this.damageData.sourceItemId
                    ? this.attackerActor?.items?.get?.(this.damageData.sourceItemId) || null
                    : null;
                const lifecycleTargetToken = this.targetToken || resolveGumSourceToken(this.targetActor);
                emitGumLifecycleHook(GUM_API_HOOKS.DAMAGE_APPLIED, {
                    eventId: eventData.eventId,
                    actor: this.attackerActor,
                    sourceToken: this.attackerToken || resolveGumSourceToken(this.attackerActor),
                    item: sourceItem,
                    action: {
                        type: "damage",
                        id: this.damageData.sourceAttackId || sourceItem?.id || null,
                        attackType: this.damageData.sourceAttackType || null,
                        label: this.damageData.sourceName || null,
                        data: this.damageData
                    },
                    targets: lifecycleTargetToken ? [lifecycleTargetToken] : [],
                    result: {
                        event: eventData,
                        targetActor: this.targetActor,
                        injury: finalInjury
                    }
                });
            }

            if (shouldClose) this.close();
        } finally {
            this.isApplying = false;
        }
    }

    async _registerWound(form, { amount, poolPath, poolLabel, nature }) {
        const activeLocation = form.querySelector('.location-row.active .label')?.textContent?.trim() || "";
        const title = `${poolLabel}: ${amount}`;
        const id = foundry.utils.randomID();
        await this.targetActor.update({ [`system.combat.wounds.${id}`]: {
            title, value: amount, remaining: amount, poolPath, poolLabel,
            nature: nature || null, location: activeLocation,
            origin: this.damageData.sourceName || this.attackerActor?.name || "",
            attacker: this.attackerActor?.name || "",
            notes: "",
            createdAt: Date.now(), updatedAt: Date.now()
        }});
    }

    async _executeContingentAction(effect, eventContext) {
        if (effect.action === 'applyCondition') {
            await applyContingentCondition(eventContext.target, effect, eventContext);
        }
    }

    _resolveEffectTargets() {
        const activeTokens = this.targetActor?.getActiveTokens?.() || [];
        if (activeTokens.length > 0) return activeTokens;
        if (this.targetActor) return [{ actor: this.targetActor, name: this.targetActor.name }];
        return [];
    }

    async updateEffectCard(effectId, rollResult, effectSystem, options = {}) {
        if (!effectId) return;
        const autoApply = options.autoApply !== false;
        const state = this.effectState[effectId] || (this.effectState[effectId] = { checked: true });
        const applyOn = effectSystem?.resistanceRoll?.applyOn || 'failure';
        let shouldApply = rollResult.shouldApply;
        if (shouldApply === undefined && rollResult.isSuccess !== undefined) {
            shouldApply = applyOn === 'success' ? rollResult.isSuccess : !rollResult.isSuccess;
        }
        state.resistanceResult = { ...rollResult, shouldApply };

        const card = this.form?.querySelector(`.effect-card[data-effect-id="${effectId}"]`);
        if (card) {
            const statusEl = card.querySelector('.eff-status');
            if (statusEl) {
                statusEl.textContent = rollResult.resultText || this._t(shouldApply ? "EffectApplicable" : "EffectBlocked");
            }
        }

        if (autoApply && shouldApply) {
            await this._applyEffectFromResistance(effectId);
        }

        if (this.form) {
            this._updateDamageCalculation(this.form);
        }
    }

    async _applyEffectFromResistance(effectId) {
        const effect = (this.availableOnDamageEffects || []).find(e => e.id === effectId);
        const state = this.effectState[effectId];
        if (!effect || !state?.checked || state.applied || !effect.meetsRequirements || !effect.item) return;
        const effectTargets = this._resolveEffectTargets();
        if (effectTargets.length === 0) return;
                await applySingleEffect(effect.item, effectTargets, { actor: this.attackerActor, origin: effect.item, actionIds: state.resistanceResult?.actionIds ?? null });
        state.applied = true;
        ui.notifications.info(this._f("EffectApplied", { name: effect.item.name }));
    }

    async _promptResistanceRoll(effect) {
        if (!effect?.item) return;
        const rollData = effect.item.system?.resistanceRoll || {};
        const target = this.targetActor;
        const targetToken = this.targetActor?.getActiveTokens?.()[0] || null;
                const applyOnText = game.i18n.localize(rollData.mode === 'conditional' ? "GUM.RollRequest.ConditionalResults" : (rollData.applyOn === 'success' ? "GUM.RollRequest.OnSuccess" : "GUM.RollRequest.OnFailure"));
        const marginValue = rollData.mode === 'conditional' ? game.i18n.localize("GUM.RollRequest.PerResult") : ((rollData.margin !== undefined && rollData.margin !== null && rollData.margin !== '') ? rollData.margin : '—');
        const rawModifier = (rollData.modifier ?? "").toString().trim();
        const resolvedModifier = evaluateNumericFormula(rawModifier, {
            actor: target,
            eventData: { damage: this.finalInjury, target, attacker: this.attackerActor }
        });
        const resolvedModifierSigned = resolvedModifier > 0 ? `+${resolvedModifier}` : `${resolvedModifier}`;
        const modifierValue = rawModifier && resolvedModifier !== 0 ? resolvedModifierSigned : '0';
        const resistanceChatText = (rollData.chatText || '').toString().trim();

        const chatPayload = {
            mode: "damage",
            targetActorId: target?.id || null,
            targetTokenId: targetToken?.id || null,
            effectItemUuid: effect.item.uuid || null,
            effectItemData: effect.item.toObject(),
            sourceActorId: this.attackerActor?.id || null,
           effectLinkId: effect.id,
            originItemUuid: effect.originItemUuid || null,
            damageApplicationId: String(this.appId),
            damage: this.finalInjury
        };
        const normalized = normalizeResistanceRoll(rollData);
        const targetKey = targetToken?.document?.uuid || target?.uuid;
        const request = {
            version: 1, id: foundry.utils.randomID(), status: "pending", title: game.i18n.format("GUM.RollRequest.ResistanceTitle", { name: effect.item.name }),
            origin: { type: "damage-barrier", sourceActorUuid: this.attackerActor?.uuid, sourceItemUuid: effect.originItemUuid || null, effectUuid: effect.item.uuid, effectLinkId: effect.id },
            targets: [{ targetKey, actorUuid: target?.uuid, tokenUuid: targetToken?.document?.uuid || null, actorName: target?.name, recipientUserIds: [] }],
            test: normalized.test, consequence: normalized.consequence, delivery: {}, responses: []
        };

        const content = renderPendingResistanceRequest({
            request, effectName: effect.item.name, effectImg: effect.item.img,
            originLabel: this.attackerActor?.name || this._t("ApplyDamage"),
            targetName: target?.name || this._t("Target"), targetImg: resolveCharacterImage(target, { token: targetToken }),
            testLabel: (rollData.attribute || "HT").toUpperCase(), modifierLabel: modifierValue !== "0" ? game.i18n.format("GUM.RollRequest.BarrierModifier", { modifier: modifierValue }) : "",
            applyOnLabel: applyOnText, marginLabel: marginValue, purposeLabels: getPurposeLabels(normalized.test.requestedPurposeIds),
            description: resistanceChatText, buttonPayload: chatPayload
        });

        const resistanceChatData = applyCurrentRollPrivacy({ speaker: ChatMessage.getSpeaker({ actor: target }), content,
            flags: { gum: { rollRequest: request, resistanceContext: chatPayload } } });
        ChatMessage.create(resistanceChatData);
    }
    
    _getAdjustedWoundingModifiers(locationKey) {
        // ... (Seu método _getAdjustedWoundingModifiers, sem alterações)
        const baseMods = [
            [1, "cort", 1.5], [1, "perf", 2], [1, "cont", 1],
            [2, "qmd", 1], [2, "cor", 1], [2, "tox", 1],
            [3, "pi", 1], [3, "pi-", 0.5], [3, "pi+", 1.5], [3, "pi++", 2]
        ].map(([group, abrev, mult]) => ({ group, type: this._t(`Wounding.${abrev}`), abrev, mult }));
        if (["head", "eyes"].includes(locationKey)) { return baseMods.map(mod => ({ ...mod, mult: mod.abrev === "tox" ? 1 : 4 })); }
        if (locationKey === "face") { return baseMods.map(mod => ({ ...mod, mult: mod.abrev === "cor" ? 1.5 : mod.mult })); }
        if (["arm", "leg", "hand", "foot"].includes(locationKey)) { return baseMods.map(mod => { if (["perf", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 1 }; return mod; }); }
        if (locationKey === "neck") { return baseMods.map(mod => { if (mod.abrev === "cor" || mod.abrev === "cont") return { ...mod, mult: 1.5 }; if (mod.abrev === "cort") return { ...mod, mult: 2 }; return mod; }); }
        if (locationKey === "vitals") { return baseMods.map(mod => { if (["perf", "pi", "pi-", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 3 }; return mod; }); }
        return baseMods;
    }
    
    async _updateObject(_event, _formData) {
        // Limpamos os avisos de 'não lido' e mantemos o método vazio.
    }

    async close(options) {
        this.isDialogClosed = true;
        game.gum?.damageApplications?.delete(String(this.appId));
        if (this.pendingResistanceEffects.size === 0 && game.gum?.activeDamageApplication === this) {
            delete game.gum.activeDamageApplication;
        }
        return super.close(options);
    }
}
