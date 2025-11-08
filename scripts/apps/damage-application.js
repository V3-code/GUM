import { applySingleEffect } from '../effects-engine.js';

export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
        this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        
        this.effectState = {};
        this.isApplying = false;

        // ✅ MUDANÇA 1: Adiciona a "memória" para os testes de resistência.
        this.testsProposed = false; 

        // ✅ MUDANÇA 2: Define o título dinâmico aqui, no local correto.
        this.options.title = `Aplicar Dano em ${this.targetActor?.name || "Alvo"}`;

    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            // ✅ MUDANÇA 2: O título aqui agora é genérico.
            title: `Aplicar Dano`, 
            template: "systems/gum/templates/apps/damage-application.hbs",
            classes: ["dialog", "gurps", "damage-application-dialog"],
            width: 760,
            height: "auto",
            resizable: true,
            buttons: {}
        });
    }

        /**
     * ✅ Esta função é chamada quando a janela é renderizada.
     * Ela se registra como a janela de dano ativa.
     */
    async _render(force, options) {
        await super._render(force, options);
        game.gum.activeDamageApplication = this;
    }
    
    /**
     * ✅ Esta função é chamada quando a janela é fechada.
     * Ela se desregistra para limpar a referência.
     */
    async close(options) {
        delete game.gum.activeDamageApplication;
        return super.close(options);
    }

    async getData() {
        const context = await super.getData();
        context.damage = this.damageData;
        context.attacker = this.attackerActor;
        context.target = this.targetActor;
        const damageablePools = [];
        damageablePools.push({ path: 'system.attributes.hp.value', label: `Pontos de Vida (PV)` });
        damageablePools.push({ path: 'system.attributes.fp.value', label: `Pontos de Fadiga (PF)` });
        const combatMeters = this.targetActor.system.combat.combat_meters || {};
        for (const [key, meter] of Object.entries(combatMeters)) { damageablePools.push({ path: `system.combat.combat_meters.${key}.current`, label: meter.name }); }
        const spellReserves = this.targetActor.system.spell_reserves || {};
        for (const [key, reserve] of Object.entries(spellReserves)) { damageablePools.push({ path: `system.spell_reserves.${key}.current`, label: `RM:${reserve.name}` }); }
        const powerReserves = this.targetActor.system.power_reserves || {};
        for (const [key, reserve] of Object.entries(powerReserves)) { damageablePools.push({ path: `system.power_reserves.${key}.current`, label: `RP:${reserve.name}` }); }
        context.damageablePools = damageablePools;
        
// 1. Definição base dos locais (com chaves no PLURAL para corresponder ao main.js)
        const locationsData = { 
            "head": { label: "Crânio", roll: "3-4", dr: 0 }, 
            "face": { label: "Rosto", roll: "5", dr: 0 }, 
            "legs": { label: "Perna", roll: "6-7, 13-14", dr: 0 }, // ✅ CORRIGIDO: legs
            "arms": { label: "Braço", roll: "8, 12", dr: 0 },     // ✅ CORRIGIDO: arms
            "torso": { label: "Torso", roll: "9-11", dr: 0 }, 
            "groin": { label: "Virilha", roll: "11", dr: 0 }, 
            "vitals": { label: "Órg. Vitais", roll: "--", dr: 0 }, 
            "hands": { label: "Mão", roll: "15", dr: 0 },    // ✅ CORRIGIDO: hands
            "feet": { label: "Pé", roll: "16", dr: 0 },     // ✅ CORRIGIDO: feet
            "neck": { label: "Pescoço", roll: "17-18", dr: 0 }, 
            "eyes": { label: "Olhos", roll: "--", dr: 0 } 
        };
        locationsData["custom"] = { label: "Outro", roll: "--", dr: 0, custom: true };

        // 2. Pega a DR FINAL já calculada pelo Ator (esta parte estava correta)
        //    (Isto já inclui armadura + drMods + drTempMods)
        const finalActorDR = this.targetActor.system.combat.dr_locations || {};

        // 3. Alimenta o 'locationsData.dr' com os valores finais.
        for (const [key, data] of Object.entries(locationsData)) {
            // Agora, a chave 'arms' (da janela) vai bater com a 'arms' (do ator)
            if (key !== "custom" && finalActorDR[key] !== undefined) {
                data.dr = parseInt(finalActorDR[key]) || 0;
            }
        }
        
        // 4. Prepara para o template
        context.locations = Object.entries(locationsData).map(([key, data]) => { 
            data.key = key; 
            data.totalDR = data.dr; // 'totalDR' agora está correto
            return data; 
        });
        context.locations.sort((a, b) => { const firstRollA = parseInt(a.roll.split(/[,-]/)[0]); const firstRollB = parseInt(b.roll.split(/[,-]/)[0]); if (isNaN(firstRollA)) return 1; if (isNaN(firstRollB)) return -1; return firstRollA - firstRollB; });        
        
        const mainDamageType = this.damageData.main?.type?.toLowerCase() || '';
        const woundingModifiersList = [ { type: "Queimadura", abrev: "qmd", mult: 1 }, { type: "Corrosão", abrev: "cor", mult: 1 }, { type: "Toxina", abrev: "tox", mult: 1 }, { type: "Contusão", abrev: "cont", mult: 1 }, { type: "Corte", abrev: "cort", mult: 1.5 }, { type: "Perfuração", abrev: "perf", mult: 2 }, { type: "Perfurante", abrev: "pi", mult: 1 }, { type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 }, { type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { type: "Ext. Perfurante", abrev: "pi++", mult: 2 } ];
        let defaultModFound = false;
        context.woundingModifiers = woundingModifiersList.map(mod => { mod.checked = (mod.abrev === mainDamageType); if (mod.checked) defaultModFound = true; return mod; });
        context.noModChecked = !defaultModFound;
        return context;
    }

/**
 * [VERSÃO 2.0] Gera um nome descritivo para um objeto de efeito.
 */
getEffectDescription(effectData) {
    switch (effectData.type) {
        case 'status':
            // Pega o nome amigável do status, em vez do ID.
            const status = CONFIG.statusEffects.find(s => s.id === effectData.statusId);
            return `Status: ${status ? status.name : (effectData.statusId || 'desconhecido')}`;
        case 'attribute':
            const behavior = effectData.behavior === 'instant' ? ' (Pontual)' : ' (Contínuo)';
            return `Atributo: ${effectData.path?.split('.').pop() || ''} ${effectData.operation || ''} ${effectData.value || ''}${behavior}`;
        case 'resource_change':
            const op = parseFloat(effectData.value) >= 0 ? '+' : '';
            return `Recurso: ${effectData.category} (${op}${effectData.value})`;
        case 'chat':
            return `Mensagem no Chat`;
        case 'macro':
            return `Macro: ${effectData.value || 'desconhecida'}`;
        case 'flag':
            return `Flag: ${effectData.key || 'desconhecida'}`;
        default:
            return effectData.name || 'Efeito Desconhecido';
    }
}

activateListeners(html) {
    super.activateListeners(html);
    const form = html[0];
    this.formElement = form; 

    html.on('click', '.view-original-item', async (ev) => {
        ev.preventDefault();
        const uuid = ev.currentTarget.dataset.uuid;
        if (uuid) {
            const item = await fromUuid(uuid);
            if (item && item.sheet) {
                item.sheet.render(true);
            } else {
                ui.notifications.warn("Item original não encontrado.");
            }
        }
    });

    // ==========================================================
    // SEU BLOCO DE LISTENERS ORIGINAL (100% PRESERVADO)
    // ==========================================================
    form.querySelectorAll('.damage-card').forEach(card => {
        card.addEventListener('click', ev => {
            form.querySelectorAll('.damage-card.active').forEach(c => c.classList.remove('active'));
            ev.currentTarget.classList.add('active');
            const damageType = ev.currentTarget.querySelector('.damage-label')?.textContent?.match(/[a-zA-Z+]+/)?.[0];
            if (damageType) {
                const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                let matched = false;
                allRadios.forEach(r => {
                    const label = r.closest('.wounding-row')?.textContent;
                    if (label?.toLowerCase().includes(damageType.toLowerCase())) { r.checked = true; matched = true; }
                });
                if (!matched) { const noModRadio = form.querySelector('input[name="wounding_mod_type"][value="1"]'); if (noModRadio) noModRadio.checked = true; }
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
                    const labelSpan = selectedRadio.closest('.wounding-row')?.querySelector('.type'); 
                    selectedAbrev = labelSpan?.textContent?.match(/\(([^)]+)\)/)?.[1] || ''; 
                }
                let htmlContent = newMods.map(mod => `<div class="wounding-row mod-group-${mod.group || 'x'}"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}/><span class="type">${mod.type} (${mod.abrev})</span><span class="dots"></span><span class="mult">x${mod.mult}</span></label></div>`).join('');
                htmlContent += `<hr style="margin-top: 6px; margin-bottom: 6px;">`;
                htmlContent += `<div class="wounding-row"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="1" ${selectedAbrev === '' ? 'checked' : ''}/><span>Sem Modificador</span><span class="dots"></span><span class="mult">x1</span></label></div>`;
                htmlContent += `<div class="wounding-row"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="custom"/><span>Outros Mod.:</span><input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/></label></div>`;
                modTable.innerHTML = htmlContent;
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

    // ==========================================================
    // BOTÕES DE AÇÃO (ANTIGOS E NOVOS)
    // ==========================================================
    html.find('button[data-action="proposeTests"]').on('click', () => this._onProposeTests(form));
    html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
    html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
    html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
    
    // ==========================================================
    // ✅ NOVOS LISTENERS PARA O PAINEL INTERATIVO (ADICIONADOS)
    // ==========================================================
    
       html.on('change', '.apply-effect-checkbox', (ev) => this._onToggleEffect(ev, form));
    
    html.on('click', '.propose-resistance-roll', (ev) => this._onProposeIndividualTest(ev, form));


    // ==========================================================
    // Listeners para CheckBoxes
    // ==========================================================
        html.on('change', '.gcs-checkbox', (ev) => {
        const checkbox = $(ev.currentTarget);
        const label = checkbox.closest('.custom-checkbox');
        // Adiciona ou remove a classe .is-checked na label pai com base no estado do checkbox
        label.toggleClass('is-checked', checkbox.prop('checked'));
    });

    // Força uma checagem inicial para que os checkboxes já marcados apareçam corretamente
    html.find('.gcs-checkbox').trigger('change');
        // --- Disparo Inicial (Preservando sua lógica) ---
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
    let selectedLocationDR = 0;
    const activeRow = form.querySelector('.location-row.active');
    if (activeRow) { if (activeRow.dataset.locationKey === 'custom') { const customInput = activeRow.querySelector('input[name="custom_dr"]'); selectedLocationDR = parseInt(customInput?.value || 0); } else { selectedLocationDR = parseInt(activeRow.dataset.dr || 0); } }
    const ignoreDR = form.querySelector('[name="ignore_dr"]')?.checked;
    
    const effectiveDR = ignoreDR ? 0 : Math.floor(selectedLocationDR / armorDivisor);
    let penetratingDamage = Math.max(0, damageRolled - effectiveDR);
    let selectedModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
    let woundingMod = 1;
    if (selectedModRadio) { if (selectedModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } else { woundingMod = parseFloat(selectedModRadio.value) || 1; } }
    const damageAbrev = selectedModRadio?.closest('.wounding-row')?.querySelector('.type')?.textContent?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '';
    this.damageTypeAbrev = damageAbrev;
    if (toleranceType === "nao-vivo") { const table = { "perf": 1, "pi": 1 / 3, "pi-": 0.2, "pi+": 0.5, "pi++": 1 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Não Vivo (mod. ajustado)"); } }
    if (toleranceType === "homogeneo") { const table = { "perf": 0.5, "pi": 0.2, "pi-": 0.1, "pi+": 1 / 3, "pi++": 0.5 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Homogêneo (mod. ajustado)"); } }
    if (toleranceType === "difuso") { woundingMod = 1; effects.push("⚙️ Tolerância: Difuso (lesão máx. = 1)"); }
       let finalInjury = Math.floor(penetratingDamage * woundingMod);
    if (toleranceType === "difuso") finalInjury = Math.min(1, finalInjury);

    // ✅ **PASSO 1**: Armazenamos a lesão *potencial* em uma variável separada.
    const injuryForEventCheck = finalInjury;

    // ✅ **PASSO 2**: Modificamos a `finalInjury` (que será aplicada) APENAS se a caixa estiver marcada.
    if (effectsOnlyChecked) {
        finalInjury = 0;
    }
    
    this.finalInjury = finalInjury;    

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
 

    // ✅ Bloco de Feedback e Notas (Seu código original, mantido e correto)
    const notesContainer = form.querySelector(".calculation-notes");
    const injuryLabel = form.querySelector(".final-injury-compact label");
    const injuryValue = form.querySelector(".final-injury-compact span");
    let notesHtml = "";

    if (effectsOnlyChecked) {
        notesHtml += `<li class="feedback-note">Apenas efeitos serão aplicados.</li>`;
    }
    if (applyAsHeal) {
        notesHtml += `<li class="feedback-note">O valor final será aplicada como restauração.</li>`;
        if (injuryLabel) { injuryLabel.textContent = "Restauração"; injuryLabel.style.color = "#3b7d3b"; }
        if (injuryValue) { injuryValue.style.color = "#3b7d3b"; }
    } else {
        if (injuryLabel) { injuryLabel.textContent = "Lesão"; injuryLabel.style.color = "#c53434"; }
        if (injuryValue) { injuryValue.style.color = "#c53434"; }
    }

    if (halfDamageChecked) { notesHtml += `<li>1/2D: Dano base reduzido.</li>`; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); notesHtml += `<li>Explosão: Dano dividido por ${divisor}.</li>`; }
    if (toleranceType) { const toleranceName = { "nao-vivo": "Não Vivo", "homogeneo": "Homogêneo", "difuso": "Difuso"}[toleranceType]; notesHtml += `<li>Tolerância: ${toleranceName} aplicada.</li>`; }

    if (notesContainer) { notesContainer.innerHTML = notesHtml ? `<ul>${notesHtml}</ul>` : ""; }


    // =========================================================================
    // PARTE FINAL: COLETA E RENDERIZAÇÃO DO PAINEL DE EFEITOS (NOVA LÓGICA)
    // =========================================================================
    
    const eventContext = { damage: injuryForEventCheck, target: this.targetActor, attacker: this.attackerActor };
    const potentialEffects = await this._collectPotentialEffects(eventContext);
    
    // Aponta para o painel de efeitos no seu HBS
    const effectsListEl = form.querySelector(".effects-summary");
    let effectsHTML = "";
    let hasResistibleEffect = false;

    if (potentialEffects.length === 0) {
        effectsHTML = `<div class="placeholder">Nenhum efeito adicional</div>`;
    } else {
        for (const effectInfo of potentialEffects) {
    const { linkId, effectData, sourceName, originalItem } = effectInfo;
    if (!this.effectState[linkId]) {
        this.effectState[linkId] = { checked: true, resultText: null, isSuccess: null, effectItem: originalItem, sourceName: sourceName };
    }
    const state = this.effectState[linkId];
    const isResisted = effectData.resistanceRoll?.isResisted;
    if (isResisted && state.checked) hasResistibleEffect = true;

    let displayName = "";
    // Se o item original for um efeito ou resource_change, usamos seu nome diretamente.
    if (['effect', 'resource_change'].includes(originalItem.type)) {
        displayName = originalItem.name;
    } 
    // Se vier de uma Condição, usamos o formato "Nome (Descrição)".
    else {
        displayName = `${sourceName} (${this.getEffectDescription(effectData)})`;
    }

    effectsHTML += `
        <div class="effect-card" data-effect-link-id="${linkId}">
            <div class="effect-main">
                <label class="custom-checkbox ${state.checked ? 'is-checked' : ''}">
                    <input type="checkbox" class="apply-effect-checkbox" ${state.checked ? 'checked' : ''} />
                    <img src="${originalItem.img}" class="effect-icon" title="Origem: ${sourceName}" />
                    <span class="effect-name">${displayName}</span>
                </label>
            </div>
            <div class="effect-status ${state.isSuccess === true ? 'success' : state.isSuccess === false ? 'failure' : ''}">
                ${state.resultText || (isResisted ? `(Pendente: ${effectData.resistanceRoll.attribute.toUpperCase()})` : '(Automático)')}
            </div>
            <div class="effect-controls">
                <a class="view-original-item" title="Ver Item Original" data-uuid="${originalItem.uuid}"><i class="fas fa-eye"></i></a>
                ${isResisted ? `<button type="button" class="propose-resistance-roll" data-effect-link-id="${linkId}"><i class="fas fa-dice-d20"></i></button>` : ''}
            </div>
        </div>`;
}
    }
    effectsListEl.innerHTML = effectsHTML;
    
    const proposeButton = form.querySelector('button[data-action="proposeTests"]');
    if (proposeButton) {
        // Apenas controla a visibilidade e se o botão está habilitado
        proposeButton.style.display = hasResistibleEffect ? 'inline-block' : 'none';
        proposeButton.disabled = this.testsProposed;
    }
}

// Versão final e limpa.
async _collectPotentialEffects(eventContext) {
    const potentialEffects = [];
    const processedConditionUuids = new Set(); 

    // Passada 1: Processa a lista específica "Ao Causar Dano"
    const onDamageEffects = this.damageData.onDamageEffects || {};
    for (const [id, linkData] of Object.entries(onDamageEffects)) {
        const itemUuid = linkData.effectUuid || linkData.uuid;
        if (!itemUuid) continue;
        const linkedItem = await fromUuid(itemUuid);
        if (!linkedItem) continue;
        const minInjury = linkData.minInjury || 1;
        if (eventContext.damage >= minInjury) {
            if (['effect', 'resource_change'].includes(linkedItem.type)) {
                potentialEffects.push({ linkId: id, effectData: linkedItem.system, sourceName: this.damageData.sourceName || "Dano Direto", originalItem: linkedItem });
            } else if (linkedItem.type === 'condition') {
                const innerEffectLinks = linkedItem.system.effects || [];
                for (const [i, effectLink] of innerEffectLinks.entries()) {
                    const innerEffectItem = await fromUuid(effectLink.uuid);
                    if (innerEffectItem) {
                        potentialEffects.push({ linkId: `${id}-${i}`, effectData: innerEffectItem.system, sourceName: linkedItem.name, originalItem: innerEffectItem });
                    }
                }
                processedConditionUuids.add(linkedItem.uuid);
            }
        }
    }

    // Passada 2: Processa a lista "Condições Gerais"
    const generalConditions = this.damageData.generalConditions || {};
    for (const [id, linkData] of Object.entries(generalConditions)) {
        const condUuid = linkData.uuid;
        if (!condUuid || processedConditionUuids.has(condUuid)) continue;

        const condItem = await fromUuid(condUuid);
        if (!condItem || !condItem.system.when) continue;
        
        let met = false;
        try { 
            met = Function("actor", "event", `return (${condItem.system.when})`)(this.targetActor, eventContext); 
        } catch(e) {
            console.warn(`GUM | Erro ao avaliar gatilho da Condição Geral '${condItem.name}':`, e);
        }
        
        if (met) {
            const innerEffectLinks = condItem.system.effects || [];
            for (const [i, effectLink] of innerEffectLinks.entries()) {
                const innerEffectItem = await fromUuid(effectLink.uuid);
                if (innerEffectItem) {
                    potentialEffects.push({ 
                        linkId: `${id}-${i}`, 
                        effectData: innerEffectItem.system, 
                        sourceName: condItem.name,
                        originalItem: innerEffectItem
                    });
                }
            }
        }
    }

    return potentialEffects;
}

_onToggleEffect(event, form) { // ✅ CORREÇÃO: Aceita 'form' como um argumento
    const linkId = $(event.currentTarget).closest('.effect-card').data('effect-link-id');
    if (this.effectState[linkId]) {
        this.effectState[linkId].checked = event.currentTarget.checked;
        
        // ✅ CORREÇÃO: Usa a variável 'form' que recebeu para chamar o recálculo
        this._updateDamageCalculation(form);
    }
}

_onProposeIndividualTest(event, form) { // ✅ CORREÇÃO: Aceita 'form' como argumento
    const linkId = $(event.currentTarget).closest('.effect-card').data('effectLinkId');
    const state = this.effectState[linkId];
    if (!state) return;
    
    const potentialInjury = this._calculatePotentialInjury(form); // ✅ CORREÇÃO: Usa o 'form' recebido
    const eventContext = { damage: potentialInjury, target: this.targetActor, attacker: this.attackerActor };
    this._promptResistanceRoll(state.effectItem, state.sourceName, eventContext, linkId);
}

/**
 * Recebe o resultado de um teste de resistência e atualiza a UI.
 * @param {string} effectLinkId - O ID do "card de efeito".
 * @param {object} resultData - Os dados do resultado ({isSuccess, resultText}).
 * @param {object} effectSystemData - Os dados do sistema do efeito que foi rolado.
 */
updateEffectCard(effectLinkId, resultData, effectSystemData) {
    const state = this.effectState[effectLinkId];
    if (!state) {
        console.error(`Estado para o linkId '${effectLinkId}' não encontrado!`);
        return;
    }
    
    // Atualiza o estado interno do efeito com o resultado
    state.resultText = resultData.resultText;
    state.isSuccess = resultData.isSuccess;
    
    // Lógica de conveniência: se o alvo resistiu, desmarca o checkbox
    // ✅ CORREÇÃO AQUI: Lemos a regra de 'resistanceRoll' dos dados do sistema recebidos.
    if (resultData.isSuccess && effectSystemData.resistanceRoll.applyOn === 'failure') {
        state.checked = false;
    }
    
    // Força o redesenho da janela para mostrar o resultado do teste.
    this._updateDamageCalculation(this.element[0]);
}

_calculatePotentialInjury(form) {
    const damageRolled = parseFloat(form.querySelector('[name="damage_rolled"]')?.value) || 0;
    const armorDivisor = parseFloat(form.querySelector('[name="armor_divisor"]')?.value) || 1;
    const activeLocationRow = form.querySelector('.location-row.active');
    let selectedDR = 0;
    if (activeLocationRow) {
        if (activeLocationRow.dataset.locationKey === 'custom') {
            selectedDR = parseInt(activeLocationRow.querySelector('input[name="custom_dr"]')?.value || 0);
        } else {
            selectedDR = parseInt(activeLocationRow.dataset.dr || 0);
        }
    }
    const penetratingDamage = Math.max(0, damageRolled - Math.floor(selectedDR / armorDivisor));
    const woundingModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
    let woundingMod = 1;
    if (woundingModRadio) {
        if (woundingModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } 
        else { woundingMod = parseFloat(woundingModRadio.value) || 1; }
    }
    return Math.floor(penetratingDamage * woundingMod);
}

async _onProposeTests(form) {
    // Impede cliques duplicados se os testes já foram propostos
    if (this.testsProposed) {
        return ui.notifications.warn("Os testes de resistência já foram propostos.");
    }
    
    ui.notifications.info("Enviando propostas de teste para o chat...");

    // ✅ CORREÇÃO: Calcula a lesão potencial para garantir o contexto correto para os testes.
    const potentialInjury = this._calculatePotentialInjury(form);
    const eventContext = { damage: potentialInjury, target: this.targetActor, attacker: this.attackerActor };
    let testsProposedCount = 0;

    // ✅ LÓGICA SIMPLIFICADA: Itera diretamente sobre o estado que já preparamos.
    for (const [linkId, state] of Object.entries(this.effectState)) {
        // Propõe o teste apenas se o efeito estiver marcado E for resistível
        if (state.checked && state.data.resistanceRoll?.isResisted) {
           this._promptResistanceRoll(state.effectItem, state.sourceName, eventContext, linkId);
            testsProposedCount++;
        }
    }

    if (testsProposedCount > 0) {
        this.testsProposed = true; // Marca que os testes foram enviados
        // Atualiza a UI para desabilitar o botão e dar feedback
        const proposeButton = this.element.find('button[data-action="proposeTests"]');
        if (proposeButton.length > 0) {
            proposeButton.prop('disabled', true).html('<i class="fas fa-check"></i> Testes Propostos');
        }
    } else {
        ui.notifications.warn("Nenhum efeito resistível foi encontrado para propor.");
    }
}
    


async _onApplyDamage(form, shouldClose, shouldPublish) {
    if (this.isApplying) return;
    this.isApplying = true;

    try {
        // --- 1. COLETA DE DADOS E APLICAÇÃO DE DANO (Lógica existente) ---
        const finalInjury = this.finalInjury;
        const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
        const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
        const selectedPoolPath = form.querySelector('[name="damage_target_pool"]').value;

        if (!selectedPoolPath) {
            this.isApplying = false;
            return ui.notifications.error("Nenhum alvo para o dano foi selecionado.");
        }

        const currentPoolValue = foundry.utils.getProperty(this.targetActor, selectedPoolPath);
        let updateApplied = false;

        if (!applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
            await this.targetActor.update({ [selectedPoolPath]: currentPoolValue - finalInjury });
            updateApplied = true;
        } else if (applyAsHeal && finalInjury > 0) {
            await this.targetActor.update({ [selectedPoolPath]: currentPoolValue + finalInjury });
            updateApplied = true;
        }

        if (updateApplied) {
            
            if (this.targetActor.sheet.rendered) {
                
                this.targetActor.sheet.render(true);
            }

        }

        // =================================================================
        // ✅ INÍCIO DA NOVA LÓGICA DE PROCESSAMENTO DE EFEITOS
        // =================================================================
        const appliedEffectSources = new Set();
        
        // Itera sobre os efeitos que foram exibidos na janela
        for (const [linkId, state] of Object.entries(this.effectState)) {
            // Aplica apenas os efeitos que o usuário deixou marcados (checked)
            if (state.checked) {
                const effectItem = state.effectItem; // Pega o Item Efeito completo que salvamos
                if (effectItem) {
                    // Chama nosso motor central para aplicar o efeito!
                    await applySingleEffect(effectItem, [this.targetActor.token || this.targetActor.getActiveTokens()[0]], { 
                        actor: this.attackerActor, 
                        origin: this.damageData.sourceItem 
                    });
                    
                    // Adiciona o nome da fonte para o resumo do chat.
                    appliedEffectSources.add(state.sourceName);
                }
            }
        }
        // =================================================================
        // FIM DA NOVA LÓGICA
        // =================================================================

        // --- 3. PUBLICAÇÃO NO CHAT (Lógica existente, agora funciona com os novos dados) ---
        if (shouldPublish) {
            const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;
            let resultLine = '';
            
            if (applyAsHeal && finalInjury > 0) {
                resultLine = `<p>Recuperou <strong>${finalInjury} em ${poolLabel}</strong>.</p>`;
            } else if (finalInjury > 0 && !effectsOnlyChecked) {
                resultLine = `<p>Sofreu <strong>${finalInjury} de lesão</strong> em ${poolLabel}.</p>`;
            } else if (finalInjury === 0 && effectsOnlyChecked && appliedEffectSources.size > 0) {
                resultLine = `<p>Não sofreu lesão, mas foi afetado por condições.</p>`;
            } else if (appliedEffectSources.size === 0 && finalInjury === 0) {
                 resultLine = `<p>O ataque não causou lesão nem aplicou efeitos.</p>`;
            }
            
            let effectsHtml = appliedEffectSources.size > 0
                ? `<div class="minicard effects-card"><div class="minicard-title">Condições Aplicadas</div>${Array.from(appliedEffectSources).map(name => `<p><strong>${name}</strong></p>`).join('')}</div>`
                : '';
            
            let messageContent = `
            <div class="gurps-roll-card">
                <header class="card-header"><h3>Resumo do Ataque</h3></header>
                <div class="card-content">
                    <div class="summary-actors vertical">
                          <div class="actor-line"><img src="${this.attackerActor.img}" class="actor-token-icon"> <strong>${this.attackerActor.name}</strong></div>
                         <div class="arrow-line"><i class="fas fa-arrow-down"></i></div>
                         <div class="actor-line"><img src="${this.targetActor.img}" class="actor-token-icon"> <strong>${this.targetActor.name}</strong></div>
                    </div>
                    ${resultLine ? `<div class="minicard result-card"><div class="minicard-title">Resultado</div>${resultLine}</div>` : ''}
                    ${effectsHtml}
                </div>
            </div>`;

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }),
                content: messageContent
            });
        }

        if (shouldClose) { this.close(); }
    } finally {
        this.isApplying = false;
    }
}


async _promptResistanceRoll(effectItem, sourceName, eventContext, linkId) {
    // A função agora recebe o 'effectItem' completo, não mais 'effectData'.
    const rollData = effectItem.system.resistanceRoll;
    const target = eventContext.target;

    const attributeObject = foundry.utils.getProperty(target.system.attributes, rollData.attribute);
    let baseAttributeValue = 10;

    if (attributeObject) {
        baseAttributeValue = (attributeObject.override !== null && attributeObject.override !== undefined) 
            ? attributeObject.override 
            : attributeObject.final;
    } else {
        console.warn(`GUM | Atributo '${rollData.attribute}' não encontrado no alvo. Usando 10 como padrão.`);
    }
    
    let totalModifier = parseInt(rollData.modifier) || 0;
    const finalTarget = baseAttributeValue + totalModifier;

    const chatButtonPayload = {
        targetActorId: target.id,
        finalTarget: finalTarget,
        // Passamos o 'effectItem' inteiro no payload para ter todos os dados na hora do clique
        effectItemData: effectItem.toObject(), 
        sourceName: sourceName,
        effectLinkId: linkId 
    };

    const content = `
    <div class="gurps-roll-card">
        <header class="card-header"><h3>Proposta de Teste de Resistência</h3></header>
        <div class="card-content">
            <div class="summary-actors vertical" style="padding-bottom: 10px;">
                <div class="actor-line">
                    <img src="${target.img}" class="actor-token-icon"> 
                    <strong>${target.name}</strong>
                </div>
            </div>
            <div class="minicard result-card">
                <div class="minicard-title">Efeito Recebido</div>
                <p>Precisa resistir ao efeito "<strong>${effectItem.name || 'Efeito Desconhecido'}</strong>" de <em>${sourceName}</em>.</p>
                <p>Faça um teste de <strong>${rollData.attribute.toUpperCase()}</strong> (Alvo: ${finalTarget}) para evitar o efeito.</p>
            </div>
        </div>
        <footer class="card-actions">
            <button type="button" class="resistance-roll-button" data-roll-data='${JSON.stringify(chatButtonPayload)}'>
                <i class="fas fa-dice-d6"></i> Rolar Teste (vs ${finalTarget})
            </button>
        </footer>
    </div>
    `;

    ChatMessage.create({ 
        speaker: ChatMessage.getSpeaker({ actor: target }), 
        content: content 
    });
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
}