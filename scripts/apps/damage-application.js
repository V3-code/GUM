import { applyContingentCondition } from "../main.js";
import { applySingleEffect } from "../effects-engine.js";
import { getBodyLocationDefinition, getBodyProfile } from "../../module/config/body-profiles.js";

export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        
        this.effectState = {};
        this.isApplying = false;
        this.pendingResistanceEffects = new Set();
        this.isDialogClosed = false;

        this.state = {
            finalInjury: 0,
            targetDR: 0,
            activeDamageKey: 'main'
        };

        this.options.title = `Aplicar Dano em ${this.targetActor?.name || "Alvo"}`;
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
        if (!drObject || typeof drObject !== "object") return "0";
        const normalized = {};
        for (const [key, value] of Object.entries(drObject)) {
            const numeric = Number(value) || 0;
            if (numeric === 0) continue;
            normalized[key] = numeric;
        }
        const sortedEntries = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(sortedEntries);
    }

    _buildLocationRows(profile, drLocations) {
        const locationsData = profile.locations || {};
        const baseOrder = profile.order || Object.keys(locationsData);
        const extraKeys = Object.keys(drLocations || {})
            .filter(key => !locationsData[key] && getBodyLocationDefinition(key))
            .sort((a, b) => {
                const aLabel = getBodyLocationDefinition(a)?.label ?? a;
                const bLabel = getBodyLocationDefinition(b)?.label ?? b;
                return aLabel.localeCompare(bLabel);
            });
        const combinedOrder = [...baseOrder, ...extraKeys];

        const items = [];
        for (const key of combinedOrder) {
            const data = locationsData[key] ?? getBodyLocationDefinition(key);
            if (!data) continue;
            const drData = drLocations[key] || {};
            const baseDR = typeof drData === "object" ? (parseInt(drData.base) || 0) : (parseInt(drData) || 0);

            items.push({
                key,
                label: data.label ?? data.name ?? key,
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
            groupSummaries.set(groupKey, {
                key: groupItems[0].key,
                isGroup: true,
                label: `${labelBase} (${groupItems.length})`,
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
            title: `Aplicar Dano`,
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
        context.attacker = this.attackerActor;
        context.target = this.targetActor;
        const damageablePools = [];
        damageablePools.push({ path: 'system.attributes.hp.value', label: `Pontos de Vida (PV)` });
        damageablePools.push({ path: 'system.attributes.fp.value', label: `Pontos de Fadiga (PF)` });
               const combatMeters = this.targetActor.system.combat.combat_meters || {};
        for (const [key, meter] of Object.entries(combatMeters)) {
            const meterPath = `system.combat.combat_meters.${key}.${meter.current !== undefined ? "current" : "value"}`;
            damageablePools.push({ path: meterPath, label: meter.name });
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
        context.damageablePools = damageablePools;
        this.preparedOnDamageEffects = await this._resolveOnDamageEffects();
        game.gum = game.gum || {};
        game.gum.activeDamageApplication = this;
const profileId = this.targetActor.system.combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);
        const totalDrLocations = this.targetActor.system.combat.dr_locations || {};

        context.locations = this._buildLocationRows(profile, totalDrLocations);

        context.locations.push({ key: "custom", label: "Outro", roll: "--", totalDR: 0, custom: true });

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
        const woundingModifiersList = [ { type: "Queimadura", abrev: "qmd", mult: 1 }, { type: "Corrosão", abrev: "cor", mult: 1 }, { type: "Toxina", abrev: "tox", mult: 1 }, { type: "Contusão", abrev: "cont", mult: 1 }, { type: "Corte", abrev: "cort", mult: 1.5 }, { type: "Perfuração", abrev: "perf", mult: 2 }, { type: "Perfurante", abrev: "pi", mult: 1 }, { type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 }, { type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { type: "Ext. Perfurante", abrev: "pi++", mult: 2 } ];
        let defaultModFound = false;
        context.woundingModifiers = woundingModifiersList.map(mod => { mod.checked = (mod.abrev === mainDamageType); if (mod.checked) defaultModFound = true; return mod; });
        context.noModChecked = !defaultModFound;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html[0];
        this.form = form;

        // --- SEUS LISTENERS ORIGINAIS (INTACTOS) ---
        form.querySelectorAll('.damage-card').forEach(card => {
            card.addEventListener('click', ev => {
                form.querySelectorAll('.damage-card.active').forEach(c => c.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                const damageType = ev.currentTarget.querySelector('.damage-label')?.textContent?.match(/[a-zA-Z+]+/)?.[0]?.toLowerCase();
                this.damageTypeAbrev = damageType || this.damageTypeAbrev;
                const applyAsHealCheckbox = form.querySelector('[name="special_apply_as_heal"]');
                if (damageType) {
                    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                    let matched = false;
                    allRadios.forEach(r => {
                        const abrev = r.closest('.wounding-row')?.dataset?.abrev?.toLowerCase() || '';
                        if (abrev === damageType) { r.checked = true; matched = true; }
                    });
                    if (!matched) { const noModRadio = form.querySelector('input[name="wounding_mod_type"][value="1"]'); if (noModRadio) noModRadio.checked = true; }

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
                    for (let r of allRadios) { const label = r.closest('.wounding-row')?.textContent?.toLowerCase() || ''; if (r.value === '1' && label.includes("sem modificador")) { r.checked = true; break; } }
                }
                const newDamage = this.damageData[ev.currentTarget.dataset.damageKey];
                const damageInput = form.querySelector('[name="damage_rolled"]');
                const armorInput = form.querySelector('[name="armor_divisor"]');
                if (damageInput) damageInput.value = newDamage.total || 0;
                if (armorInput) armorInput.value = newDamage.armorDivisor || 1;
                this._updateDamageCalculation(form);
            });
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
                        <div class="wounding-row">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="1" ${selectedAbrev === '' ? 'checked' : ''}/>
                                <span>Sem Modificador</span>
                                <span class="dots"></span>
                                <span class="mult">x1</span>
                            </label>
                        </div>`;

                    htmlContent += `
                        <div class="wounding-row">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="custom"/>
                                <span>Outros Mod.:</span>
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

        html.find('button[data-action="proposeTests"]').on('click', () => this._onProposeTests(form));
        html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
        html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
        html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
        
        // --- Disparo Inicial (Preservando sua lógica de "Torso") ---
        const torsoRow = form.querySelector('.location-row[data-location-key="torso"]');
        if (torsoRow) {
            torsoRow.click();
        } else {
            this._updateDamageCalculation(form);
        }
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

    const explosionDistance = parseInt(form.querySelector('[name="special_explosion_distance"]')?.value) || 0;
    const toleranceType = form.querySelector('[name="tolerance_type"]')?.value || null;
    if (isNaN(damageRolled)) { damageRolled = activeDamage.total; if (damageRolledInput) damageRolledInput.value = damageRolled; }
    if (!armorDivisor || armorDivisor <= 0) { armorDivisor = activeDamage.armorDivisor || 1; if (armorDivisorInput) armorDivisorInput.value = armorDivisor; }
    const effects = [];
    let originalBase = damageRolled;
    let modifiedBase = damageRolled;
    if (halfDamageChecked) { modifiedBase = Math.floor(modifiedBase / 2); effects.push(`🟡 Dano reduzido pela metade (1/2D): ${originalBase} ➜ ${modifiedBase}`); originalBase = modifiedBase; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); const preExplosion = modifiedBase; modifiedBase = Math.floor(modifiedBase / divisor); effects.push(`🔴 Explosão: ${preExplosion} ➜ ${modifiedBase} (÷${divisor})`); }
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
    const ignoreDR = form.querySelector('[name="ignore_dr"]')?.checked;
    
    const effectiveDR = ignoreDR ? 0 : Math.floor(selectedLocationDR / armorDivisor);
    let penetratingDamage = Math.max(0, damageRolled - effectiveDR);
    let woundingMod = 1;
    if (selectedModRadio) { if (selectedModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } else { woundingMod = parseFloat(selectedModRadio.value) || 1; } }
    if (toleranceType === "nao-vivo") { const table = { "perf": 1, "pi": 1 / 3, "pi-": 0.2, "pi+": 0.5, "pi++": 1 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Não Vivo (mod. ajustado)"); } }
    if (toleranceType === "homogeneo") { const table = { "perf": 0.5, "pi": 0.2, "pi-": 0.1, "pi+": 1 / 3, "pi++": 0.5 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Homogêneo (mod. ajustado)"); } }
    if (toleranceType === "difuso") { woundingMod = 1; effects.push("⚙️ Tolerância: Difuso (lesão máx. = 1)"); }
    let finalInjury = Math.floor(penetratingDamage * woundingMod);
    if (toleranceType === "difuso") finalInjury = Math.min(1, finalInjury);
    if (effectsOnlyChecked) { finalInjury = 0; } // Zera a lesão se a opção estiver marcada

    const selectedLocationLabel = form.querySelector('.location-row.active .label')?.textContent || '(Selecione)';
    const drDisplay = (armorDivisor && armorDivisor !== 1) ? `${selectedLocationDR} ÷ ${armorDivisor} = ${effectiveDR}` : `${selectedLocationDR}`;
    let modName = '';
        if (selectedModRadio) {
            // Pega o texto da linha inteira do radio button selecionado
            const selectedRowText = selectedModRadio.closest('.wounding-row')?.textContent || '';

            if (selectedModRadio.value === 'custom') {
                modName = 'outros mod.';
            } else if (selectedRowText.includes('Sem Modificador')) {
                // Agora checamos pelo texto, que é único para esta opção
                modName = 'sem mod.';
            } else {
                // Para todos os outros, extrai a abreviação dos parênteses
                modName = selectedRowText.match(/\(([^)]+)\)/)?.[1] || 'mod';
            }
        }
    const field = (sel) => form.querySelector(`[data-field="${sel}"]`);
    if (field("base_damage_note")) { if (halfDamageChecked && explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ 2 ÷ ${3 * explosionDistance} = ${modifiedBase}`; } else if (halfDamageChecked) { field("base_damage_note").textContent = `÷ 2 = ${modifiedBase}`; } else if (explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ ${3 * explosionDistance} = ${modifiedBase}`; } else { field("base_damage_note").textContent = ''; } }
    if (field("damage_rolled")) field("damage_rolled").textContent = damageRolled;
    if (field("target_dr")) field("target_dr").textContent = `${drDisplay} (${selectedLocationLabel})`;
    if (field("armor_divisor")) field("armor_divisor").textContent = armorDivisor;
    if (field("penetrating_damage")) field("penetrating_damage").textContent = penetratingDamage;
    if (field("wounding_mod")) field("wounding_mod").textContent = `x${woundingMod} (${modName})`;
    if (field("final_injury")) field("final_injury").textContent = finalInjury;
    const effectsList = form.querySelector(".effects-list");
    if (effectsList) { effectsList.innerHTML = ""; for (let effect of effects) { effectsList.innerHTML += `<li>${effect}</li>`; } }
    this.finalInjury = finalInjury;

    // --- ✅ BLOCO DE FEEDBACK E NOTAS (VERSÃO UNIFICADA E CORRIGIDA) ---
    const notesContainer = form.querySelector(".calculation-notes");
    const injuryLabel = form.querySelector(".final-injury-compact label");
    const injuryValue = form.querySelector(".final-injury-compact span");
    let notesHtml = "";

    if (effectsOnlyChecked) {
        notesHtml += `<li class="feedback-note">Apenas efeitos serão aplicados.</li>`;
    }
    if (applyAsHeal) {
    notesHtml += `<li class="feedback-note">O valor final será aplicada como restauração.</li>`;
    if (injuryLabel) {
        injuryLabel.textContent = "Restauração";
        injuryLabel.style.color = "#3b7d3b"; // ✅ Cor do label adicionada
    }
    if (injuryValue) injuryValue.style.color = "#3b7d3b"; // Verde
    } else {
    // Garante que volta ao normal se a caixa for desmarcada
    if (injuryLabel) {
        injuryLabel.textContent = "Lesão";
        injuryLabel.style.color = "#c53434"; // ✅ Cor do label resetada
    }
    if (injuryValue) injuryValue.style.color = "#c53434"; // Vermelho
    }

    if (halfDamageChecked) { notesHtml += `<li>1/2D: Dano base reduzido.</li>`; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); notesHtml += `<li>Explosão: Dano dividido por ${divisor}.</li>`; }
    if (toleranceType) { const toleranceName = { "nao-vivo": "Não Vivo", "homogeneo": "Homogêneo", "difuso": "Difuso"}[toleranceType]; notesHtml += `<li>Tolerância: ${toleranceName} aplicada.</li>`; }

    if (notesContainer) { notesContainer.innerHTML = notesHtml ? `<ul>${notesHtml}</ul>` : ""; }
    
    // --- LÓGICA DE PREVIEW DE EFEITOS "AO CAUSAR DANO" ---
    const effectsSummaryEl = form.querySelector(".effects-summary");
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
        const chanceText = effect.activationChance < 100 ? `Chance: ${effect.activationChance}%` : null;
        const reqTexts = [];
        if (effect.minInjury) reqTexts.push(`Lesão mín. ${effect.minInjury}`);
        if (requiredType) reqTexts.push(`Tipo: ${requiredType.toUpperCase()}`);
        const disabledAttr = meetsRequirements ? "" : "disabled";
        const statusText = !meetsRequirements ? "Requisitos não atendidos" : requiresResistance ? "Requer teste de resistência" : "Aplicação direta";
        const resistanceClass = requiresResistance ? "eff-type" : "eff-type muted";
        const resistanceStatus = effectState.resistanceResult
            ? effectState.resistanceResult.shouldApply
                ? "Aplicável"
                : "Bloqueado"
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
            ? `(Teste de ${resistanceData.attribute.toUpperCase()})`
            : "(Automático)";

        const resistanceResultText = effectState.resistanceResult?.resultText
            ? `<div class="eff-status">${effectState.resistanceResult.resultText}</div>`
            : "";

        potentialEffectsHTML += `
            <div class="effect-card ${meetsRequirements ? '' : 'disabled'}" data-effect-id="${effect.id}">
                <label class="custom-checkbox">
                    <input type="checkbox" class="contingent-effect-toggle" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                    <span>${effect.item?.name || "Efeito desconhecido"}</span>
                </label>
                <div class="${resistanceClass}">
                    ${resistanceRollText} ${chanceText ? `• ${chanceText}` : ''}
                </div>
                ${reqTexts.length ? `<div class="eff-meta">${reqTexts.join(" • ")}</div>` : ''}
                <div class="eff-meta">${resistanceStatus}</div>
                ${requiresResistance ? `<a class="npc-resistance-roll" data-effect-id="${effect.id}" title="Rolar para o alvo"><i class="fas fa-dice-d20"></i></a>` : ''}
                ${resistanceResultText}
            </div>
        `;
    }

    effectsSummaryEl.innerHTML = hasPotentialEffects ? potentialEffectsHTML : `<div class="placeholder">Nenhum efeito adicional</div>`;
    const proposeButton = actionButtonsEl.querySelector('button[data-action="proposeTests"]');
    if (proposeButton) {
        proposeButton.disabled = false;
        proposeButton.textContent = "Propor Testes";
        if (needsResistanceRoll) { proposeButton.style.display = 'inline-block'; } else { proposeButton.style.display = 'none'; }
    }
}
    
        _onProposeTests(form) {
        const effectsNeedingRoll = (this.availableOnDamageEffects || []).filter(e => {
            const state = this.effectState[e.id];
            return e.requiresResistance && e.meetsRequirements && state?.checked && !state.resistanceResult;
        });

        if (effectsNeedingRoll.length === 0) {
            return ui.notifications.info("Nenhum efeito com resistência selecionado.");
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
        const target = this.targetActor;
        let baseAttributeValue = getProperty(target.system.attributes, `${rollData.attribute}.final`) || 10;
        let totalModifier = parseInt(rollData.modifier) || 0;
        if (rollData.dynamicModifier) {
            try { totalModifier += Function("actor", "event", `return (${rollData.dynamicModifier})`)(target, { damage: this.finalInjury, target, attacker: this.attackerActor }); } catch(e) { console.warn(`GUM | Erro ao avaliar modificador dinâmico:`, e); }
        }
        const finalTarget = baseAttributeValue + totalModifier;
        const roll = new Roll("3d6");
        await roll.evaluate();
        const success = roll.total <= finalTarget;
        const shouldApply = (rollData.applyOn || 'failure') === 'success' ? success : !success;
        const resultText = `<strong>Rolagem de NPC (${(rollData.attribute || "HT").toUpperCase()}):</strong> ${roll.total} vs ${finalTarget} - ${success ? "<span style='color: green;'>SUCESSO</span>" : "<span style='color: red;'>FALHA</span>"}`;
        await this.updateEffectCard(effectId, { isSuccess: success, shouldApply, resultText }, effect.item.system);
        ChatMessage.create({ content: resultText, whisper: ChatMessage.getWhisperRecipients("GM") });
    }
    
      async _applyShockEffect(injury) {
        if (!this.targetActor || !game.combat) return 0;

        const injuryAmount = Math.max(0, Math.floor(Number(injury) || 0));
        const shockIncrement = Math.min(4, injuryAmount);
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
            name: `Choque (-${nextShockValue})`,
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

    async _onApplyDamage(form, shouldClose, shouldPublish) {
        const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
        if (this.isApplying) return;
        this.isApplying = true;
        try {
            const finalInjury = this.finalInjury || 0;
            const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
            const applyShock = form.querySelector('[name="special_apply_shock"]')?.checked ?? true;
            const selectedPoolPath = form.querySelector('[name="damage_target_pool"]').value;
            if (!selectedPoolPath) { this.isApplying = false; return ui.notifications.error("Nenhum alvo para o dano foi selecionado."); }
            const currentPoolValue = foundry.utils.getProperty(this.targetActor, selectedPoolPath);
            let eventData = null;

            if (!applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                const damagePayload = {
                    total: finalInjury,
                    value: finalInjury,
                    amount: finalInjury,
                    valueOf() { return finalInjury; },
                    toString() { return String(finalInjury); }
                };
                eventData = {
                    type: "damage",
                    damage: damagePayload,
                    injury: finalInjury,
                    damageType: this.damageTypeAbrev
                };
                const newPoolValue = currentPoolValue - finalInjury;
                await this.targetActor.update({ [selectedPoolPath]: newPoolValue }, { gumEventData: eventData });
            } else {
                const sign = applyAsHeal ? 1 : -1;
                const newPoolValue = currentPoolValue + (sign * finalInjury);
                await this.targetActor.update({ [selectedPoolPath]: newPoolValue });
            }

           const appliedEffectNames = [];
            const pendingEffectNames = [];
            let shockAppliedValue = 0;
            const pendingResistanceQueue = [];
            let pendingResistance = false;
            const effectTargets = this._resolveEffectTargets();
            for (const effect of this.availableOnDamageEffects || []) {
                const state = this.effectState[effect.id];
                if (!state?.checked || !effect.meetsRequirements || !effect.item) continue;

                if (effect.activationChance < 100) {
                    const chanceRoll = await (new Roll("1d100")).evaluate({ async: true });
                    state.activationRoll = chanceRoll.total;
                    if (chanceRoll.total > effect.activationChance) continue;
                }

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
                }

                if (effectTargets.length > 0) {
                    await applySingleEffect(effect.item, effectTargets, { actor: this.attackerActor, origin: effect.item });
                    appliedEffectNames.push(effect.item.name);
                    state.applied = true;
                    this.pendingResistanceEffects.delete(effect.id);
                }
            }
                if (applyShock && !applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                shockAppliedValue = await this._applyShockEffect(finalInjury);
                if (shockAppliedValue > 0) {
                    appliedEffectNames.push(`Choque (-${shockAppliedValue})`);
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
                ui.notifications.info("Efeitos com resistência precisam de teste antes de serem aplicados. As solicitações foram enviadas para o chat.");
            }

if (shouldPublish) {
    const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;
    let resultLine = '';

    if (applyAsHeal && finalInjury > 0) {
        resultLine = `<p>Recuperou <strong>${finalInjury} em ${poolLabel}</strong>.</p>`;
    } else if (finalInjury > 0 && !effectsOnlyChecked) {
        resultLine = `<p>Sofreu <strong>${finalInjury} de lesão</strong> em ${poolLabel}.</p>`;
    } else if (!applyAsHeal && finalInjury <= 0 && !effectsOnlyChecked) {
        resultLine = `<p>O ataque não ultrapassou a resistência a dano do alvo.</p>`;
    }

    // Monta o HTML final com a nova estrutura de texto
    let messageContent = `
        <div class="gurps-roll-card">
            <header class="card-header">
                <h3>Resumo do Ataque</h3>
            </header>
            <div class="card-content">
                <div class="summary-actors vertical">
                    <div class="actor-line">
                        <img src="${this.attackerActor.img}" class="actor-token-icon">
                        <strong>${this.attackerActor.name}</strong>
                    </div>
                    <div class="arrow-line">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="actor-line">
                        <img src="${this.targetActor.img}" class="actor-token-icon">
                        <strong>${this.targetActor.name}</strong>
                    </div>
                </div>

                 ${resultLine ? `
                <div class="minicard result-card">
                    <div class="minicard-title">Resultado</div>
                    ${resultLine}
                </div>
                ` : ''}

                ${appliedEffectNames.length > 0 || contingentApplied.length > 0 ? `
                <div class="minicard effects-card">
                    <div class="minicard-title">Efeitos Aplicados</div>
                    ${[...appliedEffectNames, ...contingentApplied].map(name => `<p><strong>${name}</strong></p>`).join('')}
                </div>
                ` : ''}

                ${pendingEffectNames.length > 0 ? `
                <div class="minicard pending-card">
                    <div class="minicard-title">Efeitos Pendentes</div>
                    <p>Aguardando teste de resistência:</p>
                    ${pendingEffectNames.map(name => `<p><strong>${name}</strong></p>`).join('')}
                </div>
                ` : ''}
            </div>
        </div>
    `;


    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }),
        content: messageContent
    });
}

            for (const effect of pendingResistanceQueue) {
                await this._promptResistanceRoll(effect);
            }

            if (shouldClose) { this.close(); }
        } finally {
            this.isApplying = false;
        }
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

    async updateEffectCard(effectId, rollResult, effectSystem) {
        if (!effectId) return;
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
                statusEl.textContent = rollResult.resultText || (shouldApply ? "Aplicável" : "Bloqueado");
            }
        }

        if (shouldApply) {
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
        await applySingleEffect(effect.item, effectTargets, { actor: this.attackerActor, origin: effect.item });
        state.applied = true;
        ui.notifications.info(`Efeito aplicado: ${effect.item.name}`);
    }

    async _promptResistanceRoll(effect) {
        if (!effect?.item) return;
        const rollData = effect.item.system?.resistanceRoll || {};
        const target = this.targetActor;
        const targetToken = this.targetActor?.getActiveTokens?.()[0] || null;
        const applyOnText = rollData.applyOn === 'success' ? 'Aplicar em Sucesso' : 'Aplicar em Falha';
        const marginValue = (rollData.margin !== undefined && rollData.margin !== null && rollData.margin !== '') ? rollData.margin : '—';
        const modifierValue = rollData.modifier ? `${rollData.modifier >= 0 ? '+' : ''}${rollData.modifier}` : '0';
        const modifierClass = rollData.modifier > 0 ? 'positive' : rollData.modifier < 0 ? 'negative' : 'neutral';

        const chatPayload = {
            mode: "damage",
            targetActorId: target?.id || null,
            targetTokenId: targetToken?.id || null,
            effectItemData: effect.item.toObject(),
            sourceActorId: this.attackerActor?.id || null,
            effectLinkId: effect.id,
            originItemUuid: effect.originItemUuid || null
        };

        const content = `
            <div class="gurps-roll-card resistance-roll-card roll-pending">
                <header class="card-header">
                    <div class="header-left">
                        <div class="header-icon"><img src="${effect.item.img}"></div>
                        <div class="header-title">
                            <h3>Teste de Resistência Necessário</h3>
                            <small>${effect.item.name}</small>
                        </div>
                    </div>
                </header>
                <div class="card-content">
                    <div class="resistance-info">
                        <div class="info-row">
                            <span class="label">Alvo</span>
                            <span class="value with-img">
                                <img src="${target?.img || targetToken?.document?.texture?.src}" class="actor-token-icon">
                                ${target?.name || "Alvo"}
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="label">Atributo</span>
                            <span class="value">${(rollData.attribute || "HT").toUpperCase()} ${modifierValue !== '0' ? `<small class="${modifierClass}">(${modifierValue})</small>` : ''}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Aplicar em</span>
                            <span class="value">${applyOnText}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Margem mín.</span>
                            <span class="value">${marginValue}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button type="button" class="resistance-roll-button" data-roll-data='${JSON.stringify(chatPayload)}'>
                            <i class="fas fa-dice-d6"></i> Rolar Resistência
                        </button>
                    </div>
                </div>
            </div>
        `;

        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content });
    }
    
    _getAdjustedWoundingModifiers(locationKey) {
        // ... (Seu método _getAdjustedWoundingModifiers, sem alterações)
        const baseMods = [ { group: 1, type: "Corte", abrev: "cort", mult: 1.5 }, { group: 1, type: "Perfuração", abrev: "perf", mult: 2 }, { group: 1, type: "Contusão", abrev: "cont", mult: 1 }, { group: 2, type: "Queimadura", abrev: "qmd", mult: 1 }, { group: 2, type: "Corrosão", abrev: "cor", mult: 1 }, { group: 2, type: "Toxina", abrev: "tox", mult: 1 }, { group: 3, type: "Perfurante", abrev: "pi", mult: 1 }, { group: 3, type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 }, { group: 3, type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { group: 3, type: "Ext. Perfurante", abrev: "pi++", mult: 2 }, ];
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
        if (this.pendingResistanceEffects.size === 0 && game.gum?.activeDamageApplication === this) {
            delete game.gum.activeDamageApplication;
        }
        return super.close(options);
    }
}